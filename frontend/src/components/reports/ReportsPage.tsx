import { useEffect, useState } from 'react';
import type { ChangeEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import Highlight from '@tiptap/extension-highlight';
import { Download, FileText, Save, Bold, Italic, Underline as UnderlineIcon, Highlighter,
  Heading1, Heading2, List, ListOrdered, AlignLeft, AlignCenter, Undo2, Redo2 } from 'lucide-react';
import { reportsApi, viewsApi } from '../../services/api';
import { TemplateSelector } from './TemplateSelector';
import { ReportHistory } from './ReportHistory';
import { ReportSchedules } from './ReportSchedules';
import { RequestPreview } from './RequestPreview';
import MitreReportPanel from './MitreReportPanel';
import type { PreparedReport, ReportTemplate, SavedReport } from '../../types';

type Tab = 'general' | 'mitre' | 'history' | 'schedules';
type PrepareInput = {
  signature: string;
  prompt: string;
  audience: string;
  data_sources: string[];
  date_range?: { from_date: string; to_date: string };
  attached_documents: string[];
};

function sourceForWidget(type: string): string | null {
  if (type === 'wazuh_kev') return 'wazuh_kev';
  if (type === 'block_candidates') return 'block_candidates';
  if (type === 'quarantine_active') return 'quarantine_active';
  if (type === 'blocked_ips') return 'mikrotik_address_lists';
  if (type === 'wazuh_summary') return 'wazuh_agents';
  if (type.includes('activity_heatmap') || type.includes('agent_alert_heatmap')) return 'wazuh_alerts';
  if (type.includes('nat')) return 'mikrotik_nat';
  if (type.includes('route')) return 'mikrotik_routes';
  if (type.includes('queue')) return 'mikrotik_queues';
  if (type.includes('live_logs')) return 'mikrotik_logs';
  if (type.includes('mitre')) return 'wazuh_mitre';
  if (type.includes('cve') || type.includes('vulnerabilit')) return 'wazuh_cves';
  if (type.includes('agent')) return 'wazuh_agents';
  if (type.includes('wazuh') || type.includes('event')) return 'wazuh_alerts';
  if (type.includes('firewall')) return 'firewall_rules';
  if (type.includes('traffic') || type.includes('network') || type.includes('bandwidth')) return 'network_activity';
  if (type.includes('dhcp') || type.includes('subnet')) return 'dhcp_leases';
  if (type.includes('ticket')) return 'glpi_tickets';
  if (type.includes('glpi') || type.includes('asset')) return 'glpi_inventory';
  if (type.includes('candidate')) return 'block_candidates';
  if (type.includes('action') || type.includes('quarantine')) return 'action_history';
  if (type.includes('mikrotik')) return 'mikrotik_health';
  return null;
}

function markdownToHtml(markdown: string): string {
  const inline = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/`(.+?)`/g, '<code>$1</code>');
  const lines = markdown.split('\n');
  const parts: string[] = [];
  let listOpen = false;
  const close = () => {
    if (listOpen) { parts.push('</ul>'); listOpen = false; }
  };
  for (const raw of lines) {
    const line = raw.trim();
    if (line.startsWith('|') && line.endsWith('|')) {
      if (listOpen) { parts.push('</ul>'); listOpen = false; }
      if (/^\|[\s:|-]+\|$/.test(line)) continue;
      parts.push('<p>' + line.slice(1, -1).split('|').map(cell => inline(cell.trim())).join(' · ') + '</p>');
      continue;
    }
    if (line.startsWith('- ')) {
      if (!listOpen) { parts.push('<ul>'); listOpen = true; }
      parts.push('<li>' + inline(line.slice(2)) + '</li>');
      continue;
    }
    if (listOpen) { parts.push('</ul>'); listOpen = false; }
    if (!line) continue;
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) parts.push('<h' + heading[1].length + '>' + inline(heading[2]) + '</h' + heading[1].length + '>');
    else parts.push('<p>' + inline(line) + '</p>');
  }
  close();
  return parts.join('');
}

function EditorToolbar({ editor }: { editor: ReturnType<typeof useEditor> }) {
  if (!editor) return null;
  const cls = (active: boolean) => active ? 'is-active' : '';
  return <div className="tiptap-toolbar">
    <button type="button" className={cls(editor.isActive('bold'))} onClick={() => editor.chain().focus().toggleBold().run()} title="Negrita"><Bold size={16} /></button>
    <button type="button" className={cls(editor.isActive('italic'))} onClick={() => editor.chain().focus().toggleItalic().run()} title="Cursiva"><Italic size={16} /></button>
    <button type="button" className={cls(editor.isActive('underline'))} onClick={() => editor.chain().focus().toggleUnderline().run()} title="Subrayado"><UnderlineIcon size={16} /></button>
    <button type="button" className={cls(editor.isActive('highlight'))} onClick={() => editor.chain().focus().toggleHighlight().run()} title="Resaltar"><Highlighter size={16} /></button>
    <div className="w-px h-6 bg-surface-700/30 mx-1" />
    <button type="button" className={cls(editor.isActive('heading', { level: 1 }))} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} title="Título 1"><Heading1 size={16} /></button>
    <button type="button" className={cls(editor.isActive('heading', { level: 2 }))} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} title="Título 2"><Heading2 size={16} /></button>
    <div className="w-px h-6 bg-surface-700/30 mx-1" />
    <button type="button" className={cls(editor.isActive('bulletList'))} onClick={() => editor.chain().focus().toggleBulletList().run()} title="Lista"><List size={16} /></button>
    <button type="button" className={cls(editor.isActive('orderedList'))} onClick={() => editor.chain().focus().toggleOrderedList().run()} title="Numerada"><ListOrdered size={16} /></button>
    <div className="w-px h-6 bg-surface-700/30 mx-1" />
    <button type="button" className={cls(editor.isActive({ textAlign: 'left' }))} onClick={() => editor.chain().focus().setTextAlign('left').run()} title="Izquierda"><AlignLeft size={16} /></button>
    <button type="button" className={cls(editor.isActive({ textAlign: 'center' }))} onClick={() => editor.chain().focus().setTextAlign('center').run()} title="Centro"><AlignCenter size={16} /></button>
    <div className="w-px h-6 bg-surface-700/30 mx-1" />
    <button type="button" disabled={!editor.can().undo()} onClick={() => editor.chain().focus().undo().run()} title="Deshacer"><Undo2 size={16} /></button>
    <button type="button" disabled={!editor.can().redo()} onClick={() => editor.chain().focus().redo().run()} title="Rehacer"><Redo2 size={16} /></button>
  </div>;
}

export default function ReportsPage() {
  const qc = useQueryClient();
  const [searchParams] = useSearchParams();
  const viewId = searchParams.get('view');
  const [tab, setTab] = useState<Tab>('general');
  const [prompt, setPrompt] = useState('');
  const [audience, setAudience] = useState('technical');
  const [selectedSources, setSelectedSources] = useState<string[]>(['wazuh_alerts', 'mikrotik_health']);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [documents, setDocuments] = useState<string[]>([]);
  const [prepared, setPrepared] = useState<PreparedReport | null>(null);
  const [preparedSignature, setPreparedSignature] = useState('');
  const [title, setTitle] = useState('');
  const [savedId, setSavedId] = useState<number | null>(null);
  const [saveError, setSaveError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [viewContext, setViewContext] = useState('');

  const editor = useEditor({
    extensions: [StarterKit, Underline, TextAlign.configure({ types: ['heading', 'paragraph'] }), Highlight],
    content: '<p>El borrador del informe aparecerá aquí.</p>',
    editorProps: { attributes: { class: 'focus:outline-none' } },
    onUpdate: () => setSaved(false),
  });
  const sourcesQuery = useQuery({ queryKey: ['report-sources'], queryFn: reportsApi.getSources, staleTime: 300_000 });
  const sources = sourcesQuery.data?.data ?? [];
  const validSources = selectedSources.filter(id => sources.some(source => source.id === id));
  const groups = [...new Set(sources.map(source => source.group))];
  const signature = JSON.stringify({ prompt, audience, validSources, fromDate, toDate, documents });
  const stale = prepared !== null && signature !== preparedSignature;

  useEffect(() => {
    if (!viewId) return;
    let active = true;
    viewsApi.getById(viewId).then(response => {
      if (!active || !response.data) return;
      const view = response.data;
      const ids = [...new Set(view.widgets.map(widget => sourceForWidget(widget.type)).filter((id): id is string => !!id))];
      if (view.widgets.some(widget => widget.type === 'hybrid_defense_layers')) ids.push('wazuh_agents', 'mikrotik_health');
      if (view.widgets.some(widget => widget.type === 'hybrid_dhcp_discovery')) ids.push('glpi_inventory');
      setPrompt('Prepará un informe de la vista «' + view.name + '». Describí los hallazgos y las acciones recomendadas.');
      if (ids.length) setSelectedSources([...new Set(ids)]);
      setViewContext(view.name);
    }).catch(() => setViewContext('No se pudo cargar la vista'));
    return () => { active = false; };
  }, [viewId]);

  const prepare = useMutation({
    mutationFn: async (input: PrepareInput) => {
      const response = await reportsApi.prepare(input);
      if (!response.data) throw new Error('No se pudo preparar el informe');
      return response.data;
    },
    onSuccess: (data, input) => { setPrepared(data); setPreparedSignature(input.signature); },
  });
  const selection = useMutation({
    mutationFn: (rows: Record<string, number[]>) => reportsApi.selectRows(prepared!.preparation_id, rows),
    onSuccess: response => { if (response.data) setPrepared(response.data); },
  });
  const generate = useMutation({
    mutationFn: () => reportsApi.generate(prepared!.preparation_id),
    onSuccess: response => {
      if (!response.data) return;
      editor?.commands.setContent(response.data.html_content);
      setTitle(response.data.title);
      setSavedId(response.data.saved_report_id ?? null);
      qc.invalidateQueries({ queryKey: ['saved-reports'] });
      qc.invalidateQueries({ queryKey: ['scheduled-preparations'] });
    },
  });
  const exportPdf = useMutation({
    mutationFn: () => reportsApi.exportPdf(editor?.getHTML() ?? '', title || 'Informe NetShield', { audience }),
    onSuccess: blob => {
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = (title || 'informe-netshield') + '.pdf';
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
  });

  const save = async () => {
    setSaving(true); setSaveError(''); setSaved(false);
    try {
      const html = editor?.getHTML() ?? '';
      if (savedId) await reportsApi.updateSaved(savedId, { title: title || 'Sin título', html_content: html });
      else {
        const response = await reportsApi.createSaved({ title: title || 'Sin título', html_content: html,
          prompt, audience, data_sources: validSources });
        if (response.data) setSavedId(response.data.id);
      }
      setSaved(true);
      qc.invalidateQueries({ queryKey: ['saved-reports'] });
    } catch (error) { setSaveError((error as Error).message); }
    finally { setSaving(false); }
  };
  const loadSaved = async (report: SavedReport) => {
    try {
      const response = await reportsApi.getSaved(report.id);
      if (!response.data?.html_content) throw new Error('Informe sin contenido');
      editor?.commands.setContent(response.data.html_content);
      setTitle(response.data.title);
      setAudience(response.data.audience);
      setSavedId(report.id);
      setTab('general');
    } catch (error) { setSaveError((error as Error).message); }
  };
  const reviewScheduled = async (preparationId: string) => {
    try {
      const response = await reportsApi.getPrepared(preparationId);
      if (!response.data) throw new Error('Preparación no encontrada');
      const data = response.data;
      const config = data.configuration;
      const nextPrompt = config.prompt;
      const nextAudience = config.audience;
      const nextSources = config.data_sources;
      const nextFrom = config.date_range?.from_date ?? '';
      const nextTo = config.date_range?.to_date ?? '';
      const nextDocuments = config.attached_documents ?? [];
      setPrompt(nextPrompt); setAudience(nextAudience); setSelectedSources(nextSources);
      setFromDate(nextFrom); setToDate(nextTo); setDocuments(nextDocuments);
      setPrepared(data);
      setPreparedSignature(JSON.stringify({ prompt: nextPrompt, audience: nextAudience,
        validSources: nextSources, fromDate: nextFrom, toDate: nextTo, documents: nextDocuments }));
      setViewContext(config.schedule_name ? 'Programación: ' + config.schedule_name : 'Preparación programada');
      setTab('general');
    } catch (error) { setSaveError((error as Error).message); }
  };
  const editMitre = (markdown: string, reportTitle: string, format: 'technical' | 'executive') => {
    editor?.commands.setContent(markdownToHtml(markdown));
    setTitle(reportTitle);
    setPrompt('Copia editable del informe MITRE ' + (format === 'executive' ? 'ejecutivo' : 'técnico'));
    setAudience(format);
    setSavedId(null);
    setTab('general');
  };
  const toggleRow = (sourceId: string, index: number) => {
    if (!prepared || selection.isPending || generate.isPending) return;
    const rows: Record<string, number[]> = Object.fromEntries(prepared.sources.map(source => [source.id, source.selected_rows]));
    rows[sourceId] = rows[sourceId].includes(index) ? rows[sourceId].filter(i => i !== index) : [...rows[sourceId], index];
    selection.mutate(rows);
  };
  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = [...(event.target.files ?? [])].slice(0, 3);
    setDocuments((await Promise.all(files.map(file => file.text()))).map(content => content.slice(0, 10000)));
  };

  return <div className="space-y-5">
    <div>
      <h1 className="text-xl font-bold text-surface-100 flex items-center gap-2"><FileText size={20} /> Reportes</h1>
      <p className="text-sm text-surface-500">Prepará los datos, revisá el envío a Groq y editá el informe.</p>
    </div>
    <div className="flex flex-wrap gap-2" role="tablist" aria-label="Secciones de reportes">
      {([['general', 'Informe general'], ['mitre', 'Informe MITRE'], ['history', 'Historial'], ['schedules', 'Programación']] as const).map(([id, label]) =>
        <button key={id} type="button" role="tab" aria-selected={tab === id}
          className={'btn ' + (tab === id ? 'btn-primary' : 'btn-ghost')} onClick={() => setTab(id)}>{label}</button>)}
    </div>
    {tab === 'mitre' && <MitreReportPanel onEdit={editMitre} />}
    {tab === 'history' && <div className="glass-card p-5"><ReportHistory onLoadReport={loadSaved} /></div>}
    {tab === 'schedules' && <div className="glass-card p-5"><ReportSchedules onReview={reviewScheduled} /></div>}
    {tab === 'general' && <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
      <div className="space-y-4">
        {viewContext && <p className="text-xs text-cyan-300">Vista: {viewContext}. Revisá las fuentes antes de preparar.</p>}
        <div className="glass-card p-4"><TemplateSelector onSelect={(template: ReportTemplate) => {
          setPrompt(template.prompt); setAudience(template.audience); setSelectedSources(template.data_sources);
        }} /></div>
        <div className="glass-card p-4 space-y-3">
          <label className="text-sm font-semibold text-surface-200 block" htmlFor="report-instruction">Objetivo</label>
          <textarea id="report-instruction" className="input min-h-28" value={prompt}
            onChange={event => setPrompt(event.target.value)} placeholder="Qué querés analizar y para quién" />
          <label className="text-sm font-semibold text-surface-200 block" htmlFor="report-audience">Audiencia</label>
          <select id="report-audience" className="input" value={audience} onChange={event => setAudience(event.target.value)}>
            <option value="technical">Técnica</option><option value="executive">Ejecutiva</option><option value="operational">Operacional</option>
          </select>
        </div>
        <div className="glass-card p-4 space-y-3">
          <h2 className="text-sm font-semibold text-surface-200">Fuentes de datos</h2>
          {sourcesQuery.isError && <p role="alert" className="text-xs text-red-300">No se pudo cargar el catálogo.</p>}
          {groups.map(group => <fieldset key={group} className="space-y-1">
            <legend className="text-xs font-semibold text-surface-400">{group}</legend>
            {sources.filter(source => source.group === group).map(source => <label key={source.id}
              className="flex items-center gap-2 text-xs text-surface-200 cursor-pointer">
              <input type="checkbox" checked={selectedSources.includes(source.id)}
                onChange={() => setSelectedSources(current => current.includes(source.id) ? current.filter(id => id !== source.id) : [...current, source.id])} />
              {source.label}<span className="text-surface-500">{source.historical ? 'histórico' : 'consulta al preparar'}</span>
            </label>)}
          </fieldset>)}
        </div>
        <div className="glass-card p-4 space-y-3">
          <h2 className="text-sm font-semibold text-surface-200">Período de fuentes históricas</h2>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-surface-400">Desde<input type="date" className="input" value={fromDate} onChange={event => setFromDate(event.target.value)} /></label>
            <label className="text-xs text-surface-400">Hasta<input type="date" className="input" value={toDate} onChange={event => setToDate(event.target.value)} /></label>
          </div>
          <p className="text-xs text-surface-500">Las fuentes de estado actual indican su fecha de consulta.</p>
          <label className="text-xs text-surface-300 block">Documentos de contexto (.txt o .md, hasta 3)
            <input type="file" accept=".txt,.md,text/plain,text/markdown" multiple onChange={upload} className="block mt-1 text-xs" />
          </label>
          {documents.length > 0 && <p className="text-xs text-surface-500">{documents.length} documentos adjuntos</p>}
        </div>
        <button type="button" className="btn btn-primary w-full"
          disabled={prepare.isPending || prompt.trim().length < 3 || validSources.length === 0 || Boolean(fromDate) !== Boolean(toDate)}
          onClick={() => prepare.mutate({ signature, prompt: prompt.trim(), audience,
            data_sources: [...validSources], date_range: fromDate && toDate ? { from_date: fromDate, to_date: toDate } : undefined,
            attached_documents: [...documents] })}>{prepare.isPending ? 'Preparando…' : 'Preparar informe'}</button>
        {prepare.isError && <p role="alert" className="text-xs text-red-300">{(prepare.error as Error).message}</p>}
      </div>
      <div className="xl:col-span-2 space-y-4">
        {prepared && <div className="glass-card p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-surface-100">Datos preparados y envío a Groq</h2>
            <span className="text-xs text-surface-400">{prepared.model}</span>
          </div>
          {stale && <p role="alert" className="text-xs text-amber-300">Cambiaste la configuración. Volvé a preparar los datos.</p>}
          {!prepared.configured && <p role="alert" className="text-xs text-amber-300">GROQ_API_KEY no configurada. Podés revisar, pero aún no generar.</p>}
          {prepared.sources.map(source => <details key={source.id} className="border border-surface-700 rounded-lg p-3">
            <summary className="cursor-pointer text-sm text-surface-200">{source.label} · {source.status === 'ok'
              ? source.selected_rows.length + '/' + source.rows.length + ' filas' : 'no disponible'}{source.truncated ? ' · muestra limitada' : ''}</summary>
            <p className="text-xs text-surface-500 mt-2">Consultado: {new Date(source.observed_at).toLocaleString('es-AR')} · {source.historical ? 'datos históricos' : 'consulta actual'}</p>
            {source.error && <p className="text-xs text-amber-300">{source.error}</p>}
            <div className="max-h-48 overflow-y-auto space-y-1 mt-2">{source.rows.map((row, index) => <label key={row.id} className="flex gap-2 text-xs text-surface-300">
              <input type="checkbox" checked={source.selected_rows.includes(index)} disabled={selection.isPending || generate.isPending || stale}
                onChange={() => toggleRow(source.id, index)} />
              <code className="break-all">{row.id} · {JSON.stringify(row.data)}</code>
            </label>)}</div>
          </details>)}
          {selection.isError && <p role="alert" className="text-xs text-red-300">No se pudo actualizar la selección.</p>}
          <RequestPreview request={prepared.request} />
          <button type="button" className="btn btn-primary" disabled={stale || !prepared.configured || selection.isPending || generate.isPending}
            onClick={() => generate.mutate()}>{generate.isPending ? 'Generando…' : 'Enviar a Groq y generar'}</button>
          {generate.isError && <p role="alert" className="text-xs text-red-300">{(generate.error as Error).message}</p>}
        </div>}
        <div className="glass-card p-4 space-y-3">
          <h2 className="text-sm font-semibold text-surface-200">Documento editable</h2>
          <input className="input text-lg font-semibold" aria-label="Título del informe" placeholder="Título" value={title} onChange={event => { setTitle(event.target.value); setSaved(false); }} />
          <div className="tiptap-editor"><EditorToolbar editor={editor} /><EditorContent editor={editor} /></div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-ghost" disabled={saving} onClick={save}><Save size={14} />{saving ? 'Guardando…' : saved ? 'Guardado' : 'Guardar'}</button>
            <button type="button" className="btn btn-success" disabled={exportPdf.isPending} onClick={() => exportPdf.mutate()}><Download size={14} />Exportar PDF</button>
          </div>
          {savedId && <p className="text-xs text-surface-500">Informe guardado #{savedId}</p>}
          {saveError && <p role="alert" className="text-xs text-red-300">{saveError}</p>}
          {exportPdf.isError && <p role="alert" className="text-xs text-red-300">Error al exportar PDF.</p>}
        </div>
      </div>
    </div>}
  </div>;
}
