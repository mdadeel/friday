use crate::audio::{AudioMetrics, AudioRingBuffer};
use crate::barge_in::BargeInController;
use crate::error::{Result, VoiceError};
use crate::segmenter::SentenceSegmenter;
use crate::state::{VoiceState, VoiceStateMachine};
use crate::tts::{AudioData, SpeechSynthesizer};
use crate::vad::{VadConfig, VadEvent, VoiceActivityDetector};
use crate::asr::{SpeechRecognizer, TranscriptionResult};
use edith_core::config::VoiceConfig;
use edith_events::{EventBus, EventEnvelope};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::{Mutex, RwLock};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VoiceStatus {
    pub state: VoiceState,
    pub previous_state: VoiceState,
    pub mic_active: bool,
    pub asr_provider: String,
    pub tts_provider: String,
    pub sample_rate: u32,
    pub last_transition_at: String,
    pub error: Option<String>,
}

pub struct VoiceManager {
    config: VoiceConfig,
    state_machine: Arc<RwLock<VoiceStateMachine>>,
    ring_buffer: Arc<RwLock<AudioRingBuffer>>,
    vad: Arc<Mutex<VoiceActivityDetector>>,
    asr: Arc<dyn SpeechRecognizer>,
    tts: Arc<dyn SpeechSynthesizer>,
    barge_in: Arc<BargeInController>,
    event_bus: Option<EventBus>,
}

impl VoiceManager {
    pub fn new(
        config: VoiceConfig,
        event_bus: Option<EventBus>,
        asr: Arc<dyn SpeechRecognizer>,
        tts: Arc<dyn SpeechSynthesizer>,
    ) -> Self {
        let initial_state = if config.enabled {
            VoiceState::Idle
        } else {
            VoiceState::Off
        };

        // 10 seconds capacity at sample_rate
        let capacity = (10 * config.sample_rate) as usize;
        let vad_config = VadConfig {
            energy_threshold_rms: 400.0,
            speech_onset_ms: config.barge_in_ms, // 150ms onset
            silence_timeout_ms: config.vad_silence_ms, // 700ms endpoint
            frame_duration_ms: 30,
        };

        Self {
            config,
            state_machine: Arc::new(RwLock::new(VoiceStateMachine::new(initial_state))),
            ring_buffer: Arc::new(RwLock::new(AudioRingBuffer::new(capacity))),
            vad: Arc::new(Mutex::new(VoiceActivityDetector::new(vad_config))),
            asr,
            tts,
            barge_in: Arc::new(BargeInController::new()),
            event_bus,
        }
    }

    pub async fn current_state(&self) -> VoiceState {
        self.state_machine.read().await.current()
    }

    pub async fn is_mic_active(&self) -> bool {
        self.state_machine.read().await.is_mic_active()
    }

    pub async fn status(&self) -> VoiceStatus {
        let sm = self.state_machine.read().await;
        VoiceStatus {
            state: sm.current(),
            previous_state: sm.previous(),
            mic_active: sm.is_mic_active(),
            asr_provider: self.config.asr_provider.clone(),
            tts_provider: self.config.tts_provider.clone(),
            sample_rate: self.config.sample_rate,
            last_transition_at: sm.last_transition_at().to_rfc3339(),
            error: sm.error_message().map(ToString::to_string),
        }
    }

    fn emit_event(&self, kind: &str, payload: serde_json::Value) {
        if let Some(bus) = &self.event_bus {
            bus.publish(EventEnvelope::new(kind, payload));
        }
    }

    async fn transition_state(&self, next: VoiceState) -> Result<()> {
        let mut sm = self.state_machine.write().await;
        let prev = sm.current();
        sm.transition_to(next)?;
        let mic_active = sm.is_mic_active();
        drop(sm);

        self.emit_event(
            "voice.state_changed",
            serde_json::json!({
                "previous_state": prev,
                "current_state": next,
                "mic_active": mic_active
            }),
        );
        Ok(())
    }

    /// User starts listening (e.g. push-to-talk press or voice activate).
    pub async fn start_listening(&self) -> Result<()> {
        let curr = self.current_state().await;
        if curr == VoiceState::Off {
            return Err(VoiceError::DeviceUnavailable(
                "Voice subsystem is disabled".to_string(),
            ));
        }

        // Reset buffer and VAD
        self.ring_buffer.write().await.clear();
        self.vad.lock().await.reset();

        self.transition_state(VoiceState::Listening).await?;
        Ok(())
    }

    /// User releases push-to-talk or manually stops listening.
    pub async fn stop_listening(&self) -> Result<Option<TranscriptionResult>> {
        let curr = self.current_state().await;
        if !matches!(curr, VoiceState::Listening | VoiceState::Transcribing) {
            return Ok(None);
        }

        // Force endpoint and process speech
        self.vad.lock().await.force_endpoint();
        self.finalize_speech().await
    }

    /// Cancel active listening/transcribing and return to Idle.
    pub async fn cancel(&self) -> Result<()> {
        self.ring_buffer.write().await.clear();
        self.vad.lock().await.reset();
        self.transition_state(VoiceState::Idle).await?;
        self.emit_event("voice.cancelled", serde_json::json!({}));
        Ok(())
    }

    /// Process an incoming PCM audio frame (typically 30 ms = 480 samples @ 16 kHz).
    pub async fn push_audio_frame(&self, frame: &[i16]) -> Result<Option<TranscriptionResult>> {
        let state = self.current_state().await;

        // Privacy gatekeeper: audio cannot be pushed if microphone is closed
        if !self.state_machine.read().await.is_mic_active() {
            return Err(VoiceError::MicrophoneClosed(state));
        }

        // Append to circular ring buffer
        self.ring_buffer.write().await.push(frame);

        // Publish level meter
        let rms = AudioMetrics::calculate_rms(frame);
        let db = AudioMetrics::calculate_db(rms);
        self.emit_event(
            "voice.level_meter",
            serde_json::json!({
                "rms": rms,
                "db": db,
            }),
        );

        // Check barge-in during Speaking
        if state == VoiceState::Speaking {
            let mut vad = self.vad.lock().await;
            let event = vad.process_frame(frame);
            if matches!(event, VadEvent::SpeechOnset) {
                // Speech onset detected during TTS playback!
                self.barge_in.trigger_barge_in();
                self.emit_event(
                    "voice.barge_in",
                    serde_json::json!({ "reason": "speech_onset_during_playback" }),
                );

                // Transition Speaking -> Interrupted -> Listening
                self.transition_state(VoiceState::Interrupted).await?;
                self.ring_buffer.write().await.clear();
                vad.reset();
                self.transition_state(VoiceState::Listening).await?;
            }
            return Ok(None);
        }

        // Process VAD for listening/transcribing
        let mut vad = self.vad.lock().await;
        let event = vad.process_frame(frame);

        match event {
            VadEvent::SpeechOnset => {
                if state == VoiceState::Listening {
                    self.transition_state(VoiceState::Transcribing).await?;
                    self.emit_event("voice.speech_onset", serde_json::json!({}));
                }
                Ok(None)
            }
            VadEvent::SpeechEndpoint => {
                if state == VoiceState::Transcribing {
                    drop(vad);
                    self.finalize_speech().await
                } else {
                    Ok(None)
                }
            }
            _ => Ok(None),
        }
    }

    /// Finalize speech: run ASR on buffered audio, emit events, and update state machine.
    async fn finalize_speech(&self) -> Result<Option<TranscriptionResult>> {
        self.transition_state(VoiceState::Finalising).await?;
        self.emit_event("voice.speech_endpoint", serde_json::json!({}));

        let samples = self.ring_buffer.read().await.get_all();
        if samples.is_empty() {
            self.transition_state(VoiceState::Idle).await?;
            return Ok(None);
        }

        // Transcribe via ASR
        let result = match self.asr.transcribe(&samples, self.config.sample_rate).await {
            Ok(res) => res,
            Err(e) => {
                self.transition_state(VoiceState::Idle).await?;
                return Err(e);
            }
        };

        // Emit transcription event
        self.emit_event(
            "voice.transcription",
            serde_json::json!({
                "text": result.text,
                "confidence": result.confidence,
                "language": result.language,
                "is_final": result.is_final
            }),
        );

        // Verification rule: if confidence is below 0.40 or empty text, do not dispatch
        if result.text.trim().is_empty() || result.confidence < 0.40 {
            self.transition_state(VoiceState::Idle).await?;
            return Ok(None);
        }

        // Transition: Finalising -> Dispatching -> Thinking
        self.transition_state(VoiceState::Dispatching).await?;
        self.transition_state(VoiceState::Thinking).await?;

        Ok(Some(result))
    }

    /// Synthesize and speak text response with barge-in support.
    pub async fn speak(&self, raw_text: &str) -> Result<AudioData> {
        let clean_text = SentenceSegmenter::prepare_for_speech(raw_text);
        if clean_text.trim().is_empty() {
            return Ok(AudioData {
                pcm_samples: Vec::new(),
                sample_rate: self.config.sample_rate,
                duration_ms: 0,
            });
        }

        self.transition_state(VoiceState::Speaking).await?;
        self.barge_in.start_playback();

        self.emit_event(
            "voice.speech_started",
            serde_json::json!({ "text": clean_text }),
        );

        let audio = match self.tts.synthesize(&clean_text).await {
            Ok(aud) => aud,
            Err(e) => {
                self.barge_in.stop_playback();
                let _ = self.transition_state(VoiceState::Idle).await;
                return Err(e);
            }
        };

        // If barge-in occurred during synthesis/playback, controller flag is tripped
        if self.barge_in.is_interrupted() {
            return Ok(audio);
        }

        self.barge_in.stop_playback();
        let _ = self.transition_state(VoiceState::Idle).await;

        self.emit_event(
            "voice.speech_completed",
            serde_json::json!({ "duration_ms": audio.duration_ms }),
        );

        Ok(audio)
    }

    /// Directly notify voice manager that orchestrator task is completed without speech.
    pub async fn complete_thinking(&self) -> Result<()> {
        let curr = self.current_state().await;
        if curr == VoiceState::Thinking {
            self.transition_state(VoiceState::Idle).await?;
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::asr::MockSpeechRecognizer;
    use crate::tts::MockSpeechSynthesizer;

    #[tokio::test]
    async fn test_voice_manager_ptt_flow() {
        let config = VoiceConfig::default();
        let bus = EventBus::new(16);
        let mut rx = bus.subscribe();

        let asr = Arc::new(MockSpeechRecognizer::new(
            Some("Open Firefox and check GitHub".to_string()),
            0.95,
        ));
        let tts = Arc::new(MockSpeechSynthesizer);

        let manager = VoiceManager::new(config, Some(bus), asr, tts);

        assert_eq!(manager.current_state().await, VoiceState::Idle);
        assert!(!manager.is_mic_active().await);

        // Press PTT
        manager.start_listening().await.unwrap();
        assert_eq!(manager.current_state().await, VoiceState::Listening);
        assert!(manager.is_mic_active().await);

        // Receive state changed event
        let evt = rx.recv().await.unwrap();
        assert_eq!(evt.kind, "voice.state_changed");

        // Push loud audio frames
        let loud_frame = vec![1500i16; 480];
        // 5 frames = 150ms -> SpeechOnset
        for _ in 0..5 {
            let res = manager.push_audio_frame(&loud_frame).await.unwrap();
            assert!(res.is_none());
        }
        assert_eq!(manager.current_state().await, VoiceState::Transcribing);

        // Stop listening (PTT release)
        let final_res = manager.stop_listening().await.unwrap();
        assert!(final_res.is_some());
        let tr = final_res.unwrap();
        assert_eq!(tr.text, "Open Firefox and check GitHub");
        assert_eq!(manager.current_state().await, VoiceState::Thinking);
        assert!(!manager.is_mic_active().await); // Mic closed during thinking!
    }

    #[tokio::test]
    async fn test_voice_manager_barge_in() {
        let config = VoiceConfig::default();
        let asr = Arc::new(MockSpeechRecognizer::default());
        let tts = Arc::new(MockSpeechSynthesizer);

        let manager = VoiceManager::new(config, None, asr, tts);

        // Simulate EDITH speaking
        manager.transition_state(VoiceState::Speaking).await.unwrap();
        manager.barge_in.start_playback();
        assert_eq!(manager.current_state().await, VoiceState::Speaking);
        assert!(manager.is_mic_active().await); // Listening for barge-in

        // Owner speaks over TTS (5 loud frames = 150ms)
        let loud_frame = vec![1500i16; 480];
        for _ in 0..5 {
            manager.push_audio_frame(&loud_frame).await.unwrap();
        }

        // Barge-in must have cancelled playback and transitioned to Listening!
        assert_eq!(manager.current_state().await, VoiceState::Listening);
        assert!(manager.barge_in.is_interrupted());
    }

    #[tokio::test]
    async fn test_mic_privacy_rejected_when_idle() {
        let config = VoiceConfig::default();
        let asr = Arc::new(MockSpeechRecognizer::default());
        let tts = Arc::new(MockSpeechSynthesizer);

        let manager = VoiceManager::new(config, None, asr, tts);
        assert_eq!(manager.current_state().await, VoiceState::Idle);

        let frame = vec![100i16; 480];
        let err = manager.push_audio_frame(&frame).await.unwrap_err();
        assert!(matches!(err, VoiceError::MicrophoneClosed(VoiceState::Idle)));
    }
}
