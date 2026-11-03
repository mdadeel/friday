use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tokio::sync::Notify;

/// Controller for monitoring barge-in during speech playback and cancelling TTS.
#[derive(Debug, Clone)]
pub struct BargeInController {
    is_playing: Arc<AtomicBool>,
    is_interrupted: Arc<AtomicBool>,
    interruption_notify: Arc<Notify>,
}

impl Default for BargeInController {
    fn default() -> Self {
        Self::new()
    }
}

impl BargeInController {
    pub fn new() -> Self {
        Self {
            is_playing: Arc::new(AtomicBool::new(false)),
            is_interrupted: Arc::new(AtomicBool::new(false)),
            interruption_notify: Arc::new(Notify::new()),
        }
    }

    /// Mark that TTS audio playback has commenced.
    pub fn start_playback(&self) {
        self.is_playing.store(true, Ordering::SeqCst);
        self.is_interrupted.store(false, Ordering::SeqCst);
    }

    /// Mark that TTS audio playback has finished naturally.
    pub fn stop_playback(&self) {
        self.is_playing.store(false, Ordering::SeqCst);
    }

    /// Returns true if TTS playback is currently active.
    pub fn is_playing(&self) -> bool {
        self.is_playing.load(Ordering::SeqCst)
    }

    /// Returns true if barge-in was triggered and playback was interrupted.
    pub fn is_interrupted(&self) -> bool {
        self.is_interrupted.load(Ordering::SeqCst)
    }

    /// Fired by the VAD or audio frame processor when speech onset is detected during playback.
    /// Cancels playback immediately (< 150 ms target).
    pub fn trigger_barge_in(&self) -> bool {
        if self.is_playing.load(Ordering::SeqCst) {
            self.is_interrupted.store(true, Ordering::SeqCst);
            self.is_playing.store(false, Ordering::SeqCst);
            self.interruption_notify.notify_waiters();
            true
        } else {
            false
        }
    }

    /// Allows waiting for an interruption event asynchronously.
    pub async fn wait_for_interruption(&self) {
        self.interruption_notify.notified().await;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_barge_in_lifecycle() {
        let controller = BargeInController::new();
        assert!(!controller.is_playing());
        assert!(!controller.is_interrupted());

        controller.start_playback();
        assert!(controller.is_playing());

        // Speech onset detected
        let interrupted = controller.trigger_barge_in();
        assert!(interrupted);
        assert!(!controller.is_playing());
        assert!(controller.is_interrupted());

        // Subsequent triggers do nothing
        assert!(!controller.trigger_barge_in());
    }
}
