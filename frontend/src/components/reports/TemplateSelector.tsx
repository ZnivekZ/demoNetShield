import { useQuery } from '@tanstack/react-query';
import { Wand2, ChevronRight } from 'lucide-react';
import { reportsApi } from '../../services/api';
import type { ReportTemplate } from '../../types';

interface TemplateSelectorProps {
  onSelect: (template: ReportTemplate) => void;
}

export function TemplateSelector({ onSelect }: TemplateSelectorProps) {
  const { data, isLoading } = useQuery({
    queryKey: ['report-templates'],
    queryFn: () => reportsApi.getTemplates(),
    staleTime: Infinity,
  });

  const templates: ReportTemplate[] = data?.data ?? [];

  if (isLoading) {
    return (
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        {[1, 2, 3].map(i => (
          <div key={i} style={{
            height: 60, width: 180, borderRadius: 8,
            background: 'var(--color-surface-800)',
            animation: 'pulse 1.5s infinite',
          }} />
        ))}
      </div>
    );
  }

  return (
    <div>
      <p style={{ fontSize: '0.7rem', color: 'var(--color-surface-400)', marginBottom: '0.5rem', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
        Plantillas rápidas
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
        {templates.map(template => (
          <button
            key={template.id}
            onClick={() => onSelect(template)}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.6rem',
              padding: '0.55rem 0.75rem', borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)',
              background: 'var(--color-surface-800)', cursor: 'pointer',
              textAlign: 'left', transition: 'all 0.15s', width: '100%',
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(99,102,241,0.4)';
              (e.currentTarget as HTMLButtonElement).style.background = 'rgba(99,102,241,0.08)';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.06)';
              (e.currentTarget as HTMLButtonElement).style.background = 'var(--color-surface-800)';
            }}
          >
            <span style={{ fontSize: '1.1rem', flexShrink: 0 }}>{template.icon}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--color-surface-100)', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {template.name}
              </p>
              <p style={{ fontSize: '0.65rem', color: 'var(--color-surface-500)', margin: 0, marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {template.description}
              </p>
            </div>
            <ChevronRight size={12} style={{ color: 'var(--color-surface-500)', flexShrink: 0 }} />
          </button>
        ))}
      </div>
    </div>
  );
}
