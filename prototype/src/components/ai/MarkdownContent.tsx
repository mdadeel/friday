import React from 'react';
import { CodeBlock } from './CodeBlock';

interface MarkdownContentProps {
  content: string;
}

export function MarkdownContent({ content }: MarkdownContentProps) {
  if (!content) return null;

  // Split content by code fences ```lang ... ```
  const parts: React.ReactNode[] = [];
  const regex = /```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(content)) !== null) {
    const textBefore = content.substring(lastIndex, match.index);
    if (textBefore) {
      parts.push(renderTextWithFormatting(textBefore, `text-${lastIndex}`));
    }

    const language = match[1] || 'text';
    const code = match[2];
    parts.push(<CodeBlock key={`code-${match.index}`} language={language} code={code} />);

    lastIndex = regex.lastIndex;
  }

  const remainingText = content.substring(lastIndex);
  if (remainingText) {
    parts.push(renderTextWithFormatting(remainingText, `text-${lastIndex}`));
  }

  return <div className="ai-markdown-content">{parts}</div>;
}

function renderTextWithFormatting(text: string, keyPrefix: string): React.ReactNode {
  const paragraphs = text.split(/\n\n+/);

  return (
    <div key={keyPrefix} className="ai-text-block">
      {paragraphs.map((p, pIdx) => {
        const trimmed = p.trim();
        if (!trimmed) return null;

        // Headers
        if (trimmed.startsWith('### ')) {
          return <h4 key={`${keyPrefix}-h3-${pIdx}`} className="ai-md-h3">{trimmed.replace(/^###\s+/, '')}</h4>;
        }
        if (trimmed.startsWith('## ')) {
          return <h3 key={`${keyPrefix}-h2-${pIdx}`} className="ai-md-h2">{trimmed.replace(/^##\s+/, '')}</h3>;
        }
        if (trimmed.startsWith('# ')) {
          return <h2 key={`${keyPrefix}-h1-${pIdx}`} className="ai-md-h1">{trimmed.replace(/^#\s+/, '')}</h2>;
        }

        // Unordered list items
        if (trimmed.includes('\n* ') || trimmed.includes('\n- ') || trimmed.startsWith('* ') || trimmed.startsWith('- ')) {
          const lines = trimmed.split('\n');
          return (
            <ul key={`${keyPrefix}-ul-${pIdx}`} className="ai-md-ul">
              {lines.map((line, lIdx) => {
                const item = line.replace(/^[\*\-]\s+/, '');
                return <li key={lIdx}>{formatInline(item)}</li>;
              })}
            </ul>
          );
        }

        // Ordered list items
        if (/^\d+\.\s+/.test(trimmed)) {
          const lines = trimmed.split('\n');
          return (
            <ol key={`${keyPrefix}-ol-${pIdx}`} className="ai-md-ol">
              {lines.map((line, lIdx) => {
                const item = line.replace(/^\d+\.\s+/, '');
                return <li key={lIdx}>{formatInline(item)}</li>;
              })}
            </ol>
          );
        }

        // Standard paragraph
        return (
          <p key={`${keyPrefix}-p-${pIdx}`} className="ai-md-p">
            {formatInline(trimmed)}
          </p>
        );
      })}
    </div>
  );
}

function formatInline(text: string): React.ReactNode[] {
  // Parses inline code `...`, bold **...**, and links [text](url)
  const parts: React.ReactNode[] = [];
  const inlineRegex = /(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g;
  let lastIdx = 0;
  let match: RegExpExecArray | null;

  while ((match = inlineRegex.exec(text)) !== null) {
    if (match.index > lastIdx) {
      parts.push(text.substring(lastIdx, match.index));
    }

    const token = match[0];
    if (token.startsWith('`') && token.endsWith('`')) {
      parts.push(
        <code key={`code-${match.index}`} className="ai-inline-code">
          {token.slice(1, -1)}
        </code>
      );
    } else if (token.startsWith('**') && token.endsWith('**')) {
      parts.push(
        <strong key={`bold-${match.index}`} className="ai-inline-bold">
          {token.slice(2, -2)}
        </strong>
      );
    } else if (token.startsWith('[') && token.includes('](')) {
      const linkMatch = token.match(/\[([^\]]+)\]\(([^)]+)\)/);
      if (linkMatch) {
        parts.push(
          <a
            key={`link-${match.index}`}
            href={linkMatch[2]}
            target="_blank"
            rel="noopener noreferrer"
            className="ai-inline-link"
          >
            {linkMatch[1]}
          </a>
        );
      }
    }

    lastIdx = inlineRegex.lastIndex;
  }

  if (lastIdx < text.length) {
    parts.push(text.substring(lastIdx));
  }

  return parts;
}
