import { useState } from 'react';

interface ToolCallProps {
  name: string;
  input?: any;
  output?: any;
  status: 'running' | 'completed' | 'failed';
}

export function ToolCallCard({ name, input, output, status }: ToolCallProps) {
  const [expanded, setExpanded] = useState(false);

  const getToolIcon = (toolName: string) => {
    if (toolName.startsWith('web.')) {
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <line x1="2" y1="12" x2="22" y2="12" />
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        </svg>
      );
    }
    if (toolName.startsWith('fs.')) {
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
        </svg>
      );
    }
    if (toolName.startsWith('desktop.')) {
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
          <line x1="8" y1="21" x2="16" y2="21" />
          <line x1="12" y1="17" x2="12" y2="21" />
        </svg>
      );
    }
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
      </svg>
    );
  };

  return (
    <div className={`ai-tool-call-card ${status}`}>
      <button
        type="button"
        className="ai-tool-header"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
      >
        <div className="ai-tool-left">
          <span className="ai-tool-icon">{getToolIcon(name)}</span>
          <span className="ai-tool-name">{name}</span>
          <span className={`ai-tool-status-badge ${status}`}>
            {status === 'running' ? 'Calling...' : status === 'completed' ? 'Completed' : 'Failed'}
          </span>
        </div>
        <span className={`ai-tool-chevron ${expanded ? 'open' : ''}`}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </span>
      </button>

      {expanded && (
        <div className="ai-tool-body">
          {input && (
            <div className="ai-tool-section">
              <span className="ai-tool-label">Input Parameters</span>
              <pre className="ai-tool-code">{typeof input === 'string' ? input : JSON.stringify(input, null, 2)}</pre>
            </div>
          )}
          {output && (
            <div className="ai-tool-section">
              <span className="ai-tool-label">Observation / Output</span>
              <pre className="ai-tool-code">{typeof output === 'string' ? output : JSON.stringify(output, null, 2)}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
