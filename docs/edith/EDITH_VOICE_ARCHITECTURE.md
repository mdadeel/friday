# EDITH — Voice Architecture

Companion: [DETAILED_SYSTEM_DESIGN](EDITH_DETAILED_SYSTEM_DESIGN.md) §3.12–3.15 · [DECISIONS](EDITH_TECHNOLOGY_DECISIONS.md) D8, D10 · [UI_UX](EDITH_UI_UX_SPECIFICATION.md) §4.8

## 1. Principle

Voice is an **independent subsystem**. It converts speech into text events and text into speech. It does not reason, plan or execute. Recognition, reasoning and speech generation are separate components with separate providers, so each can be swapped or disabled.

Voice input becomes an ordinary user turn with `source = voice`. The orchestrator does not know whether a request was spoken.

## 2. Components

```mermaid
flowchart LR
  MIC[Audio device] --> CAP[Capture<br/>PipeWire / ALSA]
  CAP --> RING[(Ring buffer<br/>16 kHz mono)]
  RING --> VAD[VAD + endpointer]
  RING --> ASR[SpeechRecognizer<br/>local whisper.cpp | cloud Gemini Live]
  VAD -- end of speech --> ASR
  ASR -- partials --> UI[UI live caption]
  ASR -- finals --> CONV[Conversation manager]
  CONV --> ORCH[Orchestrator]
  ORCH -- text stream --> SEG[Sentence segmenter]
  SEG --> TTS[SpeechSynthesizer]
  TTS --> SPK[Audio output]
  VAD -- speech onset during TTS --> BARGE[Barge-in controller]
  BARGE --> TTS
  BARGE --> ORCH
```

## 3. Voice session state machine

| State | Entered when | Leaves when |
|-------|--------------|-------------|
| `Off` | Voice disabled or device unavailable | Enabled and device ready |
| `Idle` | Ready, not listening | Activation (push-to-talk press, wake word later, or listening mode enabled) |
| `Listening` | Capture active | Speech onset (partials begin) or cancel |
| `Transcribing` | Speech detected | End of speech (endpointing) → `Finalising` |
| `Finalising` | Endpoint detected | Final transcript emitted → `Dispatching` |
| `Dispatching` | Final sent to conversation | Orchestrator acknowledges → `Thinking` (or `Idle` if no response expected) |
| `Thinking` | Task running, no speech yet | First sentence available → `Speaking` |
| `Speaking` | TTS playing | Playback ends → `Idle`; barge-in → `Interrupted` |
| `Interrupted` | Speech onset during playback | Cancel TTS (≤ 150 ms) → `Listening` |
| `Error(kind)` | Device, ASR or TTS failure | Recovery policy → `Idle` or `Off` |

## 4. Audio capture

- Format: 16 kHz, mono, 16-bit PCM for ASR; 30 ms frames for VAD; 100 ms chunks for ASR streaming (the sample whisper.cpp stream example uses 500 ms steps — chunk size is tuned by benchmark).
- Backend: PipeWire first (native on GNOME); ALSA via `cpal` as fallback. Decision D8.
- Device selection: default input or a named device from settings. A device list is refreshed on hotplug events.
- Recovery: on device loss, stop capture, mark `Error(DeviceLost)`, reopen default input after 1 s, 2 s, 5 s backoff, and notify the owner after the third failure.
- Level meter: RMS published at 15 Hz to the UI; not persisted.
- Privacy: capture runs only while `Listening`. The UI shows a visible indicator whenever the microphone is open. Audio is not written to disk unless the owner enables diagnostic recording for a short session; the default is off.

## 5. Speech recognition

### 5.1 Trait

```rust
#[async_trait]
pub trait SpeechRecognizer: Send + Sync {
    async fn start(&self, cfg: AsrConfig) -> Result<Box<dyn AsrSession>, AsrError>;
}
#[async_trait]
pub trait AsrSession: Send {
    async fn push_audio(&mut self, frame: &[i16]) -> Result<(), AsrError>;
    async fn end_of_speech(&mut self) -> Result<(), AsrError>;     // client endpoint or manual release
    fn events(&mut self) -> BoxStream<'_, AsrEvent>;               // Partial{text,stable_prefix} | Final{text,segment_id,confidence,language}
    async fn cancel(&mut self);
}
```

### 5.2 Local (default): whisper.cpp

- Streaming by sliding window: decode the last N seconds every step (default step 500 ms, window 5 s), emit partials, and emit a final on endpoint with a short look-ahead. Behaviour matches the whisper.cpp `stream` example.
- Model: a ggml model chosen at setup (for example `base.en` for English-only or a multilingual model for Bangla and English mixed use). Language: auto or fixed. Bengali support must be verified on the chosen model before it is promised.
- Runs as a supervised child process (`edith-whisper-worker`) or linked library behind a feature flag (decision D10). Crash does not take down the daemon.
- Targets: first partial < 400 ms after speech onset; final < 700 ms after endpoint (hypotheses; see [PERFORMANCE](EDITH_PERFORMANCE_REQUIREMENTS.md) §3.4).

### 5.3 Cloud (opt-in): Gemini Live API

- WebSocket session with `inputAudioTranscription`. Setup: `languageCodes` (for example `en-US`, `bn-BD`) or empty for automatic detection; `customVocabulary` for EDITH and project names; `mode` = `VERBATIM` for dictation, `SMART` only where formatting is wanted (SMART is incompatible with word timestamps and diarization).
- Interim results come from `interimInputTranscription`; finals from `inputTranscription`. The adapter treats interim text as a preview only and commits finals (per Google's guidance).
- Endpointing: **manual** (push-to-talk). The client sends `activityStart` on press and `activityEnd` on release, with automatic detection disabled. This makes boundaries predictable and avoids streaming silence.
- Consent: cloud speech is off by default. Turning it on shows the data path and writes a consent record. Audio frames sent are logged as counts only.
- Model ID: configuration value, verified at implementation time (research A3).

### 5.4 Accuracy and language

- Measure word error rate on a 60-minute owner-recorded set in English and Bangla; report per engine. Thresholds are set after the baseline.
- Custom vocabulary includes EDITH's project names, MCP server names, and technical terms.

## 6. Speech generation

- Trait `SpeechSynthesizer` accepts a text stream and yields audio chunks; sentence segmentation starts playback before the answer finishes streaming.
- Candidate engines: local neural TTS (for example Piper class models) for default; cloud TTS optional. Not evaluated in this pass; decision deferred to Phase 11 with a listening test.
- Playback is through PipeWire with a cancellable sink. Cancellation drains the buffer and stops within 150 ms.
- Speech content is the response's **spoken form**: short, no tables or code blocks read aloud. The conversation manager produces a spoken summary for long answers and points to the text view.

## 7. Endpointing and turn-taking

| Event | Behaviour |
|-------|-----------|
| Push-to-talk press | Start capture; `Listening` |
| Speech onset | `Transcribing`; partial captions |
| Silence ≥ 700 ms (local VAD) | Endpoint; finalise |
| Manual release (PTT) | Finalise immediately |
| Final empty or below confidence 0.4 | Ask once for repetition; do not dispatch |
| Speech during `Speaking` | Barge-in: stop TTS, enter `Listening` |
| Speech during `Thinking` | New turn; orchestrator applies interruption policy ([DETAILED_SYSTEM_DESIGN](EDITH_DETAILED_SYSTEM_DESIGN.md) §3.11) |

Barge-in uses VAD on the microphone while output is playing. Echo cancellation is required to avoid self-triggering; PipeWire echo-cancel module is the candidate, verified during the Phase 11 spike (risk R9).

## 8. Interruption scenario (Scenario 7)

1. EDITH speaks a long answer. The owner begins speaking.
2. Barge-in controller detects onset (≥ 150 ms of speech above threshold, to avoid coughs).
3. TTS stops within 150 ms; the unspoken remainder of the answer is kept as a task artefact, not discarded.
4. The new utterance is transcribed and dispatched with `interrupts = <turn id>`.
5. The orchestrator re-evaluates: if the new utterance modifies the objective, the old task is paused and re-planned; if it is a follow-up, the task continues.

## 9. Failure modes

| Failure | Response |
|---------|----------|
| No microphone | `Off` with reason; text input still works |
| ASR process crash | Restart worker; in-flight utterance lost; owner notified once |
| Cloud ASR network failure | Fall back to local ASR if installed; else `Error` with retry |
| TTS failure | Show text; disable speech for the session after 3 failures |
| Echo causes loops | Barge-in disabled automatically when output level and mic level correlate; setting exposed |

## 10. Privacy and security

- Microphone indicator is mandatory in UI and tray.
- No always-on capture in v1. Wake word is a later feature with a dedicated design review.
- Audio never enters memory; only transcripts do, and transcripts follow the memory write gate.
- Cloud speech only with consent, and never for `Secret`-classified sessions.

## 11. Testing

- Recorded audio fixtures (owner-consented, stored outside Git) for regression.
- Fake capture device feeding fixture audio at real time and at accelerated rates.
- Latency measurements per state transition.
- Barge-in tests with synthetic echo.

## 12. Prototype mapping

The prototype's voice panel shows the state machine, a simulated live caption and a simulated level meter. It does **not** open a microphone. The voice settings screen shows device lists marked `SIMULATED`.
