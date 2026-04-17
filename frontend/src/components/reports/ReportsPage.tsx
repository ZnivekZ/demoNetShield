import { useState, useCallback } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import Highlight from '@tiptap/extension-highlight';
import {
  FileText,
  Wand2,
  Download,
  Bold,
  Italic,
  UnderlineIcon,
  List,
  ListOrdered,
  AlignLeft,
  AlignCenter,
  Heading1,
  Heading2,
  Highlighter,
  Undo2,
  Redo2,
  Upload,
  Bot,
} from 'lucide-react';
import { reportsApi } from '../../services/api';
import { TelegramTab } from './TelegramTab';

const DATA_SOURCES = [
  { id: 'wazuh_alerts', label: 'Alertas Wazuh', icon: '🔔' },
  { id: 'mikrotik_connections', label: 'Conexiones MikroTik', icon: '🔗' },
  { id: 'firewall_rules', label: 'Reglas de Firewall', icon: '🛡️' },
  { id: 'arp_table', label: 'Tabla ARP', icon: '📋' },
];

const AUDIENCES = [
  {
    id: 'executive',
    label: 'Ejecutivo',
    desc: 'Lenguaje claro, impacto de negocio',
  },
  {
    id: 'technical',
    label: 'Técnico',
    desc: 'Detalle completo, IOCs, MITRE ATT&CK',
  },
  {
    id: 'operational',
    label: 'Operacional',
    desc: 'Pasos accionables, checklists',
  },
];

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState<'reports' | 'telegram'>('reports');
  const [prompt, setPrompt] = useState('');
  const [audience, setAudience] = useState('technical');
  const [selectedSources, setSelectedSources] = useState<string[]>([
    'wazuh_alerts',
    'mikrotik_connections',
  ]);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [attachedDocs, setAttachedDocs] = useState<string[]>([]);
  const [reportTitle, setReportTitle] = useState('');

  // TipTap Editor
  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Highlight,
    ],
    content: '<p>El borrador del reporte aparecerá aquí después de generarlo con IA...</p>',
    editorProps: {
      attributes: {
        class: 'focus:outline-none',
      },
    },
  });

  // Generate mutation
  const generateMutation = useMutation({
    mutationFn: () =>
      reportsApi.generate({
        prompt,
        audience,
        attached_documents: attachedDocs,
        data_sources: selectedSources,
        date_range:
          fromDate && toDate
            ? { from_date: fromDate, to_date: toDate }
            : undefined,
      }),
    onSuccess: (resp) => {
      if (resp.success && resp.data) {
        editor?.commands.setContent(resp.data.html_content);
        setReportTitle(resp.data.title);
      }
    },
  });

  // Export PDF mutation
  const exportMutation = useMutation({
    mutationFn: () => {
      const html = editor?.getHTML() || '';
      return reportsApi.exportPdf(html, reportTitle || 'NetShield Report', {
        audience,
        generated_at: new Date().toISOString(),
      });
    },
    onSuccess: (blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${reportTitle || 'NetShield_Report'}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    },
  });

  const toggleSource = (id: string) => {
    setSelectedSources((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  };

  const handleFileUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files) return;
      for (const file of Array.from(files)) {
        const text = await file.text();
        setAttachedDocs((prev) => [...prev, text.slice(0, 10000)]);
      }
    },
    []
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-surface-100 flex items-center gap-2">
          <FileText className="w-5 h-5 text-brand-400" />
          Reportes
        </h1>
        <p className="text-sm text-surface-500 mt-0.5">
          Reportes con IA y notificaciones automáticas vía Telegram
        </p>
      </div>

      {/* Top-level tab switcher */}
      <div style={{
        display: 'flex', gap: '0.25rem',
        background: 'var(--color-surface-800)',
        padding: '0.3rem', borderRadius: 10, width: 'fit-content',
      }}>
        {[
          { id: 'reports' as const, label: 'Generador IA', icon: <FileText size={14} /> },
          { id: 'telegram' as const, label: 'Telegram', icon: <Bot size={14} /> },
        ].map(tab => (
          <button
            key={tab.id}
            id={`reports-tab-${tab.id}`}
            onClick={() => setActiveTab(tab.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.4rem',
              padding: '0.4rem 0.85rem', borderRadius: 7, border: 'none', cursor: 'pointer',
              fontSize: '0.82rem', fontWeight: 600, transition: 'all 0.15s',
              background: activeTab === tab.id ? 'rgba(99,102,241,0.25)' : 'transparent',
              color: activeTab === tab.id ? 'var(--color-brand-300)' : 'var(--color-surface-400)',
              boxShadow: activeTab === tab.id ? '0 0 0 1px rgba(99,102,241,0.35)' : 'none',
            }}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* Telegram tab */}
      {activeTab === 'telegram' && <TelegramTab />}

      {/* AI Reports tab */}
      {activeTab === 'reports' && <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Configuration Panel */}
        <div className="space-y-4 animate-fade-in-up">
          {/* Prompt */}
          <div className="glass-card p-5">
            <h2 className="text-sm font-semibold text-surface-200 mb-3">
              Descripción del Reporte
            </h2>
            <textarea
              className="input min-h-28"
              placeholder="Describe el reporte que necesitas... Ej: 'Reporte ejecutivo de las alertas críticas de las últimas 24 horas con recomendaciones de mitigación'"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />
          </div>

          {/* Audience */}
          <div className="glass-card p-5">
            <h2 className="text-sm font-semibold text-surface-200 mb-3">
              Audiencia
            </h2>
            <div className="space-y-2">
              {AUDIENCES.map((a) => (
                <label
                  key={a.id}
                  className={`flex items-start gap-3 p-3 rounded-lg cursor-pointer border transition-all ${
                    audience === a.id
                      ? 'border-brand-500/40 bg-brand-500/10'
                      : 'border-surface-800/20 bg-surface-900/20 hover:border-surface-700/30'
                  }`}
                >
                  <input
                    type="radio"
                    name="audience"
                    value={a.id}
                    checked={audience === a.id}
                    onChange={(e) => setAudience(e.target.value)}
                    className="mt-0.5 accent-brand-500"
                  />
                  <div>
                    <p className="text-xs font-semibold text-surface-200">
                      {a.label}
                    </p>
                    <p className="text-[0.65rem] text-surface-500">{a.desc}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Data Sources */}
          <div className="glass-card p-5">
            <h2 className="text-sm font-semibold text-surface-200 mb-3">
              Fuentes de Datos
            </h2>
            <div className="space-y-2">
              {DATA_SOURCES.map((src) => (
                <label
                  key={src.id}
                  className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer border transition-all ${
                    selectedSources.includes(src.id)
                      ? 'border-brand-500/30 bg-brand-500/5'
                      : 'border-transparent'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedSources.includes(src.id)}
                    onChange={() => toggleSource(src.id)}
                    className="accent-brand-500"
                  />
                  <span className="text-sm">{src.icon}</span>
                  <span className="text-xs text-surface-300">{src.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Date Range */}
          <div className="glass-card p-5">
            <h2 className="text-sm font-semibold text-surface-200 mb-3">
              Rango de Fechas
            </h2>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[0.65rem] text-surface-500 block mb-1">
                  Desde
                </label>
                <input
                  type="date"
                  className="input text-xs"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                />
              </div>
              <div>
                <label className="text-[0.65rem] text-surface-500 block mb-1">
                  Hasta
                </label>
                <input
                  type="date"
                  className="input text-xs"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* File Upload */}
          <div className="glass-card p-5">
            <h2 className="text-sm font-semibold text-surface-200 mb-3">
              Documentos de Contexto
            </h2>
            <label className="btn btn-ghost w-full cursor-pointer">
              <Upload className="w-4 h-4" />
              Subir documento
              <input
                type="file"
                className="hidden"
                accept=".txt,.pdf,.md"
                multiple
                onChange={handleFileUpload}
              />
            </label>
            {attachedDocs.length > 0 && (
              <p className="text-xs text-surface-500 mt-2">
                {attachedDocs.length} documento(s) adjuntos
              </p>
            )}
          </div>

          {/* Generate Button */}
          <button
            className="btn btn-primary w-full py-3"
            onClick={() => generateMutation.mutate()}
            disabled={generateMutation.isPending || !prompt}
          >
            {generateMutation.isPending ? (
              <>
                <span className="loading-spinner" />
                Generando con IA...
              </>
            ) : (
              <>
                <Wand2 className="w-4 h-4" />
                Generar Borrador
              </>
            )}
          </button>
          {generateMutation.isError && (
            <p className="text-xs text-danger">
              Error: {(generateMutation.error as Error).message}
            </p>
          )}
        </div>

        {/* Editor Panel */}
        <div className="lg:col-span-2 space-y-4 animate-fade-in-up stagger-2">
          {/* Title */}
          <input
            type="text"
            className="input text-lg font-bold"
            placeholder="Título del reporte"
            value={reportTitle}
            onChange={(e) => setReportTitle(e.target.value)}
          />

          {/* TipTap Editor */}
          <div className="tiptap-editor">
            {editor && <EditorToolbar editor={editor} />}
            <EditorContent editor={editor} />
          </div>

          {/* Export */}
          <div className="flex items-center justify-between">
            <p className="text-xs text-surface-500">
              {generateMutation.data?.data?.tokens_used
                ? `${generateMutation.data.data.tokens_used} tokens utilizados`
                : 'Edita el borrador y exporta a PDF'}
            </p>
            <button
              className="btn btn-success"
              onClick={() => exportMutation.mutate()}
              disabled={exportMutation.isPending}
            >
              {exportMutation.isPending ? (
                <span className="loading-spinner" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              Exportar PDF
            </button>
          </div>
        </div>
      </div>}
    </div>
  );
}

/* ── TipTap Toolbar ─────────────────────────────────────────── */

function EditorToolbar({ editor }: { editor: ReturnType<typeof useEditor> }) {
  if (!editor) return null;

  const btnClass = (active: boolean) =>
    active ? 'is-active' : '';

  return (
    <div className="tiptap-toolbar">
      <button
        className={btnClass(editor.isActive('bold'))}
        onClick={() => editor.chain().focus().toggleBold().run()}
        title="Negrita"
      >
        <Bold className="w-4 h-4" />
      </button>
      <button
        className={btnClass(editor.isActive('italic'))}
        onClick={() => editor.chain().focus().toggleItalic().run()}
        title="Cursiva"
      >
        <Italic className="w-4 h-4" />
      </button>
      <button
        className={btnClass(editor.isActive('underline'))}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        title="Subrayado"
      >
        <UnderlineIcon className="w-4 h-4" />
      </button>
      <button
        className={btnClass(editor.isActive('highlight'))}
        onClick={() => editor.chain().focus().toggleHighlight().run()}
        title="Resaltar"
      >
        <Highlighter className="w-4 h-4" />
      </button>
      <div className="w-px h-6 bg-surface-700/30 mx-1" />
      <button
        className={btnClass(editor.isActive('heading', { level: 1 }))}
        onClick={() =>
          editor.chain().focus().toggleHeading({ level: 1 }).run()
        }
        title="Título 1"
      >
        <Heading1 className="w-4 h-4" />
      </button>
      <button
        className={btnClass(editor.isActive('heading', { level: 2 }))}
        onClick={() =>
          editor.chain().focus().toggleHeading({ level: 2 }).run()
        }
        title="Título 2"
      >
        <Heading2 className="w-4 h-4" />
      </button>
      <div className="w-px h-6 bg-surface-700/30 mx-1" />
      <button
        className={btnClass(editor.isActive('bulletList'))}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        title="Lista"
      >
        <List className="w-4 h-4" />
      </button>
      <button
        className={btnClass(editor.isActive('orderedList'))}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        title="Lista numerada"
      >
        <ListOrdered className="w-4 h-4" />
      </button>
      <div className="w-px h-6 bg-surface-700/30 mx-1" />
      <button
        onClick={() =>
          editor.chain().focus().setTextAlign('left').run()
        }
        className={btnClass(editor.isActive({ textAlign: 'left' }))}
        title="Alinear izquierda"
      >
        <AlignLeft className="w-4 h-4" />
      </button>
      <button
        onClick={() =>
          editor.chain().focus().setTextAlign('center').run()
        }
        className={btnClass(editor.isActive({ textAlign: 'center' }))}
        title="Centrar"
      >
        <AlignCenter className="w-4 h-4" />
      </button>
      <div className="w-px h-6 bg-surface-700/30 mx-1" />
      <button
        onClick={() => editor.chain().focus().undo().run()}
        disabled={!editor.can().undo()}
        title="Deshacer"
      >
        <Undo2 className="w-4 h-4" />
      </button>
      <button
        onClick={() => editor.chain().focus().redo().run()}
        disabled={!editor.can().redo()}
        title="Rehacer"
      >
        <Redo2 className="w-4 h-4" />
      </button>
    </div>
  );
}
