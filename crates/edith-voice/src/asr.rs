use crate::error::{Result, VoiceError};
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::Mutex;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TranscriptionResult {
    pub text: String,
    pub confidence: f32,
    pub language: String,
    pub is_final: bool,
}

#[async_trait]
pub trait SpeechRecognizer: Send + Sync {
    async fn transcribe(&self, samples: &[i16], sample_rate: u32) -> Result<TranscriptionResult>;
}

/// Helper for encoding raw 16-bit mono PCM into standard 44-byte header WAV buffer.
pub fn encode_wav_mono(samples: &[i16], sample_rate: u32) -> Vec<u8> {
    let num_samples = samples.len() as u32;
    let byte_rate = sample_rate * 2; // 16-bit mono = 2 bytes per sample
    let block_align: u16 = 2;
    let bits_per_sample: u16 = 16;
    let data_len = num_samples * 2;
    let total_len = 36 + data_len;

    let mut wav = Vec::with_capacity(44 + data_len as usize);

    // RIFF header
    wav.extend_from_slice(b"RIFF");
    wav.extend_from_slice(&total_len.to_le_bytes());
    wav.extend_from_slice(b"WAVE");

    // "fmt " subchunk
    wav.extend_from_slice(b"fmt ");
    wav.extend_from_slice(&16u32.to_le_bytes()); // subchunk1 size (16 for PCM)
    wav.extend_from_slice(&1u16.to_le_bytes()); // audio format 1 = PCM
    wav.extend_from_slice(&1u16.to_le_bytes()); // num channels = 1 (mono)
    wav.extend_from_slice(&sample_rate.to_le_bytes());
    wav.extend_from_slice(&byte_rate.to_le_bytes());
    wav.extend_from_slice(&block_align.to_le_bytes());
    wav.extend_from_slice(&bits_per_sample.to_le_bytes());

    // "data" subchunk
    wav.extend_from_slice(b"data");
    wav.extend_from_slice(&data_len.to_le_bytes());

    // PCM samples
    for &sample in samples {
        wav.extend_from_slice(&sample.to_le_bytes());
    }

    wav
}

/// Mock ASR provider for offline unit tests and deterministic simulation.
pub struct MockSpeechRecognizer {
    canned_response: Arc<Mutex<Option<String>>>,
    fixed_confidence: f32,
}

impl Default for MockSpeechRecognizer {
    fn default() -> Self {
        Self {
            canned_response: Arc::new(Mutex::new(None)),
            fixed_confidence: 0.95,
        }
    }
}

impl MockSpeechRecognizer {
    pub fn new(canned_text: Option<String>, confidence: f32) -> Self {
        Self {
            canned_response: Arc::new(Mutex::new(canned_text)),
            fixed_confidence: confidence,
        }
    }

    pub async fn set_next_response(&self, text: String) {
        let mut canned = self.canned_response.lock().await;
        *canned = Some(text);
    }
}

#[async_trait]
impl SpeechRecognizer for MockSpeechRecognizer {
    async fn transcribe(&self, samples: &[i16], sample_rate: u32) -> Result<TranscriptionResult> {
        let mut canned = self.canned_response.lock().await;
        let text = if let Some(txt) = canned.take() {
            txt
        } else {
            let duration_ms = (samples.len() as u64 * 1000) / sample_rate as u64;
            format!("Spoken audio captured: {} samples ({}ms)", samples.len(), duration_ms)
        };

        Ok(TranscriptionResult {
            text,
            confidence: self.fixed_confidence,
            language: "en".to_string(),
            is_final: true,
        })
    }
}

/// HTTP adapter for local whisper.cpp server.
pub struct WhisperCppRecognizer {
    endpoint: String,
    client: reqwest::Client,
}

impl WhisperCppRecognizer {
    pub fn new(endpoint: impl Into<String>) -> Self {
        Self {
            endpoint: endpoint.into(),
            client: reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(10))
                .build()
                .unwrap_or_default(),
        }
    }
}

#[async_trait]
impl SpeechRecognizer for WhisperCppRecognizer {
    async fn transcribe(&self, samples: &[i16], sample_rate: u32) -> Result<TranscriptionResult> {
        let wav_bytes = encode_wav_mono(samples, sample_rate);

        let part = reqwest::multipart::Part::bytes(wav_bytes)
            .file_name("audio.wav")
            .mime_str("audio/wav")
            .map_err(|e| VoiceError::AsrError(format!("Failed to build multipart audio: {e}")))?;

        let form = reqwest::multipart::Form::new()
            .part("file", part)
            .text("temperature", "0.0")
            .text("response_format", "json");

        let response = self
            .client
            .post(format!("{}/inference", self.endpoint.trim_end_matches('/')))
            .multipart(form)
            .send()
            .await
            .map_err(|e| VoiceError::AsrError(format!("whisper.cpp request failed: {e}")))?;

        if !response.status().is_success() {
            let status = response.status();
            let err_body = response.text().await.unwrap_or_default();
            return Err(VoiceError::AsrError(format!(
                "whisper.cpp HTTP error {status}: {err_body}"
            )));
        }

        #[derive(Deserialize)]
        struct WhisperResponse {
            text: String,
        }

        let parsed: WhisperResponse = response
            .json()
            .await
            .map_err(|e| VoiceError::AsrError(format!("Failed to parse whisper response: {e}")))?;

        Ok(TranscriptionResult {
            text: parsed.text.trim().to_string(),
            confidence: 0.90,
            language: "auto".to_string(),
            is_final: true,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_mock_transcribe() {
        let mock = MockSpeechRecognizer::default();
        let samples = vec![100i16; 16000]; // 1 second of audio @ 16 kHz
        let res = mock.transcribe(&samples, 16000).await.unwrap();
        assert_eq!(res.confidence, 0.95);
        assert!(res.text.contains("16000 samples (1000ms)"));

        mock.set_next_response("What is the status of the server?".to_string()).await;
        let res2 = mock.transcribe(&samples, 16000).await.unwrap();
        assert_eq!(res2.text, "What is the status of the server?");
    }

    #[test]
    fn test_encode_wav_mono() {
        let samples = vec![0i16, 100, -100, 200];
        let wav = encode_wav_mono(&samples, 16000);
        assert_eq!(wav.len(), 44 + 8); // 44 byte header + 8 bytes data (4 samples * 2 bytes)
        assert_eq!(&wav[0..4], b"RIFF");
        assert_eq!(&wav[8..12], b"WAVE");
        assert_eq!(&wav[12..16], b"fmt ");
        assert_eq!(&wav[36..40], b"data");
    }
}
