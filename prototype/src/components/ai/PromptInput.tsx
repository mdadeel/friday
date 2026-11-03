import React, { useEffect, useRef, useState } from 'react';
import { webVoiceEngine } from '../../services/voiceEngine';

interface PromptInputProps {
  onSend: (text: string, source: 'text' | 'voice') => void;
  disabled?: boolean;
  quickPrompts?: string[];
}

export function PromptInput({ onSend, disabled, quickPrompts = [] }: PromptInputProps) {
  const [draft, setDraft] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea height
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 180)}px`;
    }
  }, [draft, liveTranscript]);

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const messageToSend = draft.trim();
    if (!messageToSend || disabled) return;

    if (isListening) {
      webVoiceEngine.stopListening();
      setIsListening(false);
    }

    onSend(messageToSend, isListening ? 'voice' : 'text');
    setDraft('');
    setLiveTranscript('');
  };

  const toggleMic = () => {
    if (isListening) {
      webVoiceEngine.stopListening();
      setIsListening(false);
      setLiveTranscript('');
    } else {
      const started = webVoiceEngine.startListening({
        onInterim: (interim) => {
          setLiveTranscript(interim);
        },
        onFinal: (final) => {
          setDraft((prev) => (prev ? `${prev} ${final}` : final));
          setLiveTranscript('');
        },
        onError: () => {
          setIsListening(false);
          setLiveTranscript('');
        },
        onEnd: () => {
          setIsListening(false);
          setLiveTranscript('');
        },
      });
      if (started) {
        setIsListening(true);
      }
    }
  };

  return (
    <div className="ai-prompt-container">
      {quickPrompts.length > 0 && (
        <div className="ai-prompt-quick-chips" aria-label="Suggested prompts">
          {quickPrompts.map((p) => (
            <button
              key={p}
              type="button"
              className="ai-chip"
              onClick={() => onSend(p, 'text')}
              disabled={disabled}
            >
              {p}
            </button>
          ))}
        </div>
      )}

      <form className={`ai-prompt-card ${isListening ? 'listening' : ''}`} onSubmit={handleSubmit}>
        <div className="ai-prompt-input-row">
          <textarea
            ref={textareaRef}
            id="prompt-composer"
            rows={1}
            value={liveTranscript ? `${draft} (${liveTranscript}...)` : draft}
            placeholder={isListening ? 'Listening to your voice...' : 'Ask EDITH anything, write code, or search the web...'}
            disabled={disabled}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
              }
            }}
          />
        </div>

        <div className="ai-prompt-actions-row">
          <div className="ai-prompt-left-tools">
            <button
              type="button"
              className={`ai-action-btn mic-btn ${isListening ? 'active' : ''}`}
              onClick={toggleMic}
              title={isListening ? 'Stop listening' : 'Start live voice transcription'}
              aria-label="Microphone"
            >
              {isListening ? (
                <div className="ai-waveform-anim" aria-label="Listening">
                  <span />
                  <span />
                  <span />
                  <span />
                </div>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <line x1="12" y1="19" x2="12" y2="23" />
                  <line x1="8" y1="23" x2="16" y2="23" />
                </svg>
              )}
            </button>
            {isListening && <span className="ai-listening-indicator">Listening (Web Speech STT)...</span>}
          </div>

          <div className="ai-prompt-right-tools">
            {draft && (
              <button
                type="button"
                className="ai-action-btn clear-btn"
                onClick={() => setDraft('')}
                title="Clear input"
                aria-label="Clear"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            )}

            <button
              type="submit"
              className="ai-send-btn"
              disabled={(!draft.trim() && !liveTranscript.trim()) || disabled}
              title="Send message (Enter)"
              aria-label="Send"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="12" y1="19" x2="12" y2="5" />
                <polyline points="5 12 12 5 19 12" />
              </svg>
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
