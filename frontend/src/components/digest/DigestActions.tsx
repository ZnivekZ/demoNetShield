/**
 * DigestActions.tsx
 * "Regenerate now" button with loading state + last-generated chip.
 * Styled with NetShield design-system tokens.
 */
import React from 'react';
import { RefreshCw, Clock } from 'lucide-react';

interface Props {
  onGenerate: () => void;
  isGenerating: boolean;
  lastGeneratedAt?: string | null;
  generationMethod?: string;
}

function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60)    return `hace ${diff}s`;
  if (diff < 3600)  return `hace ${Math.floor(diff / 60)}min`;
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)}h`;
  return `hace ${Math.floor(diff / 86400)}d`;
}

export const DigestActions: React.FC<Props> = ({
  onGenerate, isGenerating, lastGeneratedAt, generationMethod,
}) => {
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <button
        onClick={onGenerate}
        disabled={isGenerating}
        id="digest-generate-btn"
        className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        style={{
          background: isGenerating
            ? 'var(--bg-tertiary, #111)'
            : 'linear-gradient(135deg, #6366f1, #4f46e5)',
          color: isGenerating ? 'var(--text-tertiary, #525252)' : '#fff',
          border: isGenerating ? '1px solid var(--border-default, #1f1f1f)' : 'none',
          boxShadow: isGenerating ? 'none' : '0 4px 15px rgba(99,102,241,0.3)',
        }}
        onMouseEnter={e => {
          if (!isGenerating)
            (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 6px 20px rgba(99,102,241,0.5)';
        }}
        onMouseLeave={e => {
          if (!isGenerating)
            (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 4px 15px rgba(99,102,241,0.3)';
        }}
      >
        <RefreshCw className={`w-3.5 h-3.5 ${isGenerating ? 'animate-spin' : ''}`} />
        {isGenerating ? 'Generando…' : 'Regenerar ahora'}
      </button>

      {lastGeneratedAt && (
        <div
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs"
          style={{
            background: 'var(--bg-secondary, #0a0a0a)',
            border: '1px solid var(--border-default, #1f1f1f)',
          }}
        >
          <Clock className="w-3 h-3 text-surface-500" />
          <span className="text-surface-500">Última gen:</span>
          <span className="font-semibold text-surface-300">{timeAgo(lastGeneratedAt)}</span>
          {generationMethod && (
            <span
              className="rounded px-1.5 py-px text-[10px] font-medium"
              style={{
                background: 'var(--bg-tertiary, #111)',
                color: 'var(--text-tertiary, #525252)',
                border: '1px solid var(--border-default, #1f1f1f)',
              }}
            >
              {generationMethod === 'scheduled' ? '⏰ auto' : '👆 manual'}
            </span>
          )}
        </div>
      )}
    </div>
  );
};
