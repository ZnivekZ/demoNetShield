import { useState, useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import Highlight from '@tiptap/extension-highlight';
import {
  FileText, Wand2, Download, Bold, Italic, UnderlineIcon, List, ListOrdered,
  AlignLeft, AlignCenter, Heading1, Heading2, Highlighter, Undo2, Redo2,
  Upload, Bot, Clock, History, GitCompare, Save,
} from 'lucide-react';
import { reportsApi } from '../../services/api';
import { TelegramTab } from './TelegramTab';
import { TemplateSelector } from './TemplateSelector';
import { ReportHistory } from './ReportHistory';
import { ReportSchedules } from './ReportSchedules';
import type { ReportTemplate, SavedReport } from '../../types';

/* ── Data Sources (categorized with tooltips) ──────────── */

interface DataSourceItem {
  id: string;
  label: string;
  icon: string;
  tooltip: string;
}

interface DataSourceCategory {
  category: string;
  icon: string;
  items: DataSourceItem[];
}

const DATA_SOURCE_CATEGORIES: DataSourceCategory[] = [
  {
    category: 'MikroTik',
    icon: '🔗',
    items: [
      {
        id: 'mikrotik_connections',
        label: 'Conexiones Activas',
        icon: '🔌',
        tooltip: 'Conexiones TCP/UDP actuales: IP origen/destino, protocolo, estado (established/syn-sent/etc.) y tiempo restante.',
      },
      {
        id: 'firewall_rules',
        label: 'Reglas de Firewall',
        icon: '🛡️',
        tooltip: 'Reglas filter del firewall: chain (input/forward/output), acción (accept/drop), IPs y contadores de paquetes/bytes.',
      },
      {
        id: 'arp_table',
        label: 'Tabla ARP',
        icon: '📋',
        tooltip: 'Mapeo IP↔MAC de todos los dispositivos detectados en la red local. Útil para identificar dispositivos no reconocidos.',
      },
      {
        id: 'mikrotik_interfaces',
        label: 'Interfaces de Red',
        icon: '🌐',
        tooltip: 'Estado de cada interfaz de red: activa/inactiva, tráfico TX/RX en bytes, MTU, dirección MAC y tipo (ether/vlan/bridge).',
      },
      {
        id: 'mikrotik_vlans',
        label: 'VLANs',
        icon: '🏗️',
        tooltip: 'VLANs configuradas en el router: ID, nombre, interfaz padre y segmentación de red aplicada.',
      },
      {
        id: 'mikrotik_nat',
        label: 'Reglas NAT',
        icon: '↔️',
        tooltip: 'Reglas de traducción de direcciones activas (DNAT/SNAT/Masquerade): chain, acción, IPs y puertos afectados.',
      },
      {
        id: 'mikrotik_address_lists',
        label: 'Listas de Direcciones',
        icon: '📝',
        tooltip: 'Address lists del firewall: IPs agrupadas por lista (bloqueadas, permitidas, en cuarentena, etc.) con comentarios.',
      },
      {
        id: 'mikrotik_dns',
        label: 'DNS Estático',
        icon: '🔤',
        tooltip: 'Registros DNS configurados localmente en el router: mapeos dominio→IP para resolución interna de nombres.',
      },
      {
        id: 'mikrotik_dhcp',
        label: 'DHCP Leases',
        icon: '📡',
        tooltip: 'Asignaciones DHCP activas: IP asignada, dirección MAC, hostname del cliente, servidor DHCP y tiempo de expiración.',
      },
      {
        id: 'mikrotik_logs',
        label: 'Logs del Router',
        icon: '📜',
        tooltip: 'Últimas entradas del log de MikroTik con timestamp: errores del sistema, autenticaciones fallidas, eventos del firewall y DHCP.',
      },
      {
        id: 'mikrotik_health',
        label: 'Salud del Router',
        icon: '💓',
        tooltip: 'Métricas de hardware del router: uso de CPU%, RAM%, tiempo de actividad (uptime), temperatura y voltaje (donde aplique).',
      },
    ],
  },
  {
    category: 'Wazuh (SIEM)',
    icon: '🔔',
    items: [
      {
        id: 'wazuh_alerts',
        label: 'Alertas Generales',
        icon: '🔔',
        tooltip: 'Todas las alertas de Wazuh SIEM: nivel de severidad (1-15), agente afectado, ID de regla, descripción y timestamp.',
      },
      {
        id: 'wazuh_critical',
        label: 'Alertas Críticas',
        icon: '🚨',
        tooltip: 'Solo alertas nivel ≥12 (alto/crítico) con información de técnicas MITRE ATT&CK: táctica, técnica y subtécnica detectada.',
      },
      {
        id: 'wazuh_agents',
        label: 'Agentes',
        icon: '🖥️',
        tooltip: 'Estado individual de cada agente Wazuh: nombre, estado (active/disconnected), sistema operativo, versión del agente, IP y última conexión.',
      },
      {
        id: 'wazuh_mitre',
        label: 'MITRE ATT&CK',
        icon: '🎯',
        tooltip: 'Resumen de técnicas y tácticas del framework MITRE ATT&CK detectadas en la infraestructura, con conteo de alertas por técnica.',
      },
    ],
  },
  {
    category: 'CrowdSec (IPS)',
    icon: '🚫',
    items: [
      {
        id: 'crowdsec_decisions',
        label: 'Decisiones Activas',
        icon: '🚫',
        tooltip: 'IPs y rangos actualmente bloqueados por CrowdSec: dirección, tipo de bloqueo, duración, escenario que lo originó y bouncer que lo aplica.',
      },
      {
        id: 'crowdsec_alerts',
        label: 'Alertas de Escenarios',
        icon: '⚠️',
        tooltip: 'Escenarios de ataque detectados: fuerza bruta SSH/HTTP, port scanning, crawling web, y otros comportamientos maliciosos identificados.',
      },
      {
        id: 'crowdsec_metrics',
        label: 'Métricas del Motor',
        icon: '📊',
        tooltip: 'Estadísticas del motor CrowdSec: rendimiento de parsers (líneas procesadas/descartadas), bouncers activos y escenarios ejecutados.',
      },
    ],
  },
  {
    category: 'Suricata (IDS/IPS)',
    icon: '🔍',
    items: [
      {
        id: 'suricata_alerts',
        label: 'Alertas IDS',
        icon: '🔍',
        tooltip: 'Amenazas detectadas por Suricata: nombre de firma, categoría, severidad, IPs origen/destino y protocolo involucrado.',
      },
      {
        id: 'suricata_flows',
        label: 'Flujos de Red',
        icon: '🌊',
        tooltip: 'Flujos de tráfico TCP/UDP capturados: IP/puerto origen y destino, bytes transferidos, duración del flujo y estado.',
      },
      {
        id: 'suricata_dns',
        label: 'Consultas DNS',
        icon: '🌐',
        tooltip: 'Consultas DNS capturadas en la red: dominio consultado, tipo de registro (A/AAAA/MX/TXT), respuesta obtenida y cliente que consultó.',
      },
      {
        id: 'suricata_http',
        label: 'Tráfico HTTP',
        icon: '🌍',
        tooltip: 'Transacciones HTTP capturadas: URL completa, método (GET/POST/etc.), código de respuesta, user-agent del cliente y servidor destino.',
      },
      {
        id: 'suricata_tls',
        label: 'Handshakes TLS',
        icon: '🔒',
        tooltip: 'Conexiones TLS/HTTPS capturadas: versión de TLS negociada, SNI (hostname), CN del certificado, cipher suite y si el certificado es válido.',
      },
    ],
  },
  {
    category: 'GLPI (Activos)',
    icon: '📦',
    items: [
      {
        id: 'glpi_inventory',
        label: 'Inventario de Activos',
        icon: '📦',
        tooltip: 'Inventario completo de GLPI: computadoras y dispositivos con modelo, OS, estado operativo, ubicación y usuario asignado.',
      },
      {
        id: 'glpi_stats',
        label: 'Estadísticas de Activos',
        icon: '📈',
        tooltip: 'Totales de activos por tipo (PC, servidor, impresora, etc.), distribución por estado operativo y conteo por ubicación física.',
      },
      {
        id: 'glpi_tickets',
        label: 'Tickets de Soporte',
        icon: '🎫',
        tooltip: 'Tickets de incidentes y solicitudes de GLPI: prioridad (crítica/alta/media/baja), estado (nuevo/asignado/pendiente/resuelto), técnico asignado y SLA.',
      },
    ],
  },
  {
    category: 'Sistema General',
    icon: '💻',
    items: [
      {
        id: 'system_health',
        label: 'Salud General',
        icon: '💻',
        tooltip: 'Estado consolidado de TODOS los servicios: resumen de CPU/RAM de MikroTik, agentes activos de Wazuh, decisiones de CrowdSec y estado del motor Suricata.',
      },
    ],
  },
];

// Flat list for quick lookup
const ALL_SOURCE_IDS = DATA_SOURCE_CATEGORIES.flatMap(c => c.items.map(i => i.id));

/* ── Audience Options ──────────────────────────────────── */

const AUDIENCES = [
  { id: 'executive',   label: 'Ejecutivo',   desc: 'Lenguaje claro, impacto de negocio, riesgo resumido' },
  { id: 'technical',   label: 'Técnico',     desc: 'Detalle completo, IOCs, reglas, MITRE ATT&CK' },
  { id: 'operational', label: 'Operacional', desc: 'Pasos accionables, checklists, procedimientos' },
];

type ActiveTab = 'reports' | 'history' | 'schedules' | 'telegram';

/* ── Main Component ─────────────────────────────────────── */

export default function ReportsPage() {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<ActiveTab>('reports');

  // Generator state
  const [prompt, setPrompt]                   = useState('');
  const [audience, setAudience]               = useState('technical');
  const [selectedSources, setSelectedSources] = useState<string[]>(['wazuh_alerts', 'mikrotik_connections']);
  const [fromDate, setFromDate]               = useState('');
  const [toDate, setToDate]                   = useState('');
  const [compFromDate, setCompFromDate]       = useState('');
  const [compToDate, setCompToDate]           = useState('');
  const [showComparison, setShowComparison]   = useState(false);
  const [attachedDocs, setAttachedDocs]       = useState<string[]>([]);
  const [reportTitle, setReportTitle]         = useState('');
  const [currentSavedId, setCurrentSavedId]   = useState<number | null>(null);
  const [isSaving, setIsSaving]               = useState(false);
  const [saveSuccess, setSaveSuccess]         = useState(false);

  // TipTap Editor
  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Highlight,
    ],
    content: '<p>El borrador del reporte aparecerá aquí después de generarlo con IA...</p>',
    editorProps: { attributes: { class: 'focus:outline-none' } },
  });

  // Generate mutation
  const generateMutation = useMutation({
    mutationFn: () =>
      reportsApi.generate({
        prompt,
        audience,
        attached_documents: attachedDocs,
        data_sources: selectedSources,
        date_range: fromDate && toDate ? { from_date: fromDate, to_date: toDate } : undefined,
        comparison_range: showComparison && compFromDate && compToDate
          ? { from_date: compFromDate, to_date: compToDate }
          : undefined,
      }),
    onSuccess: (resp) => {
      if (resp.success && resp.data) {
        editor?.commands.setContent(resp.data.html_content);
        setReportTitle(resp.data.title);
        setCurrentSavedId(resp.data.saved_report_id ?? null);
        qc.invalidateQueries({ queryKey: ['saved-reports'] });
      }
    },
  });

  // Export PDF
  const exportMutation = useMutation({
    mutationFn: () => reportsApi.exportPdf(editor?.getHTML() || '', reportTitle || 'NetShield Report', { audience }),
    onSuccess: (blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${reportTitle || 'NetShield_Report'}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    },
  });

  // Save edited report
  const handleSave = useCallback(async () => {
    const html = editor?.getHTML() || '';
    if (!html) return;
    setIsSaving(true);
    try {
      if (currentSavedId) {
        await reportsApi.updateSaved(currentSavedId, { title: reportTitle, html_content: html });
      } else {
        const res = await reportsApi.createSaved({
          title: reportTitle || 'Sin título',
          html_content: html,
          prompt,
          audience,
          data_sources: selectedSources,
        });
        if (res.data) setCurrentSavedId(res.data.id);
      }
      qc.invalidateQueries({ queryKey: ['saved-reports'] });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } finally {
      setIsSaving(false);
    }
  }, [editor, currentSavedId, reportTitle, prompt, audience, selectedSources, qc]);

  // Load from history
  const handleLoadReport = useCallback(async (report: SavedReport) => {
    const res = await reportsApi.getSaved(report.id);
    if (res.data?.html_content) {
      editor?.commands.setContent(res.data.html_content);
      setReportTitle(res.data.title);
      setAudience(res.data.audience);
      setCurrentSavedId(res.data.id);
      setActiveTab('reports');
    }
  }, [editor]);

  // Apply template
  const handleTemplate = (template: ReportTemplate) => {
    setPrompt(template.prompt);
    setAudience(template.audience);
    setSelectedSources(template.data_sources);
  };

  const toggleSource = (id: string) =>
    setSelectedSources(prev => prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]);

  const selectCategory = (category: DataSourceCategory) => {
    const ids = category.items.map(i => i.id);
    const allSelected = ids.every(id => selectedSources.includes(id));
    if (allSelected) {
      setSelectedSources(prev => prev.filter(id => !ids.includes(id)));
    } else {
      setSelectedSources(prev => [...new Set([...prev, ...ids])]);
    }
  };

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    for (const file of Array.from(files)) {
      const text = await file.text();
      setAttachedDocs(prev => [...prev, text.slice(0, 10000)]);
    }
  }, []);

  /* ── Tabs ─────────────────────────────────── */
  const tabs: { id: ActiveTab; label: string; icon: React.ReactNode }[] = [
    { id: 'reports',   label: 'Generador IA', icon: <Wand2   size={13} /> },
    { id: 'history',   label: 'Historial',    icon: <History size={13} /> },
    { id: 'schedules', label: 'Programación', icon: <Clock   size={13} /> },
    { id: 'telegram',  label: 'Telegram',     icon: <Bot     size={13} /> },
  ];

  /* ── Render ──────────────────────────────── */
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-surface-100 flex items-center gap-2">
          <FileText className="w-5 h-5 text-brand-400" />
          Reportes
        </h1>
        <p className="text-sm text-surface-500 mt-0.5">
          Generador IA · Historial · Programación automática · Telegram
        </p>
      </div>

      {/* Tab switcher */}
      <div style={{
        display: 'flex', gap: '0.25rem',
        background: 'var(--color-surface-800)',
        padding: '0.3rem', borderRadius: 10, width: 'fit-content',
      }}>
        {tabs.map(tab => (
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

      {/* ── Tabs Content ── */}
      {activeTab === 'telegram' && <TelegramTab />}

      {activeTab === 'history' && (
        <div className="glass-card p-5">
          <ReportHistory onLoadReport={handleLoadReport} />
        </div>
      )}

      {activeTab === 'schedules' && (
        <div className="glass-card p-5">
          <ReportSchedules />
        </div>
      )}

      {/* ── Generator Tab ── */}
      {activeTab === 'reports' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* ── Left Panel ── */}
          <div className="space-y-4 animate-fade-in-up">

            {/* Templates */}
            <div className="glass-card p-4">
              <TemplateSelector onSelect={handleTemplate} />
            </div>

            {/* Prompt */}
            <div className="glass-card p-5">
              <h2 className="text-sm font-semibold text-surface-200 mb-3">Instrucción para la IA</h2>
              <textarea
                className="input min-h-28"
                placeholder="Describe el reporte que necesitas... Ej: 'Reporte ejecutivo de alertas críticas de las últimas 24h con recomendaciones de mitigación'"
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
              />
            </div>

            {/* Audience */}
            <div className="glass-card p-5">
              <h2 className="text-sm font-semibold text-surface-200 mb-3">Audiencia</h2>
              <div className="space-y-2">
                {AUDIENCES.map(a => (
                  <label
                    key={a.id}
                    className={`flex items-start gap-3 p-3 rounded-lg cursor-pointer border transition-all ${
                      audience === a.id
                        ? 'border-brand-500/40 bg-brand-500/10'
                        : 'border-surface-800/20 bg-surface-900/20 hover:border-surface-700/30'
                    }`}
                  >
                    <input
                      type="radio" name="audience" value={a.id}
                      checked={audience === a.id}
                      onChange={e => setAudience(e.target.value)}
                      className="mt-0.5 accent-brand-500"
                    />
                    <div>
                      <p className="text-xs font-semibold text-surface-200">{a.label}</p>
                      <p className="text-[0.65rem] text-surface-500">{a.desc}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Data Sources — categorized with tooltips */}
            <div className="glass-card p-5">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                <h2 className="text-sm font-semibold text-surface-200">Fuentes de Datos</h2>
                <div style={{ display: 'flex', gap: '0.4rem' }}>
                  <button
                    onClick={() => setSelectedSources(ALL_SOURCE_IDS)}
                    style={{
                      fontSize: '0.62rem', padding: '2px 7px', borderRadius: 4, cursor: 'pointer',
                      background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.25)',
                      color: 'var(--color-brand-400)',
                    }}
                  >
                    Todas
                  </button>
                  <button
                    onClick={() => setSelectedSources([])}
                    style={{
                      fontSize: '0.62rem', padding: '2px 7px', borderRadius: 4, cursor: 'pointer',
                      background: 'transparent', border: '1px solid rgba(255,255,255,0.1)',
                      color: 'var(--color-surface-500)',
                    }}
                  >
                    Ninguna
                  </button>
                </div>
              </div>

              <p style={{ fontSize: '0.62rem', color: 'var(--color-surface-500)', marginBottom: '0.75rem', fontStyle: 'italic' }}>
                Pasa el cursor sobre cada fuente para ver qué información incluye
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                {DATA_SOURCE_CATEGORIES.map(cat => {
                  const catIds = cat.items.map(i => i.id);
                  const allSelected = catIds.every(id => selectedSources.includes(id));
                  const someSelected = catIds.some(id => selectedSources.includes(id));
                  return (
                    <div key={cat.category}>
                      {/* Category header */}
                      <button
                        onClick={() => selectCategory(cat)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '0.4rem',
                          background: 'none', border: 'none', cursor: 'pointer',
                          padding: '0.15rem 0', marginBottom: '0.3rem', width: '100%', textAlign: 'left',
                        }}
                        title={`Seleccionar/deseleccionar todas las fuentes de ${cat.category}`}
                      >
                        <span style={{ fontSize: '0.85rem' }}>{cat.icon}</span>
                        <span style={{
                          fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase',
                          letterSpacing: '0.06em',
                          color: allSelected
                            ? 'var(--color-brand-400)'
                            : someSelected
                              ? 'var(--color-brand-500)'
                              : 'var(--color-surface-500)',
                        }}>
                          {cat.category}
                        </span>
                        <span style={{
                          fontSize: '0.6rem', color: 'var(--color-surface-600)',
                          marginLeft: 'auto',
                        }}>
                          {catIds.filter(id => selectedSources.includes(id)).length}/{catIds.length}
                        </span>
                      </button>

                      {/* Items */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem', paddingLeft: '0.25rem' }}>
                        {cat.items.map(src => (
                          <label
                            key={src.id}
                            title={src.tooltip}
                            style={{
                              display: 'flex', alignItems: 'center', gap: '0.45rem',
                              padding: '0.3rem 0.45rem', borderRadius: 6, cursor: 'pointer',
                              border: `1px solid ${selectedSources.includes(src.id) ? 'rgba(99,102,241,0.3)' : 'transparent'}`,
                              background: selectedSources.includes(src.id) ? 'rgba(99,102,241,0.07)' : 'transparent',
                              transition: 'all 0.12s',
                            }}
                            onMouseEnter={e => {
                              if (!selectedSources.includes(src.id)) {
                                (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.03)';
                              }
                            }}
                            onMouseLeave={e => {
                              if (!selectedSources.includes(src.id)) {
                                (e.currentTarget as HTMLElement).style.background = 'transparent';
                              }
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={selectedSources.includes(src.id)}
                              onChange={() => toggleSource(src.id)}
                              style={{ accentColor: 'var(--color-brand-500)', flexShrink: 0 }}
                            />
                            <span style={{ fontSize: '0.85rem', flexShrink: 0 }}>{src.icon}</span>
                            <span style={{
                              fontSize: '0.75rem',
                              color: selectedSources.includes(src.id) ? 'var(--color-surface-100)' : 'var(--color-surface-300)',
                              fontWeight: selectedSources.includes(src.id) ? 500 : 400,
                            }}>
                              {src.label}
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>

              {selectedSources.length > 0 && (
                <p style={{ fontSize: '0.65rem', color: 'var(--color-brand-400)', marginTop: '0.6rem', textAlign: 'right' }}>
                  {selectedSources.length} fuente{selectedSources.length !== 1 ? 's' : ''} seleccionada{selectedSources.length !== 1 ? 's' : ''}
                </p>
              )}
            </div>

            {/* Date Range */}
            <div className="glass-card p-5">
              <h2 className="text-sm font-semibold text-surface-200 mb-3">Rango de Fechas</h2>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[0.65rem] text-surface-500 block mb-1">Desde</label>
                  <input type="date" className="input text-xs" value={fromDate} onChange={e => setFromDate(e.target.value)} />
                </div>
                <div>
                  <label className="text-[0.65rem] text-surface-500 block mb-1">Hasta</label>
                  <input type="date" className="input text-xs" value={toDate} onChange={e => setToDate(e.target.value)} />
                </div>
              </div>

              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.75rem', cursor: 'pointer' }}>
                <input
                  type="checkbox" checked={showComparison}
                  onChange={e => setShowComparison(e.target.checked)}
                  style={{ accentColor: 'var(--color-brand-500)' }}
                />
                <GitCompare size={12} style={{ color: 'var(--color-brand-400)' }} />
                <span style={{ fontSize: '0.72rem', color: 'var(--color-surface-300)', fontWeight: 500 }}>
                  Comparar con otro período
                </span>
              </label>

              {showComparison && (
                <div className="grid grid-cols-2 gap-2 mt-2" style={{ paddingLeft: '1rem', borderLeft: '2px solid rgba(99,102,241,0.3)' }}>
                  <div>
                    <label className="text-[0.65rem] text-surface-500 block mb-1">Desde (B)</label>
                    <input type="date" className="input text-xs" value={compFromDate} onChange={e => setCompFromDate(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-[0.65rem] text-surface-500 block mb-1">Hasta (B)</label>
                    <input type="date" className="input text-xs" value={compToDate} onChange={e => setCompToDate(e.target.value)} />
                  </div>
                </div>
              )}
            </div>

            {/* File upload */}
            <div className="glass-card p-5">
              <h2 className="text-sm font-semibold text-surface-200 mb-3">Documentos de Contexto</h2>
              <label className="btn btn-ghost w-full cursor-pointer">
                <Upload className="w-4 h-4" />
                Subir documento (.txt / .md)
                <input type="file" className="hidden" accept=".txt,.pdf,.md" multiple onChange={handleFileUpload} />
              </label>
              {attachedDocs.length > 0 && (
                <p className="text-xs text-surface-500 mt-2">
                  {attachedDocs.length} documento(s) adjuntos
                  <button
                    onClick={() => setAttachedDocs([])}
                    style={{ marginLeft: '0.5rem', color: 'var(--color-danger-400)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.65rem' }}
                  >
                    Limpiar
                  </button>
                </p>
              )}
            </div>

            {/* Generate button */}
            <button
              className="btn btn-primary w-full py-3"
              onClick={() => generateMutation.mutate()}
              disabled={generateMutation.isPending || !prompt}
            >
              {generateMutation.isPending
                ? <><span className="loading-spinner" />Generando con IA...</>
                : <><Wand2 className="w-4 h-4" />Generar Borrador</>
              }
            </button>
            {generateMutation.isError && (
              <p className="text-xs text-danger">Error: {(generateMutation.error as Error).message}</p>
            )}
          </div>

          {/* ── Right Panel: Editor ── */}
          <div className="lg:col-span-2 space-y-4 animate-fade-in-up stagger-2">
            <input
              type="text" className="input text-lg font-bold"
              placeholder="Título del reporte"
              value={reportTitle} onChange={e => setReportTitle(e.target.value)}
            />

            <div className="tiptap-editor">
              {editor && <EditorToolbar editor={editor} />}
              <EditorContent editor={editor} />
            </div>

            <div className="flex items-center justify-between gap-3 flex-wrap">
              <p className="text-xs text-surface-500">
                {generateMutation.data?.data?.tokens_used
                  ? `${generateMutation.data.data.tokens_used.toLocaleString()} tokens · modelo gratuito (OpenRouter)`
                  : currentSavedId
                    ? `Guardado (ID: ${currentSavedId})`
                    : 'Editá el borrador y exportá a PDF'
                }
              </p>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '0.4rem',
                    padding: '0.4rem 0.85rem', borderRadius: 7,
                    background: saveSuccess ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.06)',
                    border: `1px solid ${saveSuccess ? 'rgba(34,197,94,0.35)' : 'rgba(255,255,255,0.1)'}`,
                    color: saveSuccess ? '#4ade80' : 'var(--color-surface-300)',
                    cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, transition: 'all 0.2s',
                  }}
                >
                  <Save size={13} />
                  {isSaving ? 'Guardando...' : saveSuccess ? '¡Guardado!' : 'Guardar'}
                </button>
                <button
                  className="btn btn-success"
                  onClick={() => exportMutation.mutate()}
                  disabled={exportMutation.isPending}
                >
                  {exportMutation.isPending ? <span className="loading-spinner" /> : <Download className="w-4 h-4" />}
                  Exportar PDF
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── TipTap Toolbar ─────────────────────────────────────── */

function EditorToolbar({ editor }: { editor: ReturnType<typeof useEditor> }) {
  if (!editor) return null;
  const a = (active: boolean) => active ? 'is-active' : '';
  return (
    <div className="tiptap-toolbar">
      <button className={a(editor.isActive('bold'))}      onClick={() => editor.chain().focus().toggleBold().run()}      title="Negrita"><Bold      className="w-4 h-4" /></button>
      <button className={a(editor.isActive('italic'))}    onClick={() => editor.chain().focus().toggleItalic().run()}    title="Cursiva"><Italic    className="w-4 h-4" /></button>
      <button className={a(editor.isActive('underline'))} onClick={() => editor.chain().focus().toggleUnderline().run()} title="Subrayado"><UnderlineIcon className="w-4 h-4" /></button>
      <button className={a(editor.isActive('highlight'))} onClick={() => editor.chain().focus().toggleHighlight().run()} title="Resaltar"><Highlighter className="w-4 h-4" /></button>
      <div className="w-px h-6 bg-surface-700/30 mx-1" />
      <button className={a(editor.isActive('heading', { level: 1 }))} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} title="Título 1"><Heading1 className="w-4 h-4" /></button>
      <button className={a(editor.isActive('heading', { level: 2 }))} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} title="Título 2"><Heading2 className="w-4 h-4" /></button>
      <div className="w-px h-6 bg-surface-700/30 mx-1" />
      <button className={a(editor.isActive('bulletList'))}  onClick={() => editor.chain().focus().toggleBulletList().run()}  title="Lista"><List        className="w-4 h-4" /></button>
      <button className={a(editor.isActive('orderedList'))} onClick={() => editor.chain().focus().toggleOrderedList().run()} title="Numerada"><ListOrdered className="w-4 h-4" /></button>
      <div className="w-px h-6 bg-surface-700/30 mx-1" />
      <button onClick={() => editor.chain().focus().setTextAlign('left').run()}   className={a(editor.isActive({ textAlign: 'left' }))}   title="Izquierda"><AlignLeft   className="w-4 h-4" /></button>
      <button onClick={() => editor.chain().focus().setTextAlign('center').run()} className={a(editor.isActive({ textAlign: 'center' }))} title="Centro"><AlignCenter className="w-4 h-4" /></button>
      <div className="w-px h-6 bg-surface-700/30 mx-1" />
      <button onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()} title="Deshacer"><Undo2 className="w-4 h-4" /></button>
      <button onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()} title="Rehacer"><Redo2 className="w-4 h-4" /></button>
    </div>
  );
}
