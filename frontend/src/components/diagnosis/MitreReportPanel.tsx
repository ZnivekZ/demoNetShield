import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Target, RefreshCw, Download } from 'lucide-react';
import { aiDiagnosisApi } from '../../services/api';
import ReportMarkdown from './ReportMarkdown';

const fmt = (value: string | null | undefined) => {
  if (!value) return 'sin fecha';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'sin fecha' : date.toLocaleString('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires', day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
};

export default function MitreReportPanel() {
  const queryClient = useQueryClient();
  const [hours, setHours] = useState(168);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const latest = useQuery({ queryKey: ['ai-diagnosis-mitre-latest'], queryFn: aiDiagnosisApi.mitreLatest,
    refetchInterval: query => query.state.data?.data?.status === 'running' ? 2500 : false });
  const history = useQuery({ queryKey: ['ai-diagnosis-mitre-history'], queryFn: aiDiagnosisApi.mitreHistory });
  const selected = useQuery({ queryKey: ['ai-diagnosis-mitre-run', selectedId],
    queryFn: () => aiDiagnosisApi.mitreById(selectedId!), enabled: selectedId !== null });
  const start = useMutation({ mutationFn: aiDiagnosisApi.mitreStart,
    onSuccess: () => {
      setSelectedId(null);
      queryClient.invalidateQueries({ queryKey: ['ai-diagnosis-mitre-latest'] });
      queryClient.invalidateQueries({ queryKey: ['ai-diagnosis-mitre-history'] });
      queryClient.invalidateQueries({ queryKey: ['ai-diagnosis-usage'] });
    } });
  const latestId = latest.data?.data?.id;
  const latestStatus = latest.data?.data?.status;
  useEffect(() => {
    if (latestId && latestStatus !== 'running') {
      queryClient.invalidateQueries({ queryKey: ['ai-diagnosis-mitre-history'] });
      queryClient.invalidateQueries({ queryKey: ['ai-diagnosis-usage'] });
    }
  }, [latestId, latestStatus, queryClient]);
  const run = selectedId === null ? latest.data?.data : selected.data?.data;
  const report = run?.status === 'completed' ? run.report : null;
  const download = () => {
    if (!report?.markdown || !run) return;
    const blob = new Blob([report.markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `informe-mitre-${run.format}-${run.started_at.slice(0, 10)}.md`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return <section className="glass-card p-4 sm:p-5 space-y-4" aria-labelledby="mitre-report-title">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 id="mitre-report-title" className="text-lg font-semibold text-surface-100 flex items-center gap-2">
          <Target className="w-5 h-5 text-indigo-400" /> Informe MITRE del entorno
        </h2>
        <p className="text-xs text-surface-400 mt-1">Dos formatos independientes, generados solo al solicitarlos. El técnico incluye triage por agente; el ejecutivo muestra métricas y decisiones.</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="mitre-period" className="sr-only">Período MITRE</label>
        <select id="mitre-period" value={hours} onChange={event => setHours(Number(event.target.value))}
          className="bg-surface-900 border border-surface-700 text-surface-200 rounded-lg px-2 py-2 text-sm">
          <option value={24}>Últimas 24 h</option><option value={168}>Últimos 7 días</option>
        </select>
        <button type="button" onClick={() => start.mutate({ periodHours: hours, format: 'technical' })} disabled={start.isPending || latestStatus === 'running'}
          className="flex items-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-3 py-2 text-sm font-medium">
          <RefreshCw className={`w-4 h-4 ${latestStatus === 'running' ? 'animate-spin' : ''}`} />
          {latestStatus === 'running' ? 'Generando…' : 'Informe técnico'}
        </button>
        <button type="button" onClick={() => start.mutate({ periodHours: hours, format: 'executive' })} disabled={start.isPending || latestStatus === 'running'}
          className="rounded-lg bg-cyan-700 hover:bg-cyan-600 disabled:opacity-50 text-white px-3 py-2 text-sm font-medium">Informe ejecutivo</button>
      </div>
    </div>

    {(history.data?.data?.length || 0) > 1 && <div className="flex items-center gap-2 text-xs">
      <label htmlFor="mitre-history" className="text-surface-400">Informe guardado</label>
      <select id="mitre-history" value={selectedId ?? ''} onChange={event => setSelectedId(event.target.value ? Number(event.target.value) : null)}
        className="bg-surface-900 border border-surface-700 text-surface-200 rounded px-2 py-1">
        <option value="">Último informe</option>
        {history.data?.data?.filter(item => item.id !== latestId).map(item => <option key={item.id} value={item.id}>
          {fmt(item.started_at)} · {item.format === 'executive' ? 'Ejecutivo' : item.format === 'technical' ? 'Técnico' : 'Anterior'} · {item.period_hours === 24 ? '24 h' : '7 días'} · {item.status}
        </option>)}
      </select>
    </div>}

    {!run && !latest.isLoading && <p className="text-sm text-surface-400">Todavía no hay informes MITRE. Elegí un período y generá el formato que necesitás.</p>}
    {run?.status === 'running' && <p role="status" className="text-sm text-cyan-300">Consultando todas las alertas mapeadas del período y preparando el informe…</p>}
    {run?.status === 'failed' && <p role="alert" className="text-sm text-red-300">Informe interrumpido: {run.error || 'error no especificado'}</p>}
    {start.isError && <p role="alert" className="text-sm text-red-300">No se pudo iniciar el informe: {(start.error as Error).message}</p>}
    {(latest.isError || selected.isError) && <p role="alert" className="text-sm text-red-300">No se pudo leer el informe MITRE.</p>}

    {report?.markdown ? <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-surface-500">{run?.format === 'executive' ? 'Informe ejecutivo' : 'Informe técnico'} · {fmt(report.period_start)} → {fmt(report.period_end)} · generado {fmt(run?.started_at)}</p>
        <button type="button" onClick={download} className="flex items-center gap-1.5 rounded-lg border border-surface-700 px-3 py-1.5 text-xs text-cyan-300 hover:bg-surface-800">
          <Download className="w-3.5 h-3.5" /> Descargar Markdown
        </button>
      </div>
      {run?.ai_error && <p className="text-xs text-amber-300">Groq: {run.ai_error}. El informe mantiene las métricas verificadas de Wazuh.</p>}
      <ReportMarkdown markdown={report.markdown} />
    </div> : report && <>
      <p className="text-xs text-surface-500">{fmt(report.period_start)} → {fmt(report.period_end)} (Argentina) · generado {fmt(run?.started_at)}</p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
        {[
          ['Alertas totales', report.total_alerts],
          ['Con MITRE', report.mapped_alerts],
          ['Sin mapeo', report.unmapped_alerts],
          ['Agentes con detecciones', report.agents.length],
        ].map(([label, value]) => <div key={label} className="rounded-lg bg-surface-900/40 px-3 py-2">
          <p className="text-xs text-surface-500">{label}</p><p className="text-surface-200 font-semibold">{Number(value).toLocaleString('es-AR')}</p>
        </div>)}
      </div>
      <p className="text-xs text-surface-500">{report.count_note} El mapeo de una regla indica qué investigar; no confirma un ataque.</p>
      {report.mapped_without_agent > 0 && <p className="text-xs text-amber-300">{report.mapped_without_agent} alertas MITRE no tienen agente identificable y no aparecen en el desglose.</p>}
      {run?.ai?.summary && <div className="rounded-lg border border-indigo-500/20 bg-indigo-500/5 p-3">
        <p className="text-xs text-indigo-300 font-semibold">Interpretación IA · {run.ai_model} · {run.tokens_used?.toLocaleString('es-AR') || 0} tokens</p>
        <p className="text-sm text-surface-200 mt-1">{run.ai.summary}</p>
        {run.ai.findings.length > 0 && <ul className="mt-2 space-y-2 text-xs text-surface-300">
          {run.ai.findings.map(item => <li key={item.technique_id}>
            <strong className="text-surface-200">{item.technique_id}</strong> · {item.interpretation} {item.action && <span className="text-cyan-300">Acción: {item.action}</span>}
          </li>)}
        </ul>}
        {run.ai.limitations.length > 0 && <p className="text-xs text-surface-500 mt-2">Límites: {run.ai.limitations.join(' · ')}</p>}
      </div>}
      {run?.ai_error && <p className="text-xs text-amber-300">Interpretación IA no disponible: {run.ai_error}. El informe de Wazuh sigue disponible.</p>}
      {report.tactics.length > 0 && <div>
        <h3 className="text-sm font-semibold text-surface-100 mb-2">Tácticas ({report.tactics.length})</h3>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {report.tactics.map(item => <div key={item.name} className="rounded-lg border border-surface-800 px-3 py-2 text-xs">
            <strong className="text-surface-200">{item.name}</strong>
            <p className="text-surface-400 mt-1">{item.technique_ids.length} técnicas · {item.count_associations} asociaciones · {item.agent_count} agentes · nivel máximo {item.max_level}</p>
          </div>)}
        </div>
      </div>}
      <div>
        <h3 className="text-sm font-semibold text-surface-100 mb-2">Técnicas observadas ({report.techniques.length})</h3>
        {report.techniques.length ? <div className="space-y-2">
          {report.techniques.map(item => <details key={item.technique_id} className="rounded-lg border border-surface-800 p-3">
            <summary className="cursor-pointer text-sm text-surface-200">
              <strong>{item.technique_id}</strong> · {item.technique_name} · {item.count} asociaciones · nivel máximo {item.max_level} · {item.agents.length} agentes
            </summary>
            <p className="text-xs text-surface-400 mt-2">Tácticas: {item.tactics.join(', ') || 'sin táctica informada'} · primera: {fmt(item.first)} · última: {fmt(item.last)}</p>
            <p className="text-xs text-surface-400 mt-1">Ejemplo: regla {item.sample.rule_id || 'sin ID'} · {item.sample.description || 'sin descripción'}{item.sample.source_ip ? ` · IP origen ${item.sample.source_ip}` : ''}</p>
            <p className="text-xs text-surface-500 mt-1">Agentes: {item.agents.map(agent => `${agent.agent_name} (${agent.count})`).join(' · ')}</p>
          </details>)}
        </div> : <p className="text-sm text-surface-400">No hubo alertas con mapeo MITRE en el período consultado.</p>}
      </div>
      {report.agents.length > 0 && <div>
        <h3 className="text-sm font-semibold text-surface-100 mb-2">Desglose por agente con detecciones</h3>
        <div className="grid gap-2 md:grid-cols-2">
          {report.agents.map(agent => <details key={agent.agent_id} className="rounded-lg border border-surface-800 p-3">
            <summary className="cursor-pointer text-sm text-surface-200"><strong>{agent.agent_name}</strong> · {agent.techniques.length} técnicas · nivel máximo {agent.max_level}</summary>
            <ul className="space-y-1 mt-2 text-xs text-surface-400">
              {agent.techniques.map(item => <li key={item.technique_id}>
                {item.technique_id} · {item.technique_name} · {item.count} asociaciones · última {fmt(item.last)} · regla {item.sample.rule_id || 'sin ID'}
              </li>)}
            </ul>
          </details>)}
        </div>
      </div>}
    </>}
  </section>;
}
