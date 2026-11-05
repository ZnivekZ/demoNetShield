import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bot, Clock3, ExternalLink, RefreshCw, Server, ShieldAlert } from 'lucide-react';
import { aiDiagnosisApi } from '../../services/api';
import type { AgentDiagnosis, DiagnosisStatus } from '../../types';
import { CveUsageContext } from '../wazuh/CveUsageStatus';
import MitreReportPanel from './MitreReportPanel';

const STATUS: Record<DiagnosisStatus, { label: string; className: string; order: number }> = {
  attention_high: { label: 'Atención alta', className: 'text-red-300 bg-red-500/10 border-red-500/20', order: 0 },
  review: { label: 'Revisar', className: 'text-amber-300 bg-amber-500/10 border-amber-500/20', order: 1 },
  unassessed: { label: 'Datos insuficientes', className: 'text-surface-300 bg-surface-700/30 border-surface-600/30', order: 2 },
  no_indications: { label: 'Sin indicios', className: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20', order: 3 },
};
const RUN_STATUS = { running: 'en curso', completed: 'completa', failed: 'interrumpida' };

const fmt = (value: string | null | undefined) => {
  if (!value || value.startsWith('9999-')) return 'sin fecha';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'sin fecha';
  return date.toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires',
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const calendarDate = (value: string | null | undefined) => {
  const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : 'sin fecha';
};

const severityLabel = (value: string) => ({ critical: 'Crítica', high: 'Alta', medium: 'Media', low: 'Baja' }[value.toLowerCase()] || 'Sin clasificar');

const portLabel = (port: { local_ip: string; local_port: number; protocol: string; process: string }) =>
  `${port.local_ip || '?'}:${port.local_port}/${port.protocol}${port.process ? ` (${port.process})` : ''}`;

function compareAgentRuns(current: AgentDiagnosis[], previous: AgentDiagnosis[]) {
  const prior = new Map(previous.map(report => [report.agent_id, report]));
  const rows: { name: string; notes: string[] }[] = [];
  for (const report of current) {
    const older = prior.get(report.agent_id);
    if (!older) {
      rows.push({ name: report.name, notes: ['Agente incorporado a esta consulta'] });
      continue;
    }
    const notes: string[] = [];
    if (report.status !== older.status) notes.push(`Estado: ${STATUS[older.status].label} → ${STATUS[report.status].label}`);
    if (report.snapshot.cves_available && older.snapshot.cves_available) {
      const before = new Set(older.snapshot.cves.map(item => item.cve_id));
      const after = new Set(report.snapshot.cves.map(item => item.cve_id));
      const added = [...after].filter(id => !before.has(id));
      const absent = [...before].filter(id => !after.has(id));
      if (added.length) notes.push(`CVE ahora informados: ${added.slice(0, 3).join(', ')}${added.length > 3 ? ` y ${added.length - 3} más` : ''}`);
      if (absent.length) notes.push(`CVE ya no informados: ${absent.slice(0, 3).join(', ')}${absent.length > 3 ? ` y ${absent.length - 3} más` : ''}`);
    } else if (report.snapshot.cves_available !== older.snapshot.cves_available) notes.push('Cambió la disponibilidad del inventario CVE');
    if (report.snapshot.ports_scanned_at && older.snapshot.ports_scanned_at) {
      const key = (port: AgentDiagnosis['snapshot']['ports'][number]) => `${port.local_ip}:${port.local_port}/${port.protocol}`;
      const before = new Set(older.snapshot.ports.map(key));
      const after = new Set(report.snapshot.ports.map(key));
      const added = [...after].filter(port => !before.has(port));
      const absent = [...before].filter(port => !after.has(port));
      if (added.length) notes.push(`Puertos ahora en escucha: ${added.slice(0, 3).join(', ')}`);
      if (absent.length) notes.push(`Puertos ya no informados: ${absent.slice(0, 3).join(', ')}`);
    }
    if (report.snapshot.alerts && older.snapshot.alerts && report.snapshot.alerts.observed_count !== older.snapshot.alerts.observed_count) {
      notes.push(`Alertas en ventanas de 24 h: ${older.snapshot.alerts.observed_count} → ${report.snapshot.alerts.observed_count}`);
    }
    if (notes.length) rows.push({ name: report.name, notes });
  }
  return rows;
}

function AgentCard({ report }: { report: AgentDiagnosis }) {
  const { snapshot: s } = report;
  const status = STATUS[report.status];
  const ports = s.ports.slice(0, 8);
  const uniqueCves = new Set(s.cves.map(item => item.cve_id)).size;
  const cveById = new Map<string, typeof s.cves[number]>();
  for (const item of s.cves) if (!cveById.has(item.cve_id)) cveById.set(item.cve_id, item);
  const previewCves = [...cveById.values()].slice(0, 5);
  const severityByCve = new Map<string, string>();
  const severityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, unknown: 4 };
  for (const cve of s.cves) {
    const current = severityByCve.get(cve.cve_id);
    if (!current || (severityOrder[cve.severity] ?? 4) < (severityOrder[current] ?? 4)) severityByCve.set(cve.cve_id, cve.severity);
  }
  const severityCounts = Object.fromEntries(['critical', 'high', 'medium', 'low', 'unknown'].map(level =>
    [level, [...severityByCve.values()].filter(value => value === level).length]));
  const kevCount = new Set(s.cves.filter(item => item.is_kev === true).map(item => item.cve_id)).size;
  const standoutAlerts = (s.alerts?.highlights || []).filter(highlight =>
    !s.alerts?.top_rules.slice(0, 5).some(rule => rule.rule_id === highlight.rule_id));
  return (
    <article className="glass-card p-4 sm:p-5 space-y-3 min-w-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Server className="w-4 h-4 text-cyan-400 shrink-0" />
            <h3 className="text-base font-semibold text-surface-100 truncate">{report.name || report.agent_id}</h3>
          </div>
          <p className="text-xs text-surface-400 mt-1 break-words">
            {s.ip || 'IP no disponible'} · {s.os || 'SO no disponible'} · Wazuh {s.wazuh_status || 'sin estado'}
          </p>
          <p className="text-xs text-surface-500 mt-1">Último contacto: {fmt(s.last_seen)}</p>
        </div>
        <span className={`text-xs font-medium border rounded-full px-2.5 py-1 whitespace-nowrap ${status.className}`}>
          {status.label}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm">
        <div className="rounded-lg bg-surface-900/40 px-3 py-2">
          <p className="text-xs text-surface-500">Puertos en escucha</p>
          <p className="text-surface-200 mt-1">{s.ports_scanned_at ? s.ports.length : 'Sin datos'}</p>
        </div>
        <div className="rounded-lg bg-surface-900/40 px-3 py-2">
          <p className="text-xs text-surface-500">CVE en inventario</p>
          <p className="text-surface-200 mt-1">{s.cves_available ? uniqueCves : 'Sin datos'}</p>
        </div>
        <div className="rounded-lg bg-surface-900/40 px-3 py-2">
          <p className="text-xs text-surface-500">Alertas 24 h</p>
          <p className="text-surface-200 mt-1">{s.alerts ? `${s.alerts.truncated ? '≥' : ''}${s.alerts.observed_count}` : 'Sin datos'}</p>
        </div>
      </div>

      {s.gaps.length > 0 && <p className="text-xs text-amber-300">
        Datos a verificar: {s.gaps.slice(0, 2).join(' · ')}{s.gaps.length > 2 ? ` · y ${s.gaps.length - 2} más` : ''}
      </p>}

      {report.ai?.assessment ? (
        <p className="text-sm text-surface-200 leading-relaxed">{report.ai.assessment}</p>
      ) : (
        <p className="text-sm text-surface-400">{report.ai_error || 'Interpretación IA no disponible.'}</p>
      )}
      <div className="grid gap-2 text-xs">
        <p className="text-surface-300"><strong className="text-surface-100">CVE:</strong> {report.ai?.cve_situation || (s.cves_available
          ? `${uniqueCves} CVE en inventario; ${severityCounts.critical} críticos, ${severityCounts.high} altos${kevCount ? ` y ${kevCount} CISA KEV` : ''}.`
          : 'Inventario no disponible.')}</p>
        <p className="text-surface-300"><strong className="text-surface-100">Alertas:</strong> {report.ai?.alerts_situation || (s.alerts
          ? `${s.alerts.observed_count} eventos en 24 h${s.alerts.top_rules[0] ? `; predominó la regla ${s.alerts.top_rules[0].rule_id} (${s.alerts.top_rules[0].count}).` : '.'}`
          : 'Alertas no disponibles.')}</p>
        <p className="text-surface-300"><strong className="text-surface-100">A tener en cuenta:</strong> {report.ai?.interesting ||
          (s.gaps[0] || `Último contacto Wazuh: ${fmt(s.last_seen)}.`)}</p>
      </div>
      {report.model && <p className="text-xs text-surface-500">Modelo: {report.model}{report.tokens_used ? ` · ${report.tokens_used.toLocaleString('es-AR')} tokens` : ''}</p>}

      <details className="border-t border-surface-700/50 pt-3 group">
        <summary className="text-sm text-cyan-400 font-medium cursor-pointer list-none flex items-center gap-2">
          Evidencia y acciones <span className="text-xs text-surface-500 group-open:rotate-180">⌄</span>
        </summary>
        <div className="mt-3 space-y-4 text-sm">
          {s.gaps.length > 0 && (
            <div>
              <p className="font-medium text-amber-300">Cobertura incompleta</p>
              <ul className="list-disc pl-5 text-surface-300 mt-1">{s.gaps.map(gap => <li key={gap}>{gap}</li>)}</ul>
            </div>
          )}
          {(s.fim_last_scan || s.rootcheck_last_scan) && <p className="text-xs text-surface-500">
            Último FIM: {fmt(s.fim_last_scan)} · Último Rootcheck: {fmt(s.rootcheck_last_scan)}
          </p>}
          <div>
            <p className="font-medium text-surface-200">Puertos locales en escucha</p>
            <p className="text-xs text-surface-500">Escaneo Wazuh: {fmt(s.ports_scanned_at)}. No indica acceso desde Internet.</p>
            <p className="text-surface-300 mt-1">
              {ports.length ? ports.map(portLabel).join(' · ') : 'Sin puertos confirmados en el inventario disponible'}
            </p>
            {s.ports.length > ports.length && <details className="mt-1">
              <summary className="text-xs text-cyan-400 cursor-pointer">Ver {s.ports.length - ports.length} puertos más</summary>
              <p className="text-surface-300 mt-1 break-words">{s.ports.slice(ports.length).map(portLabel).join(' · ')}</p>
            </details>}
          </div>
          <div>
            <p className="font-medium text-surface-200">CVE presentes en inventario Wazuh</p>
            <p className="text-xs text-surface-500">{s.cves_available
              ? `${uniqueCves} CVE únicos · ${s.cves.length} hallazgos por paquete · consultado ${fmt(s.cves_checked_at)}`
              : 'No se pudo consultar el inventario; cero no indica ausencia.'}</p>
            {s.cves_available && <p className="text-xs text-surface-400 mt-1">
              Críticos {severityCounts.critical} · Altos {severityCounts.high} · Medios {severityCounts.medium} · Bajos {severityCounts.low}
              {severityCounts.unknown > 0 && ` · Sin clasificar ${severityCounts.unknown}`}{kevCount > 0 && ` · CISA KEV ${kevCount}`}
            </p>}
            <p className="text-xs text-surface-500 mt-1">Informados en el inventario actual de Wazuh; no confirma explotación ni exposición del componente.</p>
            {s.cves_available ? (
              s.cves.length ? <ul className="mt-2 space-y-1 text-surface-300">
                {previewCves.map(v => <li key={v.cve_id}>
                  <details className="rounded-lg border border-surface-800/70 bg-surface-900/30 px-3 py-2">
                    <summary className="cursor-pointer text-xs">
                      <strong className="text-surface-200">{v.cve_id}</strong> · {severityLabel(v.severity)}{v.is_kev ? ' · CISA KEV' : ''}
                      {' · '}{v.package || 'paquete desconocido'} {v.version || ''}
                    </summary>
                    <div className="mt-2 space-y-1 text-xs text-surface-400">
                      {v.description && <p>{v.description}</p>}
                      <p>Publicado: {calendarDate(v.published_at)} · detectado en agente: {fmt(v.detected_at)} · status Wazuh: {v.wazuh_status || 'no informado'}</p>
                      <CveUsageContext status={v.usage_status} evidence={v.usage_evidence} checkedAt={v.usage_checked_at} />
                      {v.scanner_condition && <p>Condición del escáner: {v.scanner_condition}</p>}
                    </div>
                  </details>
                </li>)}
              </ul> : <p className="text-surface-400 mt-1">Wazuh no informó CVE en su inventario al consultar.</p>
            ) : <p className="text-amber-300 mt-1">No se pudo consultar el estado de CVE.</p>}
            {s.cves.length > previewCves.length && <Link to={`/wazuh/vulnerabilities?agent=${encodeURIComponent(report.agent_id)}`}
              className="inline-block text-xs text-cyan-400 mt-2 hover:underline">Ver inventario actual de este agente ({uniqueCves} CVE en esta consulta) ↗</Link>}
          </div>
          <div>
            <p className="font-medium text-surface-200">Alertas Wazuh de 24 h</p>
            <p className="text-xs text-surface-500">{fmt(s.alerts_window.from)} → {fmt(s.alerts_window.to)} (Argentina)</p>
            {s.alerts ? <ul className="mt-1 space-y-1 text-surface-300">
              {s.alerts.top_rules.slice(0, 5).map(rule => <li key={rule.rule_id}>
                Regla {rule.rule_id} · nivel {rule.level} · {rule.count} evento{rule.count === 1 ? '' : 's'} · {rule.description}
                {rule.source_ips.length > 0 && <span className="text-surface-500"> · origen observado: {rule.source_ips.join(', ')}</span>}
                {rule.latest && <span className="text-surface-500"> · último evento: {fmt(rule.latest)}</span>}
              </li>)}
              {!s.alerts.top_rules.length && <li>Sin alertas registradas en la ventana.</li>}
            </ul> : <p className="text-amber-300 mt-1">Alertas no disponibles.</p>}
            {standoutAlerts.length > 0 && <p className="text-amber-300 mt-2">
              También hubo alertas de mayor nivel: {standoutAlerts.map(alert =>
                `regla ${alert.rule_id} (nivel ${alert.level}) · ${alert.description}`).join(' · ')}
            </p>}
          </div>
          {s.router && (
            <div>
              <p className="font-medium text-surface-200">Contexto MikroTik</p>
              <p className="text-xs text-surface-500">Instantánea: {fmt(s.router.observed_at)}. {s.router.note}</p>
              <p className="text-surface-300 mt-1">{s.router.connection_count_snapshot} conexiones observadas · {s.router.configured_dstnat.length} reglas dst-nat hacia esta IP.</p>
              {s.router.top_inbound.length > 0 && <p className="text-surface-400 mt-1">
                Entrantes: {s.router.top_inbound.slice(0, 3).map(c => `${c.source_ip} → ${c.port}/${c.protocol} (${c.count})`).join(' · ')}
              </p>}
              {s.router.top_outbound.length > 0 && <p className="text-surface-400 mt-1">
                Destinos: {s.router.top_outbound.slice(0, 3).map(c => `${c.destination_ip}:${c.port}/${c.protocol} (${c.count})`).join(' · ')}
              </p>}
              {s.router.configured_dstnat.length > 0 && <p className="text-surface-400 mt-1">
                NAT configurado: {s.router.configured_dstnat.map(rule =>
                  `${rule.dst_port || '?'}${rule.to_ports ? ` → ${rule.to_ports}` : ''}/${rule.protocol || '?'}`).join(' · ')}
              </p>}
            </div>
          )}
          {report.ai?.actions && report.ai.actions.length > 0 && (
            <div>
              <p className="font-medium text-surface-200">Acciones recomendadas para revisión técnica</p>
              <ol className="list-decimal pl-5 mt-1 space-y-2 text-surface-300">
                {report.ai.actions.map((action, i) => <li key={`${action.title}-${i}`}>
                  <strong className="text-surface-200">{action.title}</strong> · {action.detail}
                  {action.source_url && <a href={action.source_url} target="_blank" rel="noopener noreferrer" className="text-cyan-400 inline-flex items-center gap-1 ml-1">Fuente <ExternalLink className="w-3 h-3" /></a>}
                </li>)}
              </ol>
            </div>
          )}
          {report.ai?.uncertainties && report.ai.uncertainties.length > 0 && (
            <p className="text-xs text-surface-400">Límites: {report.ai.uncertainties.join(' · ')}</p>
          )}
          {report.payload_prepared && <details className="border-t border-surface-700/50 pt-2">
            <summary className="text-xs text-cyan-400 cursor-pointer">Ver datos preparados para Groq</summary>
            <pre className="text-xs text-surface-300 whitespace-pre-wrap break-words mt-2 max-h-80 overflow-auto">{JSON.stringify(report.payload_prepared, null, 2)}</pre>
          </details>}
        </div>
      </details>
    </article>
  );
}

export default function AiDiagnosisPage() {
  const queryClient = useQueryClient();
  const [selectedRunId, setSelectedRunId] = useState<number | null>(null);
  const [baselineId, setBaselineId] = useState<number | null>(null);
  const latest = useQuery({ queryKey: ['ai-diagnosis-latest'], queryFn: aiDiagnosisApi.latest,
    refetchInterval: query => query.state.data?.data?.status === 'running' ? 2500 : false });
  const history = useQuery({ queryKey: ['ai-diagnosis-history'], queryFn: aiDiagnosisApi.history });
  const selected = useQuery({ queryKey: ['ai-diagnosis-run', selectedRunId],
    queryFn: () => aiDiagnosisApi.byId(selectedRunId!), enabled: selectedRunId !== null });
  const usage = useQuery({ queryKey: ['ai-diagnosis-usage'], queryFn: aiDiagnosisApi.usage,
    refetchInterval: 30_000 });
  const start = useMutation({ mutationFn: aiDiagnosisApi.start,
    onSuccess: () => { setSelectedRunId(null);
      queryClient.invalidateQueries({ queryKey: ['ai-diagnosis-latest'] });
      queryClient.invalidateQueries({ queryKey: ['ai-diagnosis-history'] });
      queryClient.invalidateQueries({ queryKey: ['ai-diagnosis-usage'] }); } });
  const current = latest.data?.data;
  const currentId = current?.id;
  const currentStatus = current?.status;
  useEffect(() => {
    if (currentId && currentStatus !== 'running') {
      queryClient.invalidateQueries({ queryKey: ['ai-diagnosis-usage'] });
      queryClient.invalidateQueries({ queryKey: ['ai-diagnosis-history'] });
    }
  }, [currentId, currentStatus, queryClient]);
  const run = selectedRunId === null ? current : selected.data?.data;
  const previousOptions = (history.data?.data || []).filter(item => run && item.id < run.id && item.status === 'completed');
  const effectiveBaselineId = previousOptions.some(item => item.id === baselineId) ? baselineId : previousOptions[0]?.id ?? null;
  const baseline = useQuery({ queryKey: ['ai-diagnosis-run', effectiveBaselineId],
    queryFn: () => aiDiagnosisApi.byId(effectiveBaselineId!), enabled: effectiveBaselineId !== null });
  const changes = run && baseline.data?.data ? compareAgentRuns(run.reports, baseline.data.data.reports) : [];
  const reports = [...(run?.reports || [])].sort((a, b) => STATUS[a.status].order - STATUS[b.status].order);
  const modelCounts = reports.reduce<Record<string, number>>((acc, report) => {
    if (report.model) acc[report.model] = (acc[report.model] || 0) + 1;
    return acc;
  }, {});
  const modelsUsed = Object.entries(modelCounts).map(([model, count]) =>
    `${model.split('/').pop()} (${count})`).join(' · ');
  const runTokens = reports.reduce((sum, report) => sum + (report.tokens_used || 0), 0);
  const withoutAi = reports.filter(report => !report.ai).length;
  const counts = reports.reduce<Record<DiagnosisStatus, number>>((acc, report) => {
    acc[report.status] += 1; return acc;
  }, { attention_high: 0, review: 0, unassessed: 0, no_indications: 0 });

  return <div className="space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Bot className="w-5 h-5 text-cyan-400" />
          <h1 className="text-2xl font-bold text-surface-100">Diagnóstico IA</h1>
        </div>
        <p className="text-sm text-surface-400">Estado técnico de tus agentes Wazuh, con contexto de red solo cuando aporta evidencia.</p>
      </div>
      <button type="button" onClick={() => start.mutate()} disabled={start.isPending || current?.status === 'running'}
        className="flex items-center gap-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white px-4 py-2 text-sm font-medium">
        <RefreshCw className={`w-4 h-4 ${current?.status === 'running' ? 'animate-spin' : ''}`} />
        {current?.status === 'running' ? 'Consultando estados…' : 'Consultar estados'}
      </button>
    </div>

    {start.isError && <div role="alert" className="text-sm text-red-300">No se pudo iniciar la consulta: {(start.error as Error).message}</div>}
    {latest.isError && <div role="alert" className="text-sm text-red-300">No se pudo leer el diagnóstico: {(latest.error as Error).message}</div>}
    {selected.isError && <div role="alert" className="text-sm text-red-300">No se pudo leer la consulta anterior: {(selected.error as Error).message}</div>}

    {(history.data?.data?.length || 0) > 1 && <div className="flex items-center gap-2 text-sm">
      <label htmlFor="diagnosis-run-history" className="text-surface-400">Consulta guardada</label>
      <select id="diagnosis-run-history" value={selectedRunId ?? ''}
        onChange={event => setSelectedRunId(event.target.value ? Number(event.target.value) : null)}
        className="bg-surface-900 text-surface-200 border border-surface-700 rounded-lg px-3 py-1.5">
        <option value="">Última consulta</option>
        {history.data?.data?.filter(item => item.id !== current?.id).map(item => <option key={item.id} value={item.id}>
          {fmt(item.started_at)} · {item.processed_agents}/{item.total_agents} agentes · {RUN_STATUS[item.status]}
        </option>)}
      </select>
    </div>}

    <div className="glass-card p-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 text-sm">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <span className="flex items-center gap-1.5 text-surface-300"><Clock3 className="w-4 h-4" />{run ? `Consulta: ${fmt(run.started_at)}` : 'Todavía no hay consultas'}</span>
        {run && <span className="text-surface-300">{run.processed_agents}/{run.total_agents || '…'} agentes procesados</span>}
        {run && <span className="text-red-300">{counts.attention_high} atención alta</span>}
        {run && <span className="text-amber-300">{counts.review} revisar</span>}
        {run && <span className="text-surface-400">{counts.unassessed} con datos insuficientes</span>}
        {run && <span className="text-emerald-300">{counts.no_indications} sin indicios</span>}
        {run && withoutAi > 0 && <span className="text-amber-300">{withoutAi} sin interpretación IA</span>}
      </div>
      {run?.status === 'failed' && <span className="text-red-300">Consulta interrumpida: {run.error || 'error no especificado'}</span>}
    </div>

    {run && previousOptions.length > 0 && <section className="glass-card p-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold text-surface-100">Cambios desde otra consulta</h2>
        <label className="flex items-center gap-2 text-xs text-surface-400">Comparar con
          <select value={effectiveBaselineId ?? ''} onChange={event => setBaselineId(Number(event.target.value))}
            className="bg-surface-900 border border-surface-700 rounded px-2 py-1 text-surface-200">
            {previousOptions.map(item => <option key={item.id} value={item.id}>{fmt(item.started_at)}</option>)}
          </select>
        </label>
      </div>
      <p className="text-xs text-surface-500 mt-1">“Ya no informado” no confirma corrección. Las ventanas de alertas pueden solaparse.</p>
      {baseline.isLoading ? <p className="text-surface-400 mt-3">Cargando comparación…</p>
        : changes.length ? <div className="grid gap-2 mt-3 md:grid-cols-2">
          {changes.slice(0, 8).map(row => <div key={row.name} className="rounded-lg bg-surface-900/40 p-3">
            <strong className="text-surface-200">{row.name}</strong>
            <ul className="text-xs text-surface-400 mt-1 space-y-1">{row.notes.map(note => <li key={note}>{note}</li>)}</ul>
          </div>)}
          {changes.length > 8 && <p className="text-xs text-surface-500">Y {changes.length - 8} agentes más con cambios.</p>}
        </div> : <p className="text-surface-400 mt-3">Sin cambios observados entre las instantáneas disponibles.</p>}
    </section>}

    <div className="glass-card p-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2"><ShieldAlert className="w-4 h-4 text-indigo-400" />
          <span className="font-medium text-surface-200">Groq</span>
          <span className="text-surface-400">{modelsUsed ? `Modelos de esta consulta: ${modelsUsed}` : 'Preferido: gpt-oss-120b · respaldo: gpt-oss-20b'}</span>
          {runTokens > 0 && <span className="text-surface-400">· {runTokens.toLocaleString('es-AR')} tokens en esta consulta</span>}
        </div>
        <span className="text-xs text-surface-500">Saldo diario estimado · uso registrado por NetShield en 24 h</span>
      </div>
      {usage.data?.data && !usage.data.data.configured && <p className="text-xs text-amber-300 mt-2">GROQ_API_KEY no está configurada; el panel mostrará solo hechos de Wazuh.</p>}
      {usage.data?.data?.configured && <div className="flex flex-wrap gap-x-6 gap-y-1 mt-2 text-xs text-surface-300">
        {usage.data.data.models.map(model => <span key={model.model}>
          <strong className="text-surface-200">{model.model.split('/').pop()}</strong>: {model.remaining_24h_estimated === null
            ? 'límite diario no configurado' : `~${model.remaining_24h_estimated.toLocaleString('es-AR')} tokens / 24 h`}
          {model.remaining_1m_estimated != null && ` · ~${model.remaining_1m_estimated.toLocaleString('es-AR')} tokens / minuto`}
        </span>)}
      </div>}
      <p className="text-xs text-surface-500 mt-1">Estimación local: puede diferir si hubo consumo antes de activar el registro o desde otra aplicación o clave. Ajustá los límites según Groq Console.</p>
    </div>

    {run?.status === 'running' && <p role="status" className="text-sm text-cyan-300">Recopilando y analizando agentes. Los resultados aparecen a medida que se completan.</p>}
    {run?.status === 'completed' && run.total_agents === 0 && <p className="text-sm text-surface-400">No se encontraron agentes para evaluar.</p>}
    {!run && !latest.isLoading && !latest.isError && <div className="glass-card p-6 text-surface-400 text-sm">
      Pulsá «Consultar estados» para guardar una instantánea y generar el diagnóstico.
    </div>}
    {reports.length > 0 && <div>
      <h2 className="text-lg font-semibold text-surface-100 mb-1">Agentes</h2>
      <p className="text-xs text-surface-500 mb-3">Ordenados por prioridad. «Sin indicios» se limita a los datos disponibles. MikroTik solo aparece con una IP única y reciente; su ausencia no implica ausencia de tráfico.</p>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {reports.map(report => <AgentCard key={report.agent_id} report={report} />)}
      </div>
    </div>}
    <MitreReportPanel />
  </div>;
}
