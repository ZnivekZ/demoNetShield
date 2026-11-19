import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '../../services/api';
import './fibot.css';

type Agent = {id: string; name: string};
type Entry = {id: number; title: string};
type Row = Record<string, unknown>;
type Result = {source: string; group?: string; total_documents?: number; rows: Row[]; evidence?: Row[]; query?: Row; window?: Record<string, {gte: string; lt: string}>; affected_agents?: number; other_documents?: number};
type Turn = {id: number; request_id: string; created: string; prompt: string; agents: string[]; status: string; answer: string; results: Result[]};
type Step = {at: string; label: string; data: Row};
type Quota = {configured: boolean; model: string; remaining_24h_estimated?: number; turn_budget: number; provider?: {at: string; remaining_tokens?: string; remaining_requests?: string}};
const base = '/fibot';
const get = async <T,>(url: string): Promise<T> => (await api.get<T>(url)).data;
const show = (v: unknown) => typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v ?? '—');
const localTime = (iso: string) => new Date(iso).toLocaleString('es-AR', {timeZone:'America/Argentina/Buenos_Aires'});
function err(e: unknown) {
  const detail = (e as {response?: {data?: {detail?: unknown}}})?.response?.data?.detail;
  return typeof detail === 'string' ? detail : e instanceof Error ? e.message : 'Error de conexión';
}
function requestId() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  return [hex.slice(0,8), hex.slice(8,12), hex.slice(12,16), hex.slice(16,20), hex.slice(20)].join('-');
}

function Table({rows, inspect}: {rows: Row[]; inspect?: (index: number) => void}) {
  if (!rows.length) return <p>Sin filas devueltas para esta consulta.</p>;
  const keys = [...new Set(rows.flatMap(Object.keys))];
  return <div className="fb-scroll"><table><thead><tr>{inspect && <th>Detalle</th>}{keys.map(k => <th key={k}>{k}</th>)}</tr></thead>
    <tbody>{rows.map((row, i) => <tr key={i}>{inspect && <td><button onClick={() => inspect(i)}>Ver eventos</button></td>}{keys.map(k => <td key={k}>{show(row[k])}</td>)}</tr>)}</tbody></table></div>;
}

function Trace({chat, turn}: {chat: number; turn: Turn}) {
  const [open, setOpen] = useState(false);
  const [copy, setCopy] = useState('');
  const trace = useQuery({queryKey: ['fibot-trace', chat, turn.id, turn.status],
    queryFn: () => get<Step[]>(base + '/chats/' + chat + '/turns/' + turn.id + '/trace'),
    enabled: open, refetchInterval: open && turn.status === 'running' ? 1000 : false});
  return <div><button aria-expanded={open} onClick={() => setOpen(!open)}>{open ? 'Ocultar detalle' : 'Ver detalle'}</button>
    {open && <section aria-label="Detalle del turno">{trace.isError && <p role="alert">{err(trace.error)}</p>}
      {trace.data?.map((s, i) => <details key={i}><summary>{i+1}. {s.label} · {new Date(s.at).toLocaleTimeString('es-AR')}</summary>
        {typeof s.data.devtools === 'string' && <button onClick={async () => {
          try { await navigator.clipboard.writeText(String(s.data.devtools)); setCopy('Consulta copiada'); }
          catch { setCopy('Seleccioná la consulta en el detalle para copiarla'); }
        }}>Copiar para Dev Tools</button>}
        <pre>{typeof s.data.devtools === 'string' ? s.data.devtools : JSON.stringify(s.data, null, 2)}</pre></details>)}<small>{copy}</small></section>}</div>;
}

function Output({r, path, save}: {r: Result; path: string; save: () => Promise<void>}) {
  const [msg, setMsg] = useState('');
  const [detail, setDetail] = useState<string | null>(null);
  const drill = useQuery({queryKey:['fibot-detail',path,detail], enabled:!!detail,
    queryFn:async () => detail === 'coverage' ? get<Row[]>(path + '/coverage') : (await get<Result>(path + '/' + detail)).rows});
  const inspect = (i: number) => setDetail('evidence/' + i);
  const temporal = r.group === 'day' || r.group === 'hour';
  const chart = r.group && r.group !== 'documents' && r.rows.length > 0;
  const points = chart ? r.rows.map(row => ({label: show(row[r.group!]), cantidad: row.cantidad})) : [];
  const Chart = temporal ? LineChart : BarChart;
  const interval = Object.values(r.window ?? {})[0];
  return <section className="fb-result"><header><b>{r.source}</b>{r.total_documents != null && <span>{r.total_documents} documentos coincidentes</span>}</header>
    {chart && <ResponsiveContainer width="100%" height={180}><Chart data={points} onClick={state => {
      const i = Number(state.activeTooltipIndex);
      if (state.activeTooltipIndex != null && Number.isInteger(i) && i >= 0 && i < points.length) inspect(i);
    }}>
      <CartesianGrid strokeDasharray="3 4" opacity={0.2}/><XAxis dataKey="label" tick={{fontSize:10}} minTickGap={25}/>
      <YAxis allowDecimals={false} width={40}/><Tooltip contentStyle={{color:'#17202d'}}/>
      {temporal ? <Line dataKey="cantidad" stroke="#39aab7" dot={points.length < 30}/> : <Bar dataKey="cantidad" fill="#39aab7"/>}
    </Chart></ResponsiveContainer>}
    {interval && <small>Desde {localTime(interval.gte)} hasta {localTime(interval.lt)} · Buenos Aires</small>}
    {r.affected_agents != null && <p>Agentes con hallazgos · {r.affected_agents}</p>}
    <Table rows={r.rows} inspect={chart ? inspect : undefined}/>
    {r.other_documents != null && r.other_documents > 0 && <small>Documentos en otros grupos · {r.other_documents}</small>}
    {r.query && <button onClick={()=>setDetail(detail === 'coverage' ? null : 'coverage')}>Cobertura por agente</button>}
    {detail && <section><b>{detail === 'coverage' ? 'Datos observados en la fuente y el período' : 'Eventos actuales de la fila · hasta 10'}</b>
      <button onClick={()=>setDetail(null)}>Cerrar</button>
      {drill.isFetching ? <p>Consultando Wazuh…</p> : drill.isError ? <p role="alert">{err(drill.error)}</p> : <Table rows={drill.data ?? []}/>}</section>}
    {!!r.evidence?.length && <details><summary>Eventos de respaldo · muestra de {r.evidence.length}</summary><Table rows={r.evidence}/></details>}
    {r.query && <button onClick={() => save().then(() => setMsg('Vista guardada')).catch(e => setMsg(err(e)))}>Guardar vista</button>} <small>{msg}</small>
  </section>;
}

function Conversation({chat, selectChat}: {chat: number | null; selectChat: (id: number) => void}) {
  const qc = useQueryClient();
  const [scope, setScope] = useState<string[] | null>(null);
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [issue, setIssue] = useState('');
  const draftChat = useRef<number | null>(chat);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const agents = useQuery({queryKey: ['fibot-agents'], queryFn: async () => (await get<{data: Agent[]}>('/wazuh/agents')).data});
  const quota = useQuery({queryKey: ['fibot-quota'], queryFn: () => get<Quota>(base + '/quota'), refetchInterval: 30000});
  const turns = useQuery({queryKey: ['fibot-turns',chat], queryFn: () => get<Turn[]>(base + '/chats/' + chat),
    enabled: chat !== null, refetchInterval: q => q.state.data?.some(t => t.status === 'running') ? 1100 : false});
  const list = turns.data ?? [];
  const last = list.at(-1);
  const options = agents.data ?? [];
  const selected = scope ?? last?.agents ?? [];
  const active = last?.status === 'running';
  const context = useQuery({
    queryKey: ['fibot-context', chat, selected, last?.id, last?.status],
    enabled: !!chat && selected.length > 0 && !active,
    queryFn: async () => (await api.post<{included: number; trimmed: boolean; estimate: number}>(
      base + '/chats/' + chat + '/context', {agents:selected})).data,
  });
  const submit = async () => {
    if (!prompt.trim() || !selected.length || busy || active) return;
    setBusy(true); setIssue('');
    const id = pendingId ?? requestId(); setPendingId(id);
    try {
      const dest = draftChat.current ?? (await api.post<Entry>(base + '/chats')).data.id;
      draftChat.current = dest;
      await api.post(base + '/chats/' + dest + '/turns', {prompt, agents:selected, request_id:id});
      await Promise.all([qc.invalidateQueries({queryKey:['fibot-chats']}), qc.invalidateQueries({queryKey:['fibot-turns',dest]})]);
      selectChat(dest); setPrompt(''); setPendingId(null);
    } catch(e) {setIssue(err(e));} finally {setBusy(false);}
  };
  return <main className="fb-chat"><header><h2>{last ? 'Investigación' : 'Nueva investigación'}</h2>
    <small>Contexto · {context.data ? context.data.included + ' turnos previos resumidos' : 'hasta 3 turnos previos'}
      {context.data && ' · primera llamada estimada en ' + (context.data.estimate + Math.ceil(prompt.length / 3)) + ' tokens'}
      {' · presupuesto por pregunta ' + (quota.data?.turn_budget ?? '—') + ' tokens'}</small>
    {context.data?.trimmed && <small>Se redujo el historial para continuar dentro del presupuesto.</small>}
    <small>Groq · {quota.data?.configured === false ? 'Sin clave' : quota.data?.model} · saldo local estimado 24 h: {quota.data?.remaining_24h_estimated?.toLocaleString() ?? 'sin dato'}</small>
    {quota.data?.provider && <small>Última respuesta de Groq · {new Date(quota.data.provider.at).toLocaleTimeString('es-AR')} · tokens restantes {quota.data.provider.remaining_tokens ?? '—'} · solicitudes restantes {quota.data.provider.remaining_requests ?? '—'}</small>}</header>
    <div className="fb-messages">
      {agents.isError && <p role="status">Inventario de agentes de Wazuh inaccesible.</p>}{turns.isError && <p role="alert">{err(turns.error)}</p>}
      {!list.length && !turns.isLoading && <p>Elegí los agentes sobre los que querés preguntar.</p>}
      {list.map(t => <article key={t.id}><div className="fb-question"><small>Agentes {t.agents.join(', ')} · {new Date(t.created).toLocaleString('es-AR')}</small><strong>{t.prompt}</strong></div>
        {t.status === 'partial' && <small>Resultado parcial</small>}{t.status === 'failed' && <small>Consulta interrumpida</small>}
        <p aria-live="polite">{t.answer || 'Consultando…'}</p>
        {t.results.map((r,i) => <Output key={i} r={r} path={base + '/chats/' + chat + '/turns/' + t.id + '/results/' + i} save={async () => {
          await api.post(base + '/chats/' + chat + '/turns/' + t.id + '/views/' + i);
          await qc.invalidateQueries({queryKey:['fibot-views']});
        }}/>)}
        <Trace chat={chat!} turn={t}/></article>)}</div>
    <form onSubmit={e => {e.preventDefault(); void submit();}}>
      <details><summary>Agentes · {selected.length ? selected.join(', ') : 'seleccionar'}</summary>
        {agents.isError && <p role="alert">Inventario Wazuh no disponible. <button type="button" onClick={() => agents.refetch()}>Reintentar</button></p>}
        <button type="button" onClick={() => setScope(options.map(a=>a.id))}>Todos</button> <button type="button" onClick={() => setScope([])}>Ninguno</button>
        <div className="fb-agents">{options.map(a=><label key={a.id}><input type="checkbox" checked={selected.includes(a.id)}
          onChange={e=>setScope(e.target.checked ? [...selected,a.id] : selected.filter(id=>id!==a.id))}/> {a.name} ({a.id})</label>)}</div></details>
      <textarea aria-label="Pregunta para Fibot" placeholder="Preguntá sobre los agentes seleccionados…" value={prompt}
        maxLength={2000} onChange={e=>{setPrompt(e.target.value);setPendingId(null);}}/>
      <button className="fb-primary" type="submit" disabled={active || busy || !prompt.trim() || !selected.length || agents.isError || quota.data?.configured === false}>Enviar pregunta</button>
      {issue && <p role="alert">{issue}</p>}</form></main>;
}

export default function FibotPage() {
  const [chat,setChat] = useState<number | null>(null);
  const [issue,setIssue] = useState('');
  const qc = useQueryClient();
  const chats = useQuery({queryKey:['fibot-chats'],queryFn:()=>get<Entry[]>(base+'/chats')});
  const views = useQuery({queryKey:['fibot-views'],queryFn:()=>get<Entry[]>(base+'/views')});
  return <div className="fibot"><aside><h1>Fibot</h1><button onClick={()=>setChat(null)}>Nueva conversación</button>
    <h3>Historial</h3>{chats.isError && <p>{err(chats.error)}</p>}{chats.data?.map(c=><button key={c.id} aria-current={chat===c.id} onClick={()=>setChat(c.id)}>{c.title}</button>)}
    {!!views.data?.length && <h3>Actualizar vista guardada</h3>}{views.data?.map(v=><button key={v.id} onClick={async()=>{
      try {const res=await api.post(base+'/views/'+v.id+'/refresh', null,{params:{request_id:requestId()}});
        setChat(res.data.chat_id); await qc.invalidateQueries({queryKey:['fibot-turns']});setIssue('');
      } catch(e){setIssue(err(e));}
    }}>{v.title}</button>)}{issue && <p role="alert">{issue}</p>}</aside>
    <Conversation key={chat ?? 'new'} chat={chat} selectChat={setChat}/></div>;
}
