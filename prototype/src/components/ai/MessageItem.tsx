import { useState } from 'react';
import type { ChatMessage } from '../../types/contracts';
import { fmtTime, Badge } from '../ui';
import { MarkdownContent } from './MarkdownContent';
import { Reasoning } from './Reasoning';
import { ToolCallCard } from './ToolCallCard';
import { webVoiceEngine } from '../../services/voiceEngine';

interface MessageItemProps {
  message: ChatMessage;
}

export function MessageItem({ message }: MessageItemProps) {
  const [copied, setCopied] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const isOwner = message.role === 'owner';

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  const handleToggleSpeak = () => {
    if (isSpeaking) {
      webVoiceEngine.stopSpeaking();
      setIsSpeaking(false);
    } else {
      const started = webVoiceEngine.speak(message.text, () => {
        setIsSpeaking(false);
      });
      if (started) {
        setIsSpeaking(true);
      }
    }
  };

  return (
    <div className={`ai-message-row ${isOwner ? 'owner' : 'assistant'}`}>
      <div className="ai-message-avatar" aria-hidden="true">
        {isOwner ? (
          <div className="ai-avatar user">U</div>
        ) : (
          <div className="ai-avatar edith">E</div>
        )}
      </div>

      <div className="ai-message-body">
        <div className="ai-message-header">
          <span className="ai-message-author">{isOwner ? 'You' : 'EDITH'}</span>
          <span className="ai-message-time">{fmtTime(message.at)}</span>
          {message.source === 'voice' && <span className="ai-pill voice">Voice</span>}
          {message.route && (
            <Badge tone={message.route.tier === 'T0' ? 'ok' : 'info'}>
              {message.route.tier}
            </Badge>
          )}
        </div>

        {/* Reasoning thought process */}
        {message.thinking && (
          <Reasoning thinking={message.thinking} isStreaming={message.streaming} />
        )}

        {/* Autonomous tool calls */}
        {message.toolCalls && message.toolCalls.length > 0 && (
          <div className="ai-tool-calls-group">
            {message.toolCalls.map((tc, idx) => (
              <ToolCallCard
                key={`${tc.name}-${idx}`}
                name={tc.name}
                input={tc.input}
                output={tc.output}
                status={tc.status}
              />
            ))}
          </div>
        )}

        {/* Message content */}
        <div className="ai-message-text">
          <MarkdownContent content={message.text} />
          {message.streaming && <span className="ai-streaming-cursor" aria-hidden="true">▍</span>}
        </div>

        {/* Action toolbar for assistant messages */}
        {!isOwner && !message.streaming && message.text && (
          <div className="ai-message-actions">
            <button
              type="button"
              className="ai-action-icon-btn"
              onClick={handleToggleSpeak}
              title={isSpeaking ? 'Stop speaking' : 'Read aloud with text-to-speech'}
              aria-label="Text to speech"
            >
              {isSpeaking ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="6" y="6" width="12" height="12" rx="2" />
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                  <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                  <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                </svg>
              )}
            </button>

            <button
              type="button"
              className="ai-action-icon-btn"
              onClick={handleCopy}
              title="Copy message"
              aria-label="Copy"
            >
              {copied ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
