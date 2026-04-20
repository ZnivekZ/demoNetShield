import { useState } from 'react';
import { useViewReportGenerator } from '../../../hooks/widgets/hybrid';
import { WidgetHeader } from '../common';
import type { ViewReportResult } from '../../../types';

// APIResponse shape returned by widgetsApi.generateViewReport
interface APIResponse<T> { success: boolean; data?: T; error?: string; }


interface ViewReportGeneratorProps {
  config?: { audience?: string; output?: string };
  viewId?: string;
  widgetIds?: string[];
}

type ReportState = 'idle' | 'generating' | 'done' | 'error';

/**
 * Generador de reportes IA desde los widgets activos en esta vista.
 * Estados: idle → generating (spinner) → done (resultado) | error.
 */
export function ViewReportGenerator({ config, viewId, widgetIds }: ViewReportGeneratorProps) {
  const defaultAudience = (config?.audience as string) ?? 'technical';
  const defaultOutput = (config?.output as string) ?? 'pdf';

  const [audience, setAudience] = useState(defaultAudience);
  const [output, setOutput] = useState(defaultOutput);
  const [state, setState] = useState<ReportState>('idle');
  const [result, setResult] = useState<ViewReportResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const mutation = useViewReportGenerator();

  const handleGenerate = async () => {
    setState('generating');
    setResult(null);
    setErrorMsg(null);
    try {
      const res = await mutation.mutateAsync({
        view_id: viewId ?? 'unknown',
        widget_ids: widgetIds ?? [],
        audience,
        output,
        report_title: `Reporte de vista — ${new Date().toLocaleDateString('es')}`,
      }) as APIResponse<ViewReportResult>;
      if (res.success && res.data) {
        setResult(res.data);
        setState('done');
      } else {
        setErrorMsg((res as { error?: string }).error ?? 'Error generando reporte');
        setState('error');
      }
    } catch (e) {
      setErrorMsg(String(e));
      setState('error');
    }
  };

  return (
    <div className="widget-view-report-generator">
      <WidgetHeader title="Generador de Reporte" />

      {state === 'idle' || state === 'error' ? (
        <div className="widget-view-report-generator__controls">
          <label className="label-sm">Audiencia</label>
          <select className="input input-sm" value={audience} onChange={e => setAudience(e.target.value)}>
            <option value="technical">Técnica (SOC/IT)</option>
            <option value="executive">Ejecutiva (Dirección)</option>
            <option value="compliance">Cumplimiento (Auditoría)</option>
          </select>

          <label className="label-sm mt-2">Salida</label>
          <select className="input input-sm" value={output} onChange={e => setOutput(e.target.value)}>
            <option value="pdf">PDF descargable</option>
            <option value="telegram">Telegram</option>
            <option value="both">PDF + Telegram</option>
          </select>

          {state === 'error' && (
            <p className="text-danger text-xs mt-2">{errorMsg}</p>
          )}

          <button
            className="btn-primary mt-3 w-full"
            onClick={handleGenerate}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? '⏳ Generando…' : '📊 Generar reporte de vista'}
          </button>
        </div>
      ) : state === 'generating' ? (
        <div className="widget-view-report-generator__generating">
          <div className="spinner" />
          <p className="text-muted text-sm">Analizando {(widgetIds ?? []).length} widgets con IA…</p>
          <p className="text-muted text-xs">Esto puede tardar 2-4 segundos</p>
        </div>
      ) : state === 'done' && result ? (
        <div className="widget-view-report-generator__result">
          <div className="widget-view-report-generator__summary">
            <p className="text-sm">{result.report_summary}</p>
          </div>
          <div className="widget-view-report-generator__actions">
            {result.pdf_url && (
              <a
                href={result.pdf_url}
                className="btn-primary btn-sm"
                download
                target="_blank"
                rel="noopener noreferrer"
              >
                📥 Descargar PDF
              </a>
            )}
            {result.telegram_sent && (
              <span className="badge badge--ok">✓ Enviado a Telegram</span>
            )}
            <button className="btn-secondary btn-sm" onClick={() => setState('idle')}>
              Nuevo reporte
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
