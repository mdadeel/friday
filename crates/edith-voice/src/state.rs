use crate::error::{Result, VoiceError};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum VoiceState {
    Off,
    Idle,
    Listening,
    Transcribing,
    Finalising,
    Dispatching,
    Thinking,
    Speaking,
    Interrupted,
    Error,
}

impl std::fmt::Display for VoiceState {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Off => write!(f, "off"),
            Self::Idle => write!(f, "idle"),
            Self::Listening => write!(f, "listening"),
            Self::Transcribing => write!(f, "transcribing"),
            Self::Finalising => write!(f, "finalising"),
            Self::Dispatching => write!(f, "dispatching"),
            Self::Thinking => write!(f, "thinking"),
            Self::Speaking => write!(f, "speaking"),
            Self::Interrupted => write!(f, "interrupted"),
            Self::Error => write!(f, "error"),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VoiceStateMachine {
    current: VoiceState,
    previous: VoiceState,
    last_transition_at: DateTime<Utc>,
    error_message: Option<String>,
}

impl Default for VoiceStateMachine {
    fn default() -> Self {
        Self {
            current: VoiceState::Idle,
            previous: VoiceState::Off,
            last_transition_at: Utc::now(),
            error_message: None,
        }
    }
}

impl VoiceStateMachine {
    pub fn new(initial: VoiceState) -> Self {
        Self {
            current: initial,
            previous: VoiceState::Off,
            last_transition_at: Utc::now(),
            error_message: None,
        }
    }

    pub fn current(&self) -> VoiceState {
        self.current
    }

    pub fn previous(&self) -> VoiceState {
        self.previous
    }

    pub fn last_transition_at(&self) -> DateTime<Utc> {
        self.last_transition_at
    }

    pub fn error_message(&self) -> Option<&str> {
        self.error_message.as_deref()
    }

    /// Privacy guarantee: microphone is physically active ONLY during
    /// Listening, Transcribing, Finalising, and Speaking (for barge-in monitoring).
    /// In Off, Idle, Thinking, Dispatching, or Error, microphone is strictly closed/muted.
    pub fn is_mic_active(&self) -> bool {
        matches!(
            self.current,
            VoiceState::Listening
                | VoiceState::Transcribing
                | VoiceState::Finalising
                | VoiceState::Speaking
        )
    }

    pub fn transition_to(&mut self, next: VoiceState) -> Result<()> {
        if self.current == next {
            return Ok(());
        }

        let valid = match (self.current, next) {
            // From Off
            (VoiceState::Off, VoiceState::Idle) => true,
            (VoiceState::Off, VoiceState::Error) => true,

            // From Idle
            (VoiceState::Idle, VoiceState::Listening) => true,
            (VoiceState::Idle, VoiceState::Speaking) => true,
            (VoiceState::Idle, VoiceState::Off) => true,
            (VoiceState::Idle, VoiceState::Error) => true,

            // From Listening
            (VoiceState::Listening, VoiceState::Transcribing) => true,
            (VoiceState::Listening, VoiceState::Finalising) => true, // Manual PTT release
            (VoiceState::Listening, VoiceState::Idle) => true,       // Cancel
            (VoiceState::Listening, VoiceState::Error) => true,

            // From Transcribing
            (VoiceState::Transcribing, VoiceState::Finalising) => true,
            (VoiceState::Transcribing, VoiceState::Idle) => true, // Cancel
            (VoiceState::Transcribing, VoiceState::Error) => true,

            // From Finalising
            (VoiceState::Finalising, VoiceState::Dispatching) => true,
            (VoiceState::Finalising, VoiceState::Idle) => true, // Empty or low confidence
            (VoiceState::Finalising, VoiceState::Error) => true,

            // From Dispatching
            (VoiceState::Dispatching, VoiceState::Thinking) => true,
            (VoiceState::Dispatching, VoiceState::Idle) => true,
            (VoiceState::Dispatching, VoiceState::Error) => true,

            // From Thinking
            (VoiceState::Thinking, VoiceState::Speaking) => true,
            (VoiceState::Thinking, VoiceState::Idle) => true, // No spoken answer needed
            (VoiceState::Thinking, VoiceState::Listening) => true, // Barge-in during thinking
            (VoiceState::Thinking, VoiceState::Error) => true,

            // From Speaking
            (VoiceState::Speaking, VoiceState::Idle) => true, // TTS finished
            (VoiceState::Speaking, VoiceState::Interrupted) => true, // Barge-in onset
            (VoiceState::Speaking, VoiceState::Error) => true,

            // From Interrupted
            (VoiceState::Interrupted, VoiceState::Listening) => true,
            (VoiceState::Interrupted, VoiceState::Idle) => true,
            (VoiceState::Interrupted, VoiceState::Error) => true,

            // From Error
            (VoiceState::Error, VoiceState::Idle) => true, // Recovery
            (VoiceState::Error, VoiceState::Off) => true,  // Disabling
            (VoiceState::Error, VoiceState::Error) => true,

            _ => false,
        };

        if !valid {
            return Err(VoiceError::InvalidStateTransition {
                from: self.current,
                to: next,
            });
        }

        self.previous = self.current;
        self.current = next;
        self.last_transition_at = Utc::now();
        if next != VoiceState::Error {
            self.error_message = None;
        }

        Ok(())
    }

    pub fn set_error(&mut self, message: impl Into<String>) {
        self.previous = self.current;
        self.current = VoiceState::Error;
        self.last_transition_at = Utc::now();
        self.error_message = Some(message.into());
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_valid_voice_transitions() {
        let mut sm = VoiceStateMachine::new(VoiceState::Idle);
        assert!(!sm.is_mic_active());

        // PTT pressed -> Listening
        sm.transition_to(VoiceState::Listening).unwrap();
        assert!(sm.is_mic_active());

        // Speech detected -> Transcribing
        sm.transition_to(VoiceState::Transcribing).unwrap();
        assert!(sm.is_mic_active());

        // Silence endpoint -> Finalising
        sm.transition_to(VoiceState::Finalising).unwrap();
        assert!(sm.is_mic_active());

        // Transcript ready -> Dispatching
        sm.transition_to(VoiceState::Dispatching).unwrap();
        assert!(!sm.is_mic_active()); // Mic closed!

        // Orchestrator processing -> Thinking
        sm.transition_to(VoiceState::Thinking).unwrap();
        assert!(!sm.is_mic_active());

        // Response ready -> Speaking
        sm.transition_to(VoiceState::Speaking).unwrap();
        assert!(sm.is_mic_active()); // Barge-in detector active

        // Playback finished -> Idle
        sm.transition_to(VoiceState::Idle).unwrap();
        assert!(!sm.is_mic_active());
    }

    #[test]
    fn test_barge_in_transition() {
        let mut sm = VoiceStateMachine::new(VoiceState::Speaking);
        assert!(sm.is_mic_active());

        // Owner interrupts -> Interrupted
        sm.transition_to(VoiceState::Interrupted).unwrap();

        // Immediately moves to Listening
        sm.transition_to(VoiceState::Listening).unwrap();
        assert!(sm.is_mic_active());
    }

    #[test]
    fn test_invalid_transition_rejected() {
        let mut sm = VoiceStateMachine::new(VoiceState::Off);
        let err = sm.transition_to(VoiceState::Speaking).unwrap_err();
        assert!(matches!(err, VoiceError::InvalidStateTransition { .. }));
    }
}
