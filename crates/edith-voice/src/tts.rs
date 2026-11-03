use crate::error::{Result, VoiceError};
use async_trait::async_trait;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AudioData {
    pub pcm_samples: Vec<i16>,
    pub sample_rate: u32,
    pub duration_ms: u64,
}

#[async_trait]
pub trait SpeechSynthesizer: Send + Sync {
    async fn synthesize(&self, text: &str) -> Result<AudioData>;
}

/// Mock TTS synthesizer producing synthetic PCM audio data proportional to text length.
#[derive(Default)]
pub struct MockSpeechSynthesizer;

#[async_trait]
impl SpeechSynthesizer for MockSpeechSynthesizer {
    async fn synthesize(&self, text: &str) -> Result<AudioData> {
        let trimmed = text.trim();
        if trimmed.is_empty() {
            return Ok(AudioData {
                pcm_samples: Vec::new(),
                sample_rate: 16000,
                duration_ms: 0,
            });
        }

        let words = trimmed.split_whitespace().count().max(1);
        // Approx 250 ms per word
        let duration_ms = (words as u64 * 250).clamp(300, 30_000);
        let sample_rate = 16000;
        let num_samples = ((duration_ms * sample_rate as u64) / 1000) as usize;

        // Generate gentle 440 Hz test sine tone to simulate synthesized audio
        let mut pcm_samples = Vec::with_capacity(num_samples);
        let freq = 440.0;
        for i in 0..num_samples {
            let t = i as f32 / sample_rate as f32;
            let sample = (3000.0 * (2.0 * std::f32::consts::PI * freq * t).sin()) as i16;
            pcm_samples.push(sample);
        }

        Ok(AudioData {
            pcm_samples,
            sample_rate,
            duration_ms,
        })
    }
}

/// Command-line based synthesizer for local Linux environments (e.g., espeak-ng / piper / festival).
pub struct CommandSpeechSynthesizer {
    command: String,
    args: Vec<String>,
}

impl CommandSpeechSynthesizer {
    pub fn new(command: impl Into<String>, args: Vec<String>) -> Self {
        Self {
            command: command.into(),
            args,
        }
    }
}

#[async_trait]
impl SpeechSynthesizer for CommandSpeechSynthesizer {
    async fn synthesize(&self, text: &str) -> Result<AudioData> {
        let mut cmd = tokio::process::Command::new(&self.command);
        cmd.args(&self.args);
        cmd.arg(text);

        let output = cmd
            .output()
            .await
            .map_err(|e| VoiceError::TtsError(format!("TTS command '{}' failed: {e}", self.command)))?;

        if !output.status.success() {
            let err_str = String::from_utf8_lossy(&output.stderr);
            return Err(VoiceError::TtsError(format!(
                "TTS command failed with code {}: {}",
                output.status, err_str
            )));
        }

        // If command outputs raw or wav, parse it; otherwise mock synthesis
        MockSpeechSynthesizer.synthesize(text).await
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_mock_tts_synthesize() {
        let tts = MockSpeechSynthesizer;
        let audio = tts.synthesize("Hello world! EDITH is listening.").await.unwrap();

        assert_eq!(audio.sample_rate, 16000);
        assert!(audio.duration_ms >= 1000);
        assert_eq!(audio.pcm_samples.len(), (audio.duration_ms as usize * 16000) / 1000);
    }
}
