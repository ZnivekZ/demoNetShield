/**
 * AuditHistoryPage — Historial completo de acciones realizadas en NetShield.
 *
 * Ruta: /admin/audit
 * Acceso: desde SettingsDrawer (engranaje del topbar) → sección Administración
 *
 * Muestra todas las entradas de la tabla action_logs con:
 * - Filtro por categoría de acción
 * - Filtro por operador (performed_by)
 * - Búsqueda libre (action_type, details, comment, IP)
 * - Botón "Cargar más" para paginación
 */

import { History, RefreshCw, Filter, X, ChevronDown } from 'lucide-react';
import { useAuditHistory } from '../../hooks/useAuditHistory';
import { formatDateTime } from '../utils/time';
import type { ActionLogEntry } from '../../types';

// ── Categorías de acciones ────────────────────────────────────────────────────

interface ActionCategory {
  label: string;
  prefix: string;
  badgeClass: string;
  emoji: string;
}

const ACTION_CATEGORIES: ActionCategory[] = [
  { label: 'Auth',      prefix: 'auth_',        badgeClass: 'badge badge-info',     emoji: '🔐' },
  { label: 'Seguridad', prefix: 'security_',    badgeClass: 'badge badge-critical',  emoji: '🛡️' },
  { label: 'Bloqueos',  prefix: 'block',        badgeClass: 'badge badge-critical',  emoji: '🚫' },
  { label: 'CrowdSec',  prefix: 'crowdsec_',    badgeClass: 'badge badge-high',      emoji: '🦀' },
  { label: 'Suricata',  prefix: 'suricata_',    badgeClass: 'badge badge-medium',    emoji: '🐊' },
  { label: 'Portal',    prefix: 'portal_',      badgeClass: 'badge badge-low',       emoji: '🌐' },
  { label: 'GLPI',      prefix: 'glpi_',        badgeClass: 'badge badge-success',   emoji: '📦' },
  { label: 'Reportes',  prefix: 'report_',      badgeClass: 'badge badge-info',      emoji: '📊' },
  { label: 'Telegram',  prefix: 'telegram_',    badgeClass: 'badge badge-info',      emoji: '📨' },
  { label: 'Phishing',  prefix: 'phishing_',    badgeClass: 'badge badge-danger',    emoji: '🎣' },
  { label: 'Sinkhole',  prefix: 'sinkhole_',    badgeClass: 'badge badge-danger',    emoji: '⛔' },
  { label: 'GeoIP',     prefix: 'geo_block_',   badgeClass: 'badge badge-medium',    emoji: '🌍' },
  { label: 'DHCP',      prefix: 'dhcp_',        badgeClass: 'badge badge-low',       emoji: '🔧' },
  { label: 'Quarentena',prefix: 'quarantine',   badgeClass: 'badge badge-high',      emoji: '🔒' },
];

/** Devuelve la categoría que mejor corresponde al action_type dado */
function getCategoryFor(actionType: string): ActionCategory {
  const match = ACTION_CATEGORIES.find(cat => actionType.startsWith(cat.prefix));
  return match ?? { label: 'Otro', prefix: '', badgeClass: 'badge', emoji: '⚙️' };
}

/** Convierte un action_type snake_case en texto legible en español */
function humanizeActionType(actionType: string): string {
  const MAP: Record<string, string> = {
    auth_login:                       'Login exitoso',
    auth_login_failed:                'Login fallido',
    auth_logout:                      'Logout',
    auth_user_created:                'Usuario creado',
    auth_user_updated:                'Usuario editado',
    auth_user_deleted:                'Usuario eliminado',
    block:                            'IP bloqueada (MikroTik)',
    unblock:                          'IP desbloqueada',
    auto_block:                       'Bloqueo automático',
    security_block:                   'Bloqueo manual',
    quarantine:                       'Activo en cuarentena',
    geo_block:                        'Geo-bloqueo aplicado',
    active_response:                  'Respuesta activa (Wazuh)',
    crowdsec_manual_decision:         'Decisión manual (CrowdSec)',
    crowdsec_delete_decision:         'Decisión eliminada (CrowdSec)',
    crowdsec_unblock_ip:              'IP desbloqueada (CrowdSec)',
    crowdsec_whitelist_add:           'IP en whitelist (CrowdSec)',
    crowdsec_whitelist_remove:        'IP removida de whitelist',
    crowdsec_full_remediation:        'Remediación completa',
    crowdsec_sync_apply:              'Sincronización CrowdSec→MikroTik',
    suricata_reload_rules:            'Reglas recargadas (Suricata)',
    suricata_rule_toggle:             'Regla activada/desactivada',
    suricata_update_rules:            'Reglas actualizadas',
    suricata_autoresponse_trigger:    'Auto-respuesta disparada',
    suricata_autoresponse_config_update: 'Config auto-respuesta actualizada',
    portal_setup:                     'Hotspot configurado',
    portal_user_create:               'Usuario portal creado',
    portal_user_update:               'Usuario portal editado',
    portal_user_delete:               'Usuario portal eliminado',
    portal_user_disconnect:           'Sesión desconectada',
    portal_user_bulk_create:          'Usuarios importados en bloque',
    portal_speed_update:              'Velocidad actualizada',
    portal_schedule_update:           'Horario actualizado',
    report_generated:                 'Reporte generado',
    telegram_test_sent:               'Test Telegram enviado',
    telegram_report_triggered:        'Reporte Telegram enviado',
    telegram_alert_sent:              'Alerta Telegram enviada',
    telegram_summary_sent:            'Resumen Telegram enviado',
    sinkhole_add:                     'Dominio en sinkhole',
    sinkhole_remove:                  'Dominio removido de sinkhole',
    phishing_block:                   'Dominio phishing bloqueado',
    geo_block_suggestion_applied:     'Sugerencia geo-block aplicada',
    glpi_asset_created:               'Activo GLPI creado',
    glpi_asset_updated:               'Activo GLPI actualizado',
    glpi_asset_deleted:               'Activo GLPI eliminado',
    glpi_asset_assigned:              'Activo GLPI asignado',
    glpi_quarantine:                  'Activo en cuarentena (GLPI)',
    glpi_unquarantine:                'Activo desquarentenado',
    glpi_ticket_created:              'Ticket GLPI creado',
    glpi_ticket_status_updated:       'Estado ticket actualizado',
    glpi_maintenance_ticket:          'Ticket mantenimiento creado',
    glpi_user_created:                'Usuario GLPI creado',
    glpi_user_updated:                'Usuario GLPI actualizado',
    glpi_user_deleted:                'Usuario GLPI eliminado',
  };
  return MAP[actionType] ?? actionType.replace(/_/g, ' ');
}

/** Genera un resumen legible del campo details JSON */
function summarizeDetails(entry: ActionLogEntry): string {
  if (!entry.details) return entry.comment ?? '—';
  const d = entry.details as Record<string, unknown>;

  if (d.new_user)      return `Nuevo: ${d.new_user}`;
  if (d.deleted_user)  return `Eliminado: ${d.deleted_user}`;
  if (d.target_user)   return `Usuario: ${d.target_user} (${(d.changes as string[] | undefined)?.join(', ') ?? ''})`;
  if (d.reason)        return String(d.reason);
  if (d.domain)        return String(d.domain);
  if (d.ip)            return String(d.ip);
  if (d.username)      return String(d.username);

  return entry.comment ?? '—';
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function AuditHistoryPage() {
  const {
    entries,
    totalFetched,
    isLoading,
    isError,
    refetch,
    filters,
    setFilters,
    resetFilters,
    operators,
    loadMore,
    hasMore,
  } = useAuditHistory();

  const hasActiveFilters =
    filters.action_type !== '' || filters.performed_by !== '' || filters.search !== '';

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
              {totalFetched > 0 && (
                <span style={{ color: 'var(--color-surface-500)' }}>
                  {' '}· {totalFetched} registros cargados, {entries.length} mostrados
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
              onChange={e => setFilters(f => ({ ...f, action_type: e.target.value }))}
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
            <ChevronDown
              size={12}
              className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none"
              style={{ color: 'var(--color-surface-400)' }}
            />
          </div>
        </div>

        {/* Operador */}
        <div className="flex flex-col gap-1">
          <label className="text-xs" style={{ color: 'var(--color-surface-400)' }}>Operador</label>
          <div className="relative">
            <select
              id="audit-filter-operator"
              value={filters.performed_by}
              onChange={e => setFilters(f => ({ ...f, performed_by: e.target.value }))}
              className="input pr-8 appearance-none cursor-pointer"
              style={{ minWidth: '150px' }}
            >
              <option value="">Todos los operadores</option>
              {operators.map(op => (
                <option key={op} value={op}>{op}</option>
              ))}
            </select>
            <ChevronDown
              size={12}
              className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none"
              style={{ color: 'var(--color-surface-400)' }}
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
            placeholder="IP, detalle, acción..."
            value={filters.search}
            onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
          />
        </div>

        {/* Limpiar filtros */}
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
                <th>Acción</th>
                <th>Operador</th>
                <th>Target</th>
                <th>Detalle</th>
              </tr>
            </thead>
            <tbody>
              {entries.map(entry => {
                const cat = getCategoryFor(entry.action_type);
                return (
                  <tr key={entry.id}>

                    {/* Fecha */}
                    <td>
                      <span className="text-xs font-mono" style={{ color: 'var(--color-surface-400)' }}>
                        {formatDateTime(entry.created_at)}
                      </span>
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
                      <span
                        className="text-sm font-mono font-medium"
                        style={{ color: 'var(--color-brand-300)' }}
                      >
                        {entry.performed_by}
                      </span>
                    </td>

                    {/* Target IP */}
                    <td>
                      {entry.target_ip ? (
                        <span className="text-xs font-mono badge">
                          {entry.target_ip}
                        </span>
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

      {/* ── Cargar más ── */}
      {!isLoading && hasMore && entries.length > 0 && (
        <div className="flex justify-center">
          <button
            id="audit-load-more-btn"
            className="btn btn-ghost flex items-center gap-2"
            onClick={loadMore}
          >
            <ChevronDown size={15} />
            Cargar más registros
          </button>
        </div>
      )}

    </div>
  );
}
