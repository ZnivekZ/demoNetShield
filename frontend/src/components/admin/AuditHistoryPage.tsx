/**
 * AuditHistoryPage — Historial completo de acciones realizadas en NetShield.
 *
 * Ruta: /admin/audit
 * Acceso: desde SettingsDrawer (engranaje del topbar) → sección Administración
 *
 * Muestra todas las entradas de la tabla action_logs con:
 * - Columna de severidad con etiqueta de color
 * - Filtros server-side: categoría, severidad, operador, búsqueda libre
 * - Paginación real (prev/next/goto)
 */

import { History, RefreshCw, Filter, X, ChevronDown, ChevronLeft, ChevronRight, AlertTriangle, Info, Shield, Zap, AlertCircle } from 'lucide-react';
import { useAuditHistory } from '../../hooks/useAuditHistory';
import { formatDateTime } from '../utils/time';
import type { ActionLogEntry, ActionSeverity } from '../../types';

// ── Severidad ─────────────────────────────────────────────────────────────────

interface SeverityConfig {
  label: string;
  icon: React.ElementType;
  color: string;
  bg: string;
}

const SEVERITY_CONFIG: Record<ActionSeverity, SeverityConfig> = {
  critical: { label: 'Crítico',      icon: AlertTriangle, color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
  high:     { label: 'Alto',         icon: AlertCircle,   color: '#f97316', bg: 'rgba(249,115,22,0.12)' },
  medium:   { label: 'Medio',        icon: Shield,        color: '#eab308', bg: 'rgba(234,179,8,0.12)'  },
  low:      { label: 'Bajo',         icon: Zap,           color: '#22c55e', bg: 'rgba(34,197,94,0.12)'  },
  info:     { label: 'Informativo',  icon: Info,          color: '#64748b', bg: 'rgba(100,116,139,0.12)'},
};

function SeverityBadge({ severity }: { severity: ActionSeverity }) {
  const cfg = SEVERITY_CONFIG[severity] ?? SEVERITY_CONFIG.info;
  const Icon = cfg.icon;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        padding: '2px 8px',
        borderRadius: '999px',
        fontSize: '0.65rem',
        fontWeight: 600,
        color: cfg.color,
        background: cfg.bg,
        border: `1px solid ${cfg.color}33`,
        whiteSpace: 'nowrap',
      }}
    >
      <Icon size={10} />
      {cfg.label}
    </span>
  );
}

// ── Categorías de acciones ────────────────────────────────────────────────────

interface ActionCategory {
  label: string;
  prefix: string;
  badgeClass: string;
  emoji: string;
}

const ACTION_CATEGORIES: ActionCategory[] = [
  { label: 'Auth',       prefix: 'auth_',        badgeClass: 'badge badge-info',     emoji: '🔐' },
  { label: 'Seguridad',  prefix: 'security_',    badgeClass: 'badge badge-critical', emoji: '🛡️' },
  { label: 'Bloqueos',   prefix: 'block',        badgeClass: 'badge badge-critical', emoji: '🚫' },
  { label: 'CrowdSec',   prefix: 'crowdsec_',    badgeClass: 'badge badge-high',     emoji: '🦀' },
  { label: 'Suricata',   prefix: 'suricata_',    badgeClass: 'badge badge-medium',   emoji: '🐊' },
  { label: 'Portal',     prefix: 'portal_',      badgeClass: 'badge badge-low',      emoji: '🌐' },
  { label: 'GLPI',       prefix: 'glpi_',        badgeClass: 'badge badge-success',  emoji: '📦' },
  { label: 'Reportes',   prefix: 'report_',      badgeClass: 'badge badge-info',     emoji: '📊' },
  { label: 'Telegram',   prefix: 'telegram_',    badgeClass: 'badge badge-info',     emoji: '📨' },
  { label: 'Phishing',   prefix: 'phishing_',    badgeClass: 'badge badge-danger',   emoji: '🎣' },
  { label: 'Sinkhole',   prefix: 'sinkhole_',    badgeClass: 'badge badge-danger',   emoji: '⛔' },
  { label: 'GeoIP',      prefix: 'geo_block_',   badgeClass: 'badge badge-medium',   emoji: '🌍' },
  { label: 'DHCP',       prefix: 'dhcp_',        badgeClass: 'badge badge-low',      emoji: '🔧' },
  { label: 'Cuarentena', prefix: 'quarantine',   badgeClass: 'badge badge-high',     emoji: '🔒' },
  { label: 'Network',    prefix: 'network_',     badgeClass: 'badge badge-low',      emoji: '🗂️' },
  { label: 'VLAN',       prefix: 'vlan_',        badgeClass: 'badge badge-medium',   emoji: '📡' },
  { label: 'CLI',        prefix: 'cli_',         badgeClass: 'badge badge-info',     emoji: '💻' },
  { label: 'Vistas',     prefix: 'view_',        badgeClass: 'badge badge-low',      emoji: '🖼️' },
];

function getCategoryFor(actionType: string): ActionCategory {
  const match = ACTION_CATEGORIES.find(cat => actionType.startsWith(cat.prefix));
  return match ?? { label: 'Otro', prefix: '', badgeClass: 'badge', emoji: '⚙️' };
}

function humanizeActionType(actionType: string): string {
  const MAP: Record<string, string> = {
    auth_login:                          'Login exitoso',
    auth_login_failed:                   'Login fallido',
    auth_logout:                         'Logout',
    auth_user_created:                   'Usuario creado',
    auth_user_updated:                   'Usuario editado',
    auth_user_deleted:                   'Usuario eliminado',
    block:                               'IP bloqueada (MikroTik)',
    unblock:                             'IP desbloqueada',
    auto_block:                          'Bloqueo automático',
    security_block:                      'Bloqueo manual',
    quarantine:                          'Activo en cuarentena',
    geo_block:                           'Geo-bloqueo aplicado',
    active_response:                     'Respuesta activa (Wazuh)',
    crowdsec_manual_decision:            'Decisión manual (CrowdSec)',
    crowdsec_delete_decision:            'Decisión eliminada (CrowdSec)',
    crowdsec_unblock_ip:                 'IP desbloqueada (CrowdSec)',
    crowdsec_whitelist_add:              'IP en whitelist (CrowdSec)',
    crowdsec_whitelist_remove:           'IP removida de whitelist',
    crowdsec_full_remediation:           'Remediación completa',
    crowdsec_sync_apply:                 'Sincronización CrowdSec→MikroTik',
    suricata_reload_rules:               'Reglas recargadas (Suricata)',
    suricata_rule_toggle:                'Regla activada/desactivada',
    suricata_update_rules:               'Reglas actualizadas',
    suricata_autoresponse_trigger:       'Auto-respuesta disparada',
    suricata_autoresponse_config_update: 'Config auto-respuesta actualizada',
    portal_setup:                        'Hotspot configurado',
    portal_user_create:                  'Usuario portal creado',
    portal_user_update:                  'Usuario portal editado',
    portal_user_delete:                  'Usuario portal eliminado',
    portal_user_disconnect:              'Sesión desconectada',
    portal_user_bulk_create:             'Usuarios importados en bloque',
    portal_speed_update:                 'Velocidad actualizada',
    portal_schedule_update:              'Horario actualizado',
    report_generated:                    'Reporte generado',
    telegram_test_sent:                  'Test Telegram enviado',
    telegram_report_triggered:           'Reporte Telegram enviado',
    telegram_alert_sent:                 'Alerta Telegram enviada',
    telegram_summary_sent:               'Resumen Telegram enviado',
    sinkhole_add:                        'Dominio en sinkhole',
    sinkhole_remove:                     'Dominio removido de sinkhole',
    phishing_block:                      'Dominio phishing bloqueado',
    geo_block_suggestion_applied:        'Sugerencia geo-block aplicada',
    glpi_asset_created:                  'Activo GLPI creado',
    glpi_asset_updated:                  'Activo GLPI actualizado',
    glpi_asset_deleted:                  'Activo GLPI eliminado',
    glpi_asset_assigned:                 'Activo GLPI asignado',
    glpi_quarantine:                     'Activo en cuarentena (GLPI)',
    glpi_unquarantine:                   'Activo desquarentenado',
    glpi_ticket_created:                 'Ticket GLPI creado',
    glpi_ticket_status_updated:          'Estado ticket actualizado',
    glpi_maintenance_ticket:             'Ticket mantenimiento creado',
    glpi_user_created:                   'Usuario GLPI creado',
    glpi_user_updated:                   'Usuario GLPI actualizado',
    glpi_user_deleted:                   'Usuario GLPI eliminado',
    network_label_upsert:                'Etiqueta IP actualizada',
    network_label_delete:                'Etiqueta IP eliminada',
    network_group_created:               'Grupo IP creado',
    network_group_deleted:               'Grupo IP eliminado',
    vlan_create:                         'VLAN creada',
    vlan_update:                         'VLAN actualizada',
    vlan_delete:                         'VLAN eliminada',
    cli_mikrotik_exec:                   'Comando MikroTik ejecutado',
    cli_wazuh_restart:                   'Agente Wazuh reiniciado',
    view_created:                        'Vista creada',
    view_updated:                        'Vista actualizada',
    view_deleted:                        'Vista eliminada',
    view_set_default:                    'Vista marcada como default',
  };
  return MAP[actionType] ?? actionType.replace(/_/g, ' ');
}

function summarizeDetails(entry: ActionLogEntry): string {
  if (!entry.details) return entry.comment ?? '—';
  const d = entry.details as Record<string, unknown>;
  if (d.new_user)     return `Nuevo: ${d.new_user}`;
  if (d.deleted_user) return `Eliminado: ${d.deleted_user}`;
  if (d.target_user)  return `Usuario: ${d.target_user} (${(d.changes as string[] | undefined)?.join(', ') ?? ''})`;
  if (d.reason)       return String(d.reason);
  if (d.domain)       return String(d.domain);
  if (d.ip)           return String(d.ip);
  if (d.username)     return String(d.username);
  return entry.comment ?? '—';
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function AuditHistoryPage() {
  const {
    entries,
    pagination,
    isLoading,
    isError,
    refetch,
    filters,
    setFilters,
    resetFilters,
    page,
    goToPage,
    nextPage,
    prevPage,
  } = useAuditHistory();

  const hasActiveFilters =
    filters.action_type !== '' ||
    filters.severity !== '' ||
    filters.performed_by !== '' ||
    filters.search !== '' ||
    filters.date_from !== '' ||
    filters.date_to !== '';

  return (
    <div className="flex flex-col gap-6 animate-fade-in-up">

      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, var(--color-brand-500), var(--color-brand-700))' }}
          >
            <History className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold" style={{ color: 'var(--color-surface-50)' }}>
              Historial de actividad
            </h1>
            <p className="text-sm" style={{ color: 'var(--color-surface-400)' }}>
              Registro de todas las acciones realizadas en NetShield
              {pagination.total > 0 && (
                <span style={{ color: 'var(--color-surface-500)' }}>
                  {' '}· {pagination.total} registros totales
                </span>
              )}
            </p>
          </div>
        </div>

        <button
          id="audit-refresh-btn"
          onClick={() => refetch()}
          className="btn btn-ghost flex items-center gap-2"
          title="Actualizar historial"
        >
          <RefreshCw className="w-4 h-4" />
          Actualizar
        </button>
      </div>

      {/* ── Filtros ── */}
      <div className="glass-card p-4 flex flex-wrap gap-3 items-end">
        <Filter size={14} style={{ color: 'var(--color-surface-400)', marginBottom: '0.25rem' }} />

        {/* Categoría */}
        <div className="flex flex-col gap-1">
          <label className="text-xs" style={{ color: 'var(--color-surface-400)' }}>Categoría</label>
          <div className="relative">
            <select
              id="audit-filter-category"
              value={filters.action_type}
              onChange={e => setFilters({ action_type: e.target.value })}
              className="input pr-8 appearance-none cursor-pointer"
              style={{ minWidth: '160px' }}
            >
              <option value="">Todas las categorías</option>
              {ACTION_CATEGORIES.map(cat => (
                <option key={cat.prefix} value={cat.prefix}>
                  {cat.emoji} {cat.label}
                </option>
              ))}
            </select>
            <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--color-surface-400)' }} />
          </div>
        </div>

        {/* Severidad */}
        <div className="flex flex-col gap-1">
          <label className="text-xs" style={{ color: 'var(--color-surface-400)' }}>Severidad</label>
          <div className="relative">
            <select
              id="audit-filter-severity"
              value={filters.severity}
              onChange={e => setFilters({ severity: e.target.value })}
              className="input pr-8 appearance-none cursor-pointer"
              style={{ minWidth: '140px' }}
            >
              <option value="">Todas</option>
              <option value="critical">🔴 Crítico</option>
              <option value="high">🟠 Alto</option>
              <option value="medium">🟡 Medio</option>
              <option value="low">🟢 Bajo</option>
              <option value="info">⚪ Informativo</option>
            </select>
            <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--color-surface-400)' }} />
          </div>
        </div>

        {/* Operador */}
        <div className="flex flex-col gap-1">
          <label className="text-xs" style={{ color: 'var(--color-surface-400)' }}>Operador</label>
          <div className="relative">
            <input
              id="audit-filter-operator"
              type="text"
              className="input"
              placeholder="system, admin..."
              value={filters.performed_by}
              onChange={e => setFilters({ performed_by: e.target.value })}
              style={{ minWidth: '140px' }}
            />
          </div>
        </div>

        {/* Búsqueda libre */}
        <div className="flex flex-col gap-1 flex-1" style={{ minWidth: '200px' }}>
          <label className="text-xs" style={{ color: 'var(--color-surface-400)' }}>Búsqueda</label>
          <input
            id="audit-filter-search"
            type="text"
            className="input"
            placeholder="IP, detalle, acción... (400ms debounce)"
            value={filters.search}
            onChange={e => setFilters({ search: e.target.value })}
          />
        </div>

        {/* Date from/to */}
        <div className="flex flex-col gap-1">
          <label className="text-xs" style={{ color: 'var(--color-surface-400)' }}>Desde</label>
          <input
            id="audit-filter-date-from"
            type="datetime-local"
            className="input"
            value={filters.date_from}
            onChange={e => setFilters({ date_from: e.target.value })}
            style={{ minWidth: '160px' }}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs" style={{ color: 'var(--color-surface-400)' }}>Hasta</label>
          <input
            id="audit-filter-date-to"
            type="datetime-local"
            className="input"
            value={filters.date_to}
            onChange={e => setFilters({ date_to: e.target.value })}
            style={{ minWidth: '160px' }}
          />
        </div>

        {/* Limpiar */}
        {hasActiveFilters && (
          <button
            id="audit-clear-filters-btn"
            className="btn btn-ghost flex items-center gap-1.5"
            onClick={resetFilters}
          >
            <X size={13} />
            Limpiar
          </button>
        )}
      </div>

      {/* ── Tabla ── */}
      <div className="glass-card p-0 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="loading-spinner w-8 h-8" />
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <History className="w-10 h-10" style={{ color: 'var(--color-surface-600)' }} />
            <p style={{ color: 'var(--color-danger)' }}>Error al cargar el historial</p>
            <button className="btn btn-ghost" onClick={() => refetch()}>Reintentar</button>
          </div>
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <History className="w-10 h-10" style={{ color: 'var(--color-surface-600)' }} />
            <p style={{ color: 'var(--color-surface-400)' }}>
              {hasActiveFilters ? 'No hay registros que coincidan con los filtros' : 'No hay acciones registradas'}
            </p>
            {hasActiveFilters && (
              <button className="btn btn-ghost" onClick={resetFilters}>Limpiar filtros</button>
            )}
          </div>
        ) : (
          <table className="data-table w-full">
            <thead>
              <tr>
                <th style={{ width: '155px' }}>Fecha / Hora</th>
                <th style={{ width: '100px' }}>Severidad</th>
                <th>Acción</th>
                <th>Operador</th>
                <th>Target</th>
                <th>Detalle</th>
              </tr>
            </thead>
            <tbody>
              {entries.map(entry => {
                const cat = getCategoryFor(entry.action_type);
                const sev: ActionSeverity = entry.severity ?? 'info';
                return (
                  <tr key={entry.id}>

                    {/* Fecha */}
                    <td>
                      <span className="text-xs font-mono" style={{ color: 'var(--color-surface-400)' }}>
                        {formatDateTime(entry.created_at)}
                      </span>
                    </td>

                    {/* Severidad */}
                    <td>
                      <SeverityBadge severity={sev} />
                    </td>

                    {/* Acción */}
                    <td>
                      <div className="flex items-center gap-2">
                        <span className={cat.badgeClass} style={{ fontSize: '0.65rem', whiteSpace: 'nowrap' }}>
                          {cat.emoji} {cat.label}
                        </span>
                        <span className="text-xs" style={{ color: 'var(--color-surface-200)' }}>
                          {humanizeActionType(entry.action_type)}
                        </span>
                      </div>
                    </td>

                    {/* Operador */}
                    <td>
                      <span className="text-sm font-mono font-medium" style={{ color: 'var(--color-brand-300)' }}>
                        {entry.performed_by}
                      </span>
                    </td>

                    {/* Target IP */}
                    <td>
                      {entry.target_ip ? (
                        <span className="text-xs font-mono badge">{entry.target_ip}</span>
                      ) : (
                        <span style={{ color: 'var(--color-surface-600)' }}>—</span>
                      )}
                    </td>

                    {/* Detalle */}
                    <td>
                      <span
                        className="text-xs"
                        style={{ color: 'var(--color-surface-300)', maxWidth: '320px', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        title={entry.comment ?? ''}
                      >
                        {summarizeDetails(entry)}
                      </span>
                    </td>

                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Paginación ── */}
      {!isLoading && pagination.total > 0 && (
        <div className="flex items-center justify-between flex-wrap gap-3">
          <span className="text-sm" style={{ color: 'var(--color-surface-400)' }}>
            Página {pagination.page} de {pagination.total_pages}
            {' '}· {pagination.total} registros totales
          </span>

          <div className="flex items-center gap-2">
            <button
              id="audit-prev-page-btn"
              className="btn btn-ghost flex items-center gap-1"
              onClick={prevPage}
              disabled={!pagination.has_prev}
            >
              <ChevronLeft size={15} />
              Anterior
            </button>

            {/* Quick page jumper for large datasets */}
            {pagination.total_pages > 2 && (
              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(pagination.total_pages, 7) }, (_, i) => {
                  const p = i + 1;
                  return (
                    <button
                      key={p}
                      className={`btn btn-ghost text-xs px-2 ${p === page ? 'btn-active' : ''}`}
                      style={p === page ? { background: 'var(--color-brand-600)', color: '#fff' } : {}}
                      onClick={() => goToPage(p)}
                    >
                      {p}
                    </button>
                  );
                })}
                {pagination.total_pages > 7 && (
                  <span style={{ color: 'var(--color-surface-500)' }}>…{pagination.total_pages}</span>
                )}
              </div>
            )}

            <button
              id="audit-next-page-btn"
              className="btn btn-ghost flex items-center gap-1"
              onClick={nextPage}
              disabled={!pagination.has_next}
            >
              Siguiente
              <ChevronRight size={15} />
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
