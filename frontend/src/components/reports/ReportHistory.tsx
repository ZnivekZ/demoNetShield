import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { FileText, Trash2, Download, Eye, ChevronLeft, ChevronRight, Loader2, AlertCircle } from 'lucide-react';
import { reportsApi } from '../../services/api';
import type { SavedReport } from '../../types';

const AUDIENCE_LABELS: Record<string, string> = {
  executive: 'Ejecutivo',
  technical: 'Técnico',
  operational: 'Operacional',
};

interface ReportHistoryProps {
  onLoadReport: (report: SavedReport) => void;
}

export function ReportHistory({ onLoadReport }: ReportHistoryProps) {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['saved-reports', page],
    queryFn: () => reportsApi.listSaved(page, 12),
    staleTime: 30_000,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => reportsApi.deleteSaved(id),
    onSuccess: () => {
      setConfirmDelete(null);
      qc.invalidateQueries({ queryKey: ['saved-reports'] });
    },
  });

  const exportMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await reportsApi.getSaved(id);
      if (!res.data) throw new Error('No data');
      const blob = await reportsApi.exportPdf(res.data.html_content!, res.data.title);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${res.data.title}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    },
  });

  const { items = [], pagination } = data?.data ?? { items: [], pagination: undefined };

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem', color: 'var(--color-surface-400)' }}>
        <Loader2 size={24} style={{ animation: 'spin 1s linear infinite' }} />
      </div>
    );
  }

  if (isError) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '2rem', color: 'var(--color-danger-400)' }}>
        <AlertCircle size={16} />
        <span style={{ fontSize: '0.85rem' }}>Error cargando historial</span>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-surface-400)' }}>
        <FileText size={32} style={{ marginBottom: '0.75rem', opacity: 0.4 }} />
        <p style={{ fontSize: '0.85rem' }}>No hay reportes guardados aún.</p>
        <p style={{ fontSize: '0.75rem', marginTop: '0.25rem' }}>Los reportes generados se guardan aquí automáticamente.</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {/* Report list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {items.map(report => (
          <div
            key={report.id}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.75rem',
              padding: '0.75rem 1rem', borderRadius: 10,
              background: 'var(--color-surface-800)',
              border: '1px solid rgba(255,255,255,0.06)',
              transition: 'border-color 0.15s',
            }}
          >
            <FileText size={16} style={{ color: 'var(--color-brand-400)', flexShrink: 0 }} />

            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--color-surface-100)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {report.title}
              </p>
              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.2rem', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.65rem', color: 'var(--color-surface-500)' }}>
                  {new Date(report.created_at).toLocaleString('es', { dateStyle: 'short', timeStyle: 'short' })}
                </span>
                <span style={{
                  fontSize: '0.6rem', fontWeight: 600,
                  background: 'rgba(99,102,241,0.18)', color: 'var(--color-brand-300)',
                  padding: '1px 6px', borderRadius: 4,
                }}>
                  {AUDIENCE_LABELS[report.audience] ?? report.audience}
                </span>
                {report.model_used && (
                  <span style={{ fontSize: '0.6rem', color: 'var(--color-surface-500)' }}>
                    {report.model_used.split('/').pop()}
                  </span>
                )}
                {report.tokens_used > 0 && (
                  <span style={{ fontSize: '0.6rem', color: 'var(--color-surface-500)' }}>
                    {report.tokens_used.toLocaleString()} tokens
                  </span>
                )}
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: '0.35rem', flexShrink: 0 }}>
              <button
                onClick={() => onLoadReport(report)}
                style={{
                  padding: '0.35rem 0.6rem', borderRadius: 6,
                  background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)',
                  color: 'var(--color-brand-300)', cursor: 'pointer', fontSize: '0.7rem',
                  display: 'flex', alignItems: 'center', gap: '0.3rem', transition: 'all 0.15s',
                }}
                title="Abrir en editor"
              >
                <Eye size={11} /> Abrir
              </button>

              <button
                onClick={() => exportMutation.mutate(report.id)}
                disabled={exportMutation.isPending}
                style={{
                  padding: '0.35rem 0.5rem', borderRadius: 6,
                  background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.25)',
                  color: '#4ade80', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', transition: 'all 0.15s',
                }}
                title="Exportar PDF"
              >
                <Download size={11} />
              </button>

              {confirmDelete === report.id ? (
                <div style={{ display: 'flex', gap: '0.25rem' }}>
                  <button
                    onClick={() => deleteMutation.mutate(report.id)}
                    style={{
                      padding: '0.35rem 0.5rem', borderRadius: 6,
                      background: 'rgba(239,68,68,0.2)', border: '1px solid rgba(239,68,68,0.4)',
                      color: '#f87171', cursor: 'pointer', fontSize: '0.65rem', fontWeight: 600,
                    }}
                  >
                    Sí
                  </button>
                  <button
                    onClick={() => setConfirmDelete(null)}
                    style={{
                      padding: '0.35rem 0.5rem', borderRadius: 6,
                      background: 'var(--color-surface-700)', border: '1px solid rgba(255,255,255,0.1)',
                      color: 'var(--color-surface-300)', cursor: 'pointer', fontSize: '0.65rem',
                    }}
                  >
                    No
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmDelete(report.id)}
                  style={{
                    padding: '0.35rem 0.5rem', borderRadius: 6,
                    background: 'transparent', border: '1px solid rgba(255,255,255,0.08)',
                    color: 'var(--color-surface-500)', cursor: 'pointer', transition: 'all 0.15s',
                  }}
                  title="Eliminar"
                >
                  <Trash2 size={11} />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Pagination */}
      {pagination && pagination.total_pages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '0.5rem' }}>
          <span style={{ fontSize: '0.7rem', color: 'var(--color-surface-400)' }}>
            {pagination.total} reportes · Página {pagination.page}/{pagination.total_pages}
          </span>
          <div style={{ display: 'flex', gap: '0.35rem' }}>
            <button
              onClick={() => setPage(p => p - 1)}
              disabled={!pagination.has_prev}
              style={{
                padding: '0.3rem 0.5rem', borderRadius: 6,
                background: 'var(--color-surface-800)', border: '1px solid rgba(255,255,255,0.08)',
                color: pagination.has_prev ? 'var(--color-surface-300)' : 'var(--color-surface-600)',
                cursor: pagination.has_prev ? 'pointer' : 'not-allowed',
              }}
            >
              <ChevronLeft size={12} />
            </button>
            <button
              onClick={() => setPage(p => p + 1)}
              disabled={!pagination.has_next}
              style={{
                padding: '0.3rem 0.5rem', borderRadius: 6,
                background: 'var(--color-surface-800)', border: '1px solid rgba(255,255,255,0.08)',
                color: pagination.has_next ? 'var(--color-surface-300)' : 'var(--color-surface-600)',
                cursor: pagination.has_next ? 'pointer' : 'not-allowed',
              }}
            >
              <ChevronRight size={12} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
