import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bot, CalendarDays, RefreshCw, Save, ShieldCheck, SlidersHorizontal } from 'lucide-react';
import { candidateApi } from '../../services/candidateApi';
import type { CandidateRule, CandidateRuleInput } from '../../services/candidateApi';

const todayART = () => {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const value = (type: string) => parts.find(part => part.type === type)?.value || '';
  return `${value('year')}-${value('month')}-${value('day')}`;
};

const emptyRule: CandidateRuleInput = {
  name: '', category: 'custom', sources: 'both', decision_mode: 'ai', enabled: true,
  min_level: 0, min_count: 5, window_minutes: 10, pattern: '', rule_ids: [],
};

const formatTime = (value: string | null | undefined) => value
  ? new Date(value.endsWith('Z') ? value : `${value}Z`).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })
  : '—';

const json = (value: unknown) => JSON.stringify(value, null, 2);

export default function BlockCandidatesPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<'daily' | 'rules' | 'config'>('daily');
  const [day, setDay] = useState(todayART);
  const [ip, setIp] = useState<string | null>(null);
  const [ipSearch, setIpSearch] = useState('');
  const [evaluationId, setEvaluationId] = useState<number | null>(null);
  const [prompt, setPrompt] = useState('');
  const [pollSeconds, setPollSeconds] = useState(60);
  const [includedAgents, setIncludedAgents] = useState('');
  const [excludedAgents, setExcludedAgents] = useState('');
  const [editingRule, setEditingRule] = useState<number | null>(null);
  const [ruleDraft, setRuleDraft] = useState<CandidateRuleInput>(emptyRule);
  const [ruleIdsText, setRuleIdsText] = useState('');
  const [formMessage, setFormMessage] = useState('');

  const config = useQuery({ queryKey: ['candidates', 'config'], queryFn: candidateApi.config });
  const days = useQuery({ queryKey: ['candidates', 'days'], queryFn: candidateApi.days });
  const daily = useQuery({ queryKey: ['candidates', 'daily', day], queryFn: () => candidateApi.daily(day) });
  const rules = useQuery({ queryKey: ['candidates', 'rules'], queryFn: candidateApi.rules });
  const history = useQuery({ queryKey: ['candidates', 'history', ip], queryFn: () => candidateApi.history(ip!), enabled: !!ip });
  const evaluation = useQuery({ queryKey: ['candidates', 'evaluation', evaluationId], queryFn: () => candidateApi.evaluation(evaluationId!), enabled: evaluationId !== null });
  const scanStatus = useQuery({ queryKey: ['candidates', 'scan-status'], queryFn: candidateApi.scanStatus, refetchInterval: 5000 });

  useEffect(() => {
    if (config.data) {
      setPrompt(config.data.prompt_text);
      setPollSeconds(config.data.poll_seconds);
      setIncludedAgents(config.data.included_agent_ids.join(', '));
      setExcludedAgents(config.data.excluded_agent_ids.join(', '));
    }
  }, [config.data]);
  useEffect(() => {
    if (!scanStatus.data?.running && scanStatus.data?.result) {
      void qc.invalidateQueries({ queryKey: ['candidates', 'daily'] });
      void qc.invalidateQueries({ queryKey: ['candidates', 'days'] });
      void qc.invalidateQueries({ queryKey: ['candidates', 'config'] });
      if (ip) void qc.invalidateQueries({ queryKey: ['candidates', 'history', ip] });
    }
  }, [scanStatus.data?.running, scanStatus.data?.result, qc, ip]);

  const scan = useMutation({ mutationFn: () => candidateApi.scan(day), onSuccess: () => { setFormMessage('Análisis iniciado.'); void scanStatus.refetch(); }, onError: (error: Error) => setFormMessage(error.message) });
  const saveConfig = useMutation({ mutationFn: candidateApi.updateConfig, onSuccess: () => { setFormMessage('Configuración guardada.'); void qc.invalidateQueries({ queryKey: ['candidates', 'config'] }); }, onError: (error: Error) => setFormMessage(error.message) });
  const saveRule = useMutation({ mutationFn: (input: CandidateRuleInput) => editingRule === null ? candidateApi.createRule(input) : candidateApi.updateRule(editingRule, input),
    onSuccess: () => { setFormMessage('Regla guardada.'); setEditingRule(null); setRuleDraft(emptyRule); setRuleIdsText(''); void qc.invalidateQueries({ queryKey: ['candidates', 'rules'] }); },
    onError: (error: Error) => setFormMessage(error.message) });

  const edit = (rule: CandidateRule) => {
    const { id: _id, version: _version, ...input } = rule;
    void _id; void _version;
    setEditingRule(rule.id); setRuleDraft(input); setRuleIdsText(rule.rule_ids.join(', ')); setFormMessage('');
  };
  const updateRule = <K extends keyof CandidateRuleInput>(key: K, value: CandidateRuleInput[K]) => setRuleDraft(old => ({ ...old, [key]: value }));
  const splitAgents = (value: string) => value.split(',').map(item => item.trim()).filter(Boolean);

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto text-surface-100">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><ShieldCheck className="text-brand-400" /> Candidatas a bloqueo</h1>
          <p className="text-sm text-surface-400 mt-1">Experimento aislado: decisiones registradas, sin carga a la lista de bloqueo ni al MikroTik.</p>
        </div>
        <div className="text-xs text-surface-400 bg-surface-900 rounded-lg px-3 py-2 border border-surface-800">
          {config.data?.enabled ? 'Monitoreo automático activo' : 'Monitoreo automático pausado'} · Zona horaria ART
        </div>
      </div>

      <div className="flex gap-2 border-b border-surface-800 pb-2">
        {([['daily', 'Por día', CalendarDays], ['rules', 'Reglas', SlidersHorizontal], ['config', 'Configuración e IA', Bot]] as const).map(([key, label, Icon]) => (
          <button key={key} onClick={() => setTab(key)} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${tab === key ? 'bg-brand-600 text-white' : 'text-surface-400 hover:bg-surface-800'}`}><Icon size={16} />{label}</button>
        ))}
      </div>

      {formMessage && <div role="status" className="text-sm bg-surface-900 border border-surface-700 rounded-lg p-3">{formMessage}</div>}

      {tab === 'daily' && <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-sm">Día <input type="date" value={day} max={todayART()} onChange={event => { setDay(event.target.value); setIp(null); setEvaluationId(null); }} className="ml-2 bg-surface-900 border border-surface-700 rounded-lg px-3 py-2 text-surface-100" /></label>
          <button onClick={() => scan.mutate()} disabled={scan.isPending || scanStatus.data?.running} className="flex items-center gap-2 bg-brand-600 hover:bg-brand-500 disabled:opacity-50 rounded-lg px-4 py-2 text-sm"><RefreshCw size={15} /> Analizar día</button>
          {scanStatus.data?.running && <span className="text-sm text-brand-300">Analizando eventos…</span>}
          {scanStatus.data?.error && <span className="text-sm text-red-400">{scanStatus.data.error}</span>}
          <form onSubmit={event => { event.preventDefault(); setIp(ipSearch.trim()); setEvaluationId(null); }} className="flex gap-2 ml-auto">
            <input aria-label="Buscar historial de IP" placeholder="Historial de IP" value={ipSearch} onChange={event => setIpSearch(event.target.value)} className="bg-surface-900 border border-surface-700 rounded-lg px-3 py-2 text-sm" />
            <button className="border border-surface-700 rounded-lg px-3 py-2 text-sm">Buscar</button>
          </form>
        </div>
        {config.data?.last_error && <p className="text-sm text-red-400">Último error: {config.data.last_error}</p>}
        {Array.isArray(config.data?.last_run?.warnings) && (config.data.last_run.warnings as string[]).map(warning => <p key={warning} className="text-sm text-amber-300">{warning}</p>)}
        <div className="flex flex-wrap gap-2 text-xs">{days.data?.slice(0, 30).map(item => <button key={item.day} onClick={() => setDay(item.day)} className={`px-3 py-1.5 rounded-full border ${day === item.day ? 'border-brand-400 text-brand-300' : 'border-surface-700 text-surface-400'}`}>{item.day} · {item.count}</button>)}</div>
        <div className="bg-surface-900 border border-surface-800 rounded-xl overflow-x-auto">
          <table className="w-full text-sm"><thead className="text-surface-400 text-left bg-surface-800/50"><tr>{['IP', 'Primera / última hora', 'Motivos', 'Agentes', 'Origen', 'Eventos/ventana', 'Reincidencia'].map(label => <th key={label} className="p-3 font-medium">{label}</th>)}</tr></thead>
            <tbody>{daily.data?.map(row => <tr key={row.id} className="border-t border-surface-800 hover:bg-surface-800/40 cursor-pointer" onClick={() => { setIp(row.ip); setEvaluationId(null); }}>
              <td className="p-3 font-mono text-brand-300">{row.ip}</td><td className="p-3 whitespace-nowrap">{formatTime(row.first_seen)}<br />{formatTime(row.last_seen)}</td>
              <td className="p-3 min-w-[250px]">{row.reasons.join('; ')}</td><td className="p-3">{row.agent_names.join(', ')}</td>
              <td className="p-3">{row.decision_source === 'automatic+ai' ? 'Automático + IA' : row.decision_source === 'ai' ? 'IA' : 'Automático'}<br /><span className="text-xs text-surface-500">{row.sources.join(', ')}</span></td>
              <td className="p-3">{row.event_count}</td><td className="p-3">{row.days_seen} día(s)</td>
            </tr>)}</tbody></table>
          {daily.isLoading && <p className="p-4 text-sm text-surface-400">Cargando…</p>}
          {daily.isError && <p className="p-4 text-sm text-red-400">No se pudo cargar el día.</p>}
          {daily.data?.length === 0 && <p className="p-4 text-sm text-surface-400">No hay IP con decisión SI para este día. Podés analizarlo manualmente.</p>}
        </div>
        {ip && <div className="bg-surface-900 border border-surface-800 rounded-xl p-5 space-y-4">
          <div className="flex justify-between"><h2 className="text-lg font-semibold">Historial de {ip}</h2><button onClick={() => { setIp(null); setEvaluationId(null); }} className="text-sm text-surface-400">Cerrar</button></div>
          <p className="text-sm text-surface-400">{history.data?.days_seen ?? '…'} días con decisión SI. Se conservan también las evaluaciones NO.</p>
          {history.isError && <p className="text-sm text-red-400">IP inválida o no se pudo cargar el historial.</p>}
          <div className="space-y-2">{history.data?.evaluations.map(item => <button key={item.id} onClick={() => setEvaluationId(item.id)} className={`w-full text-left border rounded-lg p-3 text-sm ${evaluationId === item.id ? 'border-brand-400' : 'border-surface-700'}`}>
            <span className={item.decision === 'SI' ? 'text-green-400 font-bold' : 'text-surface-400 font-bold'}>{item.decision}</span> · {item.day} · {formatTime(item.decided_at)} · {item.rule_name} · {item.decision_source === 'ai' ? 'IA' : item.decision_source === 'fallback' ? 'NO técnico' : 'Automático'}<br /><span className="text-surface-300">{item.reason}</span>
          </button>)}</div>
          {evaluation.data && <div className="space-y-3 border-t border-surface-700 pt-4">
            <h3 className="font-semibold">Evaluación #{evaluation.data.id}</h3>
            <p className="text-sm">{evaluation.data.decision} · {evaluation.data.reason}</p>
            {evaluation.data.technical_reason && <p className="text-sm text-amber-300">Motivo técnico: {evaluation.data.technical_reason}</p>}
            <p className="text-xs text-surface-400">Modelo: {evaluation.data.ai_model || '—'} · Prompt versión {evaluation.data.prompt_version || '—'} · {evaluation.data.event_count} eventos</p>
            <details open><summary className="cursor-pointer text-sm">Datos exactos enviados a la IA / evidencia de regla</summary><pre className="mt-2 p-3 bg-surface-950 rounded-lg overflow-auto text-xs max-h-96">{json(evaluation.data.payload)}</pre></details>
            {evaluation.data.prompt_snapshot && <details><summary className="cursor-pointer text-sm">Instrucción exacta usada</summary><pre className="mt-2 p-3 bg-surface-950 rounded-lg overflow-auto whitespace-pre-wrap text-xs max-h-96">{evaluation.data.prompt_snapshot}</pre></details>}
            {evaluation.data.ai_response && <details><summary className="cursor-pointer text-sm">Respuesta completa de Groq</summary><pre className="mt-2 p-3 bg-surface-950 rounded-lg overflow-auto text-xs max-h-96">{json(evaluation.data.ai_response)}</pre></details>}
            <details><summary className="cursor-pointer text-sm">Regla aplicada</summary><pre className="mt-2 p-3 bg-surface-950 rounded-lg overflow-auto text-xs">{json(evaluation.data.rule_snapshot)}</pre></details>
          </div>}
        </div>}
      </div>}

      {tab === 'rules' && <div className="space-y-5">
        <p className="text-sm text-surface-400">Las reglas se aplican a todos los agentes incluidos. Los fallos se cuentan dentro de la ventana indicada; alertas y archives del mismo evento se deduplican.</p>
        <div className="grid gap-3 md:grid-cols-2">{rules.data?.map(rule => <div key={rule.id} className="bg-surface-900 border border-surface-800 rounded-xl p-4">
          <div className="flex justify-between gap-3"><h3 className="font-medium">{rule.name}</h3><button onClick={() => edit(rule)} className="text-sm text-brand-300">Editar</button></div>
          <p className="text-xs text-surface-400 mt-2">{rule.enabled ? 'Activa' : 'Pausada'} · {rule.category} · {rule.sources} · {rule.decision_mode === 'ai' ? 'IA' : 'Automático'} · {rule.min_count} eventos / {rule.window_minutes} min · nivel ≥{rule.min_level} · versión {rule.version}</p>
          {rule.pattern && <p className="font-mono text-xs mt-2">{rule.pattern}</p>}
        </div>)}</div>
        <form onSubmit={event => { event.preventDefault(); setFormMessage(''); saveRule.mutate({ ...ruleDraft, rule_ids: splitAgents(ruleIdsText) }); }} className="bg-surface-900 border border-surface-800 rounded-xl p-5 space-y-4">
          <h2 className="font-semibold">{editingRule === null ? 'Nueva regla' : `Editar regla #${editingRule}`}</h2>
          <div className="grid md:grid-cols-3 gap-3">
            <label className="text-xs">Nombre<input required value={ruleDraft.name} onChange={e => updateRule('name', e.target.value)} className="w-full mt-1 bg-surface-950 border border-surface-700 rounded-lg p-2 text-sm" /></label>
            <label className="text-xs">Categoría<select value={ruleDraft.category} onChange={e => updateRule('category', e.target.value as CandidateRuleInput['category'])} className="w-full mt-1 bg-surface-950 border border-surface-700 rounded-lg p-2 text-sm">{['custom', 'ssh', 'windows', 'web', 'critical'].map(x => <option key={x}>{x}</option>)}</select></label>
            <label className="text-xs">Fuente<select value={ruleDraft.sources} onChange={e => updateRule('sources', e.target.value as CandidateRuleInput['sources'])} className="w-full mt-1 bg-surface-950 border border-surface-700 rounded-lg p-2 text-sm"><option value="both">alerts + archives</option><option value="alerts">alerts</option><option value="archives">archives</option></select></label>
            <label className="text-xs">Decisión<select value={ruleDraft.decision_mode} onChange={e => updateRule('decision_mode', e.target.value as CandidateRuleInput['decision_mode'])} className="w-full mt-1 bg-surface-950 border border-surface-700 rounded-lg p-2 text-sm"><option value="automatic">Automática (SI)</option><option value="ai">Groq (SI/NO)</option></select></label>
            <label className="text-xs">Cantidad mínima<input type="number" min="1" max="1000" value={ruleDraft.min_count} onChange={e => updateRule('min_count', Number(e.target.value))} className="w-full mt-1 bg-surface-950 border border-surface-700 rounded-lg p-2 text-sm" /></label>
            <label className="text-xs">Ventana (minutos)<input type="number" min="1" max="1440" value={ruleDraft.window_minutes} onChange={e => updateRule('window_minutes', Number(e.target.value))} className="w-full mt-1 bg-surface-950 border border-surface-700 rounded-lg p-2 text-sm" /></label>
            <label className="text-xs">Nivel Wazuh mínimo<input type="number" min="0" max="16" value={ruleDraft.min_level} onChange={e => updateRule('min_level', Number(e.target.value))} className="w-full mt-1 bg-surface-950 border border-surface-700 rounded-lg p-2 text-sm" /></label>
            <label className="text-xs md:col-span-2">IDs Wazuh (separados por coma)<input value={ruleIdsText} onChange={e => setRuleIdsText(e.target.value)} className="w-full mt-1 bg-surface-950 border border-surface-700 rounded-lg p-2 text-sm" /></label>
          </div>
          <label className="text-xs block">Patrón adicional (expresión regular)<input value={ruleDraft.pattern} onChange={e => updateRule('pattern', e.target.value)} className="w-full mt-1 bg-surface-950 border border-surface-700 rounded-lg p-2 text-sm font-mono" /></label>
          <label className="text-sm flex items-center gap-2"><input type="checkbox" checked={ruleDraft.enabled} onChange={e => updateRule('enabled', e.target.checked)} /> Activa</label>
          <div className="flex gap-3"><button disabled={saveRule.isPending} className="bg-brand-600 rounded-lg px-4 py-2 text-sm flex items-center gap-2"><Save size={15} /> Guardar regla</button>{editingRule !== null && <button type="button" onClick={() => { setEditingRule(null); setRuleDraft(emptyRule); setRuleIdsText(''); }} className="text-sm text-surface-400">Cancelar</button>}</div>
        </form>
      </div>}

      {tab === 'config' && <div className="space-y-5 max-w-4xl">
        <div className="bg-surface-900 border border-surface-800 rounded-xl p-5 space-y-4">
          <h2 className="font-semibold">Lectura automática</h2>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!config.data?.enabled} onChange={e => saveConfig.mutate({ enabled: e.target.checked })} /> Activar monitoreo periódico</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!config.data?.include_archives} onChange={e => saveConfig.mutate({ include_archives: e.target.checked })} /> Incluir archives indexados</label>
          <p className="text-xs text-surface-400">Archives requiere índices wazuh-archives-* en Wazuh Indexer. El archive del Manager puede registrar eventos recibidos de todos los agentes, según los logs que cada uno envíe.</p>
          <label className="text-sm block">Intervalo (segundos, mínimo 60)<input type="number" min="60" max="3600" value={pollSeconds} onChange={e => setPollSeconds(Number(e.target.value))} className="ml-3 w-24 bg-surface-950 border border-surface-700 rounded-lg p-2" /></label>
          <button onClick={() => saveConfig.mutate({ poll_seconds: pollSeconds })} disabled={pollSeconds < 60 || pollSeconds > 3600} className="border border-surface-700 rounded-lg px-3 py-2 text-sm disabled:opacity-50">Guardar intervalo</button>
          <div className="grid md:grid-cols-2 gap-3">
            <label className="text-xs">Solo estos IDs de agente (vacío = todos)<input value={includedAgents} onChange={e => setIncludedAgents(e.target.value)} className="w-full mt-1 bg-surface-950 border border-surface-700 rounded-lg p-2 text-sm" /></label>
            <label className="text-xs">Excluir IDs de agente<input value={excludedAgents} onChange={e => setExcludedAgents(e.target.value)} className="w-full mt-1 bg-surface-950 border border-surface-700 rounded-lg p-2 text-sm" /></label>
          </div>
          <button onClick={() => saveConfig.mutate({ included_agent_ids: splitAgents(includedAgents), excluded_agent_ids: splitAgents(excludedAgents) })} className="bg-brand-600 rounded-lg px-4 py-2 text-sm">Guardar agentes</button>
          <p className="text-xs text-surface-500">Última consulta: {formatTime(config.data?.last_run_at)} · {json(config.data?.last_run ?? {})}</p>
        </div>
        <div className="bg-surface-900 border border-surface-800 rounded-xl p-5 space-y-3">
          <h2 className="font-semibold">Instrucción completa para Groq</h2>
          <p className="text-xs text-surface-400">Modelo principal: openai/gpt-oss-120b; reserva: openai/gpt-oss-20b. Cada evaluación conserva la instrucción y los datos exactos enviados. Si Groq falla, se registra NO técnico.</p>
          <textarea value={prompt} onChange={e => setPrompt(e.target.value)} rows={15} className="w-full bg-surface-950 border border-surface-700 rounded-lg p-3 text-sm font-mono" />
          <div className="flex items-center gap-3"><button onClick={() => saveConfig.mutate({ prompt_text: prompt })} disabled={saveConfig.isPending || !prompt.trim()} className="bg-brand-600 rounded-lg px-4 py-2 text-sm flex items-center gap-2 disabled:opacity-50"><Save size={15} /> Guardar instrucción</button><span className="text-xs text-surface-400">Versión {config.data?.prompt_version ?? '—'}</span></div>
        </div>
      </div>}
    </div>
  );
}
