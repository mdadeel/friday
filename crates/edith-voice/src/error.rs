use crate::state::VoiceState;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum VoiceError {
    #[error("Audio device unavailable: {0}")]
    DeviceUnavailable(String),

    #[error("Audio device lost: {0}")]
    DeviceLost(String),

    #[error("ASR error: {0}")]
    AsrError(String),

    #[error("TTS error: {0}")]
    TtsError(String),

    #[error("Invalid voice state transition from {from:?} to {to:?}")]
    InvalidStateTransition {
        from: VoiceState,
        to: VoiceState,
    },

    #[error("Microphone capture is closed in state {0:?}")]
    MicrophoneClosed(VoiceState),

    #[error("Voice operation cancelled")]
    Cancelled,

    #[error("Internal voice error: {0}")]
    Internal(String),
}

pub type Result<T> = std::result::Result<T, VoiceError>;
