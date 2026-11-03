use crate::audio::AudioMetrics;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum VadEvent {
    None,
    SpeechOnset,
    SpeechContinuous,
    SpeechEndpoint,
}

#[derive(Debug, Clone)]
pub struct VadConfig {
    /// Minimum RMS amplitude considered active speech.
    pub energy_threshold_rms: f32,
    /// Minimum consecutive active speech duration before declaring speech onset (default 150 ms to avoid coughs).
    pub speech_onset_ms: u64,
    /// Continuous silence duration before declaring end of speech (default 700 ms).
    pub silence_timeout_ms: u64,
    /// Duration of each frame in milliseconds (default 30 ms = 480 samples @ 16 kHz).
    pub frame_duration_ms: u64,
}

impl Default for VadConfig {
    fn default() -> Self {
        Self {
            energy_threshold_rms: 400.0,
            speech_onset_ms: 150,
            silence_timeout_ms: 700,
            frame_duration_ms: 30,
        }
    }
}

#[derive(Debug)]
pub struct VoiceActivityDetector {
    config: VadConfig,
    is_speech_active: bool,
    consecutive_active_ms: u64,
    consecutive_silence_ms: u64,
}

impl VoiceActivityDetector {
    pub fn new(config: VadConfig) -> Self {
        Self {
            config,
            is_speech_active: false,
            consecutive_active_ms: 0,
            consecutive_silence_ms: 0,
        }
    }

    pub fn is_speech_active(&self) -> bool {
        self.is_speech_active
    }

    /// Process a PCM frame and evaluate voice activity.
    pub fn process_frame(&mut self, frame: &[i16]) -> VadEvent {
        let rms = AudioMetrics::calculate_rms(frame);
        let is_active = rms >= self.config.energy_threshold_rms;

        if is_active {
            self.consecutive_active_ms += self.config.frame_duration_ms;
            self.consecutive_silence_ms = 0;

            if !self.is_speech_active {
                if self.consecutive_active_ms >= self.config.speech_onset_ms {
                    self.is_speech_active = true;
                    return VadEvent::SpeechOnset;
                }
            } else {
                return VadEvent::SpeechContinuous;
            }
        } else {
            self.consecutive_active_ms = 0;

            if self.is_speech_active {
                self.consecutive_silence_ms += self.config.frame_duration_ms;
                if self.consecutive_silence_ms >= self.config.silence_timeout_ms {
                    self.is_speech_active = false;
                    self.consecutive_silence_ms = 0;
                    return VadEvent::SpeechEndpoint;
                }
                return VadEvent::SpeechContinuous;
            }
        }

        VadEvent::None
    }

    /// Triggers an immediate endpoint (e.g. push-to-talk release).
    pub fn force_endpoint(&mut self) -> VadEvent {
        if self.is_speech_active {
            self.is_speech_active = false;
            self.consecutive_active_ms = 0;
            self.consecutive_silence_ms = 0;
            VadEvent::SpeechEndpoint
        } else {
            VadEvent::None
        }
    }

    /// Resets all internal counters and speech state.
    pub fn reset(&mut self) {
        self.is_speech_active = false;
        self.consecutive_active_ms = 0;
        self.consecutive_silence_ms = 0;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_speech_onset_and_endpoint() {
        let mut vad = VoiceActivityDetector::new(VadConfig {
            energy_threshold_rms: 300.0,
            speech_onset_ms: 90,     // 3 frames of 30 ms
            silence_timeout_ms: 120, // 4 frames of 30 ms
            frame_duration_ms: 30,
        });

        let active_frame = vec![1000i16; 480];
        let silent_frame = vec![0i16; 480];

        // Frame 1: active (30ms) -> None (below 90ms)
        assert_eq!(vad.process_frame(&active_frame), VadEvent::None);
        // Frame 2: active (60ms) -> None
        assert_eq!(vad.process_frame(&active_frame), VadEvent::None);
        // Frame 3: active (90ms) -> SpeechOnset!
        assert_eq!(vad.process_frame(&active_frame), VadEvent::SpeechOnset);
        // Frame 4: active (120ms) -> SpeechContinuous
        assert_eq!(vad.process_frame(&active_frame), VadEvent::SpeechContinuous);

        // Frame 5: silence (30ms) -> SpeechContinuous (still within 120ms timeout)
        assert_eq!(vad.process_frame(&silent_frame), VadEvent::SpeechContinuous);
        // Frame 6: silence (60ms)
        assert_eq!(vad.process_frame(&silent_frame), VadEvent::SpeechContinuous);
        // Frame 7: silence (90ms)
        assert_eq!(vad.process_frame(&silent_frame), VadEvent::SpeechContinuous);
        // Frame 8: silence (120ms) -> SpeechEndpoint!
        assert_eq!(vad.process_frame(&silent_frame), VadEvent::SpeechEndpoint);
        assert!(!vad.is_speech_active());

        // Subsequent silence -> None
        assert_eq!(vad.process_frame(&silent_frame), VadEvent::None);
    }

    #[test]
    fn test_short_burst_rejected() {
        let mut vad = VoiceActivityDetector::new(VadConfig {
            energy_threshold_rms: 300.0,
            speech_onset_ms: 150, // 5 frames
            silence_timeout_ms: 700,
            frame_duration_ms: 30,
        });

        let active_frame = vec![1000i16; 480];
        let silent_frame = vec![0i16; 480];

        // 2 frames (60ms cough) then silence
        assert_eq!(vad.process_frame(&active_frame), VadEvent::None);
        assert_eq!(vad.process_frame(&active_frame), VadEvent::None);
        assert_eq!(vad.process_frame(&silent_frame), VadEvent::None);
        assert!(!vad.is_speech_active());
    }

    #[test]
    fn test_force_endpoint() {
        let mut vad = VoiceActivityDetector::new(VadConfig {
            energy_threshold_rms: 300.0,
            speech_onset_ms: 30,
            silence_timeout_ms: 700,
            frame_duration_ms: 30,
        });

        let active_frame = vec![1000i16; 480];
        assert_eq!(vad.process_frame(&active_frame), VadEvent::SpeechOnset);
        assert!(vad.is_speech_active());

        // Release PTT
        assert_eq!(vad.force_endpoint(), VadEvent::SpeechEndpoint);
        assert!(!vad.is_speech_active());
    }
}
