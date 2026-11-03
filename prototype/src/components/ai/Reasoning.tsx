import { useState } from 'react';

interface ReasoningProps {
  thinking: string;
  isStreaming?: boolean;
}

export function Reasoning({ thinking, isStreaming }: ReasoningProps) {
  const [isOpen, setIsOpen] = useState(isStreaming ?? true);

  if (!thinking || thinking.trim().length === 0) return null;

  return (
    <div className="ai-reasoning-container">
      <button
        type="button"
        className="ai-reasoning-header"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
      >
        <div className="ai-reasoning-title">
          <span className="ai-reasoning-icon">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
            </svg>
          </span>
          <span>Thought Process</span>
          {isStreaming && <span className="ai-reasoning-pulse" />}
        </div>
        <span className={`ai-reasoning-chevron ${isOpen ? 'open' : ''}`}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </span>
      </button>

      {isOpen && (
        <div className="ai-reasoning-body">
          <pre className="ai-reasoning-text">{thinking}</pre>
        </div>
      )}
    </div>
  );
}
