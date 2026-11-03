pub mod audio;
pub mod barge_in;
pub mod error;
pub mod manager;
pub mod segmenter;
pub mod state;
pub mod tts;
pub mod vad;
pub mod asr;

pub use audio::{AudioMetrics, AudioRingBuffer};
pub use barge_in::BargeInController;
pub use error::{Result, VoiceError};
pub use manager::{VoiceManager, VoiceStatus};
pub use segmenter::SentenceSegmenter;
pub use state::{VoiceState, VoiceStateMachine};
pub use tts::{AudioData, CommandSpeechSynthesizer, MockSpeechSynthesizer, SpeechSynthesizer};
pub use vad::{VadConfig, VadEvent, VoiceActivityDetector};
pub use asr::{MockSpeechRecognizer, SpeechRecognizer, TranscriptionResult, WhisperCppRecognizer, encode_wav_mono};
