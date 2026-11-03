use std::collections::VecDeque;

/// Ring buffer storing 16-bit 16 kHz mono PCM audio samples.
#[derive(Debug, Clone)]
pub struct AudioRingBuffer {
    buffer: VecDeque<i16>,
    capacity: usize,
}

impl AudioRingBuffer {
    /// Creates a new ring buffer with given sample capacity.
    /// At 16 kHz mono, 160,000 samples = 10 seconds.
    pub fn new(capacity: usize) -> Self {
        Self {
            buffer: VecDeque::with_capacity(capacity),
            capacity,
        }
    }

    /// Appends new samples to the buffer, dropping oldest if capacity exceeded.
    pub fn push(&mut self, samples: &[i16]) {
        for &sample in samples {
            if self.buffer.len() >= self.capacity {
                self.buffer.pop_front();
            }
            self.buffer.push_back(sample);
        }
    }

    /// Total number of samples currently held.
    pub fn len(&self) -> usize {
        self.buffer.len()
    }

    pub fn is_empty(&self) -> bool {
        self.buffer.is_empty()
    }

    /// Returns a copy of the most recent samples spanning `duration_ms` at `sample_rate`.
    pub fn get_recent(&self, duration_ms: usize, sample_rate: u32) -> Vec<i16> {
        let requested_samples = (duration_ms * sample_rate as usize) / 1000;
        let count = requested_samples.min(self.buffer.len());
        let start = self.buffer.len() - count;

        self.buffer.range(start..).copied().collect()
    }

    /// Returns all samples currently held in the ring buffer.
    pub fn get_all(&self) -> Vec<i16> {
        self.buffer.iter().copied().collect()
    }

    /// Clears the ring buffer.
    pub fn clear(&mut self) {
        self.buffer.clear();
    }
}

/// Utility for audio level calculation and RMS measurement.
pub struct AudioMetrics;

impl AudioMetrics {
    /// Calculates the Root Mean Square (RMS) amplitude of an audio frame.
    pub fn calculate_rms(samples: &[i16]) -> f32 {
        if samples.is_empty() {
            return 0.0;
        }

        let sum_sq: f64 = samples.iter().map(|&s| (s as f64) * (s as f64)).sum();
        let mean = sum_sq / (samples.len() as f64);
        mean.sqrt() as f32
    }

    /// Converts RMS amplitude to decibels relative to full-scale (dBFS).
    /// Peak amplitude for i16 is 32767. Returns value between ~ -90.0 dB and 0.0 dB.
    pub fn calculate_db(rms: f32) -> f32 {
        if rms <= 1.0 {
            -90.0
        } else {
            let db = 20.0 * (rms / 32767.0).log10();
            db.max(-90.0).min(0.0)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_ring_buffer_capacity() {
        let mut rb = AudioRingBuffer::new(5);
        rb.push(&[1, 2, 3]);
        assert_eq!(rb.len(), 3);
        assert_eq!(rb.get_all(), vec![1, 2, 3]);

        rb.push(&[4, 5, 6]);
        assert_eq!(rb.len(), 5);
        assert_eq!(rb.get_all(), vec![2, 3, 4, 5, 6]); // 1 was dropped
    }

    #[test]
    fn test_get_recent() {
        let mut rb = AudioRingBuffer::new(100);
        let samples: Vec<i16> = (0..50).collect();
        rb.push(&samples);

        // At 16 kHz, 2 ms = 32 samples
        let recent = rb.get_recent(2, 16000);
        assert_eq!(recent.len(), 32);
        assert_eq!(recent[0], 18);
        assert_eq!(recent[31], 49);
    }

    #[test]
    fn test_audio_metrics() {
        let silence = vec![0i16; 480];
        assert_eq!(AudioMetrics::calculate_rms(&silence), 0.0);
        assert_eq!(AudioMetrics::calculate_db(0.0), -90.0);

        let signal = vec![16384i16; 480];
        let rms = AudioMetrics::calculate_rms(&signal);
        assert!((rms - 16384.0).abs() < 1.0);
        let db = AudioMetrics::calculate_db(rms);
        assert!((db - (-6.02)).abs() < 0.1);
    }
}
