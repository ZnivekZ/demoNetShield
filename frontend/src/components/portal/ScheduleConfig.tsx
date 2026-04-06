/**
 * ScheduleConfig — Hotspot access schedule configuration.
 * Allows setting allowed hours and blocked days with configurable scope.
 * Uses ConfirmModal before applying changes (affects live firewall rules).
 */
import { useState, useEffect } from 'react';
import { Clock, Calendar } from 'lucide-react';
import { usePortalSchedule, useUpdateSchedule } from '../../hooks/usePortalConfig';
import { ConfirmModal } from '../common/ConfirmModal';
import type { PortalScheduleConfig, PortalScheduleScope } from '../../types';

const DAYS = [
  { key: 'monday', label: 'Lun' },
  { key: 'tuesday', label: 'Mar' },
  { key: 'wednesday', label: 'Mié' },
  { key: 'thursday', label: 'Jue' },
  { key: 'friday', label: 'Vie' },
  { key: 'saturday', label: 'Sáb' },
  { key: 'sunday', label: 'Dom' },
];

const HOURS = Array.from({ length: 24 }, (_, i) => {
  const h = i.toString().padStart(2, '0');
  return `${h}:00`;
});

export function ScheduleConfig() {
  const { data: current } = usePortalSchedule();
  const updateSchedule = useUpdateSchedule();

  const [enabled, setEnabled] = useState(false);
  const [hourFrom, setHourFrom] = useState('07:00');
  const [hourTo, setHourTo] = useState('22:00');
  const [blockedDays, setBlockedDays] = useState<string[]>([]);
  const [scope, setScope] = useState<PortalScheduleScope>('all');
  const [showConfirm, setShowConfirm] = useState(false);

  // Load current schedule into form
  useEffect(() => {
    if (!current) return;
    setEnabled(current.enabled);
    setBlockedDays(current.blocked_days || []);
    setScope(current.scope || 'all');
    if (current.allowed_hours) {
      setHourFrom(current.allowed_hours.hour_from || '07:00');
      setHourTo(current.allowed_hours.hour_to || '22:00');
    }
  }, [current]);

  const toggleDay = (day: string) => {
    setBlockedDays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
    );
  };

  const handleApply = () => {
    const config: PortalScheduleConfig = {
      enabled,
      allowed_hours: { hour_from: hourFrom, hour_to: hourTo },
      blocked_days: blockedDays,
      scope,
    };
    updateSchedule.mutate(config, {
      onSuccess: () => setShowConfirm(false),
    });
  };

  const previewText = enabled
    ? `Acceso permitido de ${hourFrom} a ${hourTo}${blockedDays.length > 0 ? `. Bloqueado los días: ${blockedDays.join(', ')}` : ''}. Alcance: ${scope === 'all' ? 'todos los usuarios' : 'solo no registrados'}.`
    : 'Sin restricciones de horario activas.';

  return (
    <div className="portal-config-section">
      <div className="portal-config-section-header">
        <div>
          <h3 className="portal-config-title">Horario de acceso</h3>
          <p className="portal-config-subtitle">
            Controla cuándo está disponible el Hotspot vía reglas de firewall
          </p>
        </div>
      </div>

      {/* Enable toggle */}
      <div className="portal-schedule-toggle">
        <label className="portal-toggle-label">
          <div
            className={`portal-toggle ${enabled ? 'active' : ''}`}
            onClick={() => setEnabled(v => !v)}
            role="switch"
            aria-checked={enabled}
          />
          <span>{enabled ? 'Restricciones activas' : 'Sin restricciones'}</span>
        </label>
      </div>

      {/* Schedule form */}
      <div className={`portal-schedule-form ${!enabled ? 'portal-schedule-form--disabled' : ''}`}>
        {/* Hours */}
        <div className="portal-schedule-row">
          <Clock size={14} style={{ color: 'var(--color-primary)' }} />
          <span className="portal-form-label">Horario permitido</span>
          <select
            className="portal-form-select"
            value={hourFrom}
            onChange={e => setHourFrom(e.target.value)}
            disabled={!enabled}
          >
            {HOURS.map(h => <option key={h} value={h}>{h}</option>)}
          </select>
          <span className="portal-form-label">a</span>
          <select
            className="portal-form-select"
            value={hourTo}
            onChange={e => setHourTo(e.target.value)}
            disabled={!enabled}
          >
            {HOURS.map(h => <option key={h} value={h}>{h}</option>)}
          </select>
        </div>

        {/* Days */}
        <div className="portal-schedule-row">
          <Calendar size={14} style={{ color: 'var(--color-primary)' }} />
          <span className="portal-form-label">Días bloqueados</span>
          <div className="portal-days-grid">
            {DAYS.map(day => (
              <button
                key={day.key}
                type="button"
                className={`portal-day-btn ${blockedDays.includes(day.key) ? 'active' : ''}`}
                onClick={() => toggleDay(day.key)}
                disabled={!enabled}
                aria-pressed={blockedDays.includes(day.key)}
              >
                {day.label}
              </button>
            ))}
          </div>
        </div>

        {/* Scope */}
        <div className="portal-schedule-row">
          <span className="portal-form-label">Aplicar a</span>
          <div className="portal-scope-group">
            <label className="portal-scope-option">
              <input
                type="radio"
                name="schedule-scope"
                value="all"
                checked={scope === 'all'}
                onChange={() => setScope('all')}
                disabled={!enabled}
              />
              <span>Todos los usuarios</span>
            </label>
            <label className="portal-scope-option">
              <input
                type="radio"
                name="schedule-scope"
                value="unregistered"
                checked={scope === 'unregistered'}
                onChange={() => setScope('unregistered')}
                disabled={!enabled}
              />
              <span>Solo no registrados</span>
            </label>
          </div>
        </div>
      </div>

      {/* Preview */}
      <div className="portal-schedule-preview">
        <span className="portal-form-hint">{previewText}</span>
      </div>

      {/* Apply button */}
      <button
        id="portal-schedule-apply-btn"
        className="btn btn-primary btn-sm"
        onClick={() => setShowConfirm(true)}
      >
        Aplicar configuración
      </button>

      {/* Confirm */}
      {showConfirm && (
        <ConfirmModal
          title="Aplicar horario de acceso"
          description="Se crearán/eliminarán reglas de firewall en MikroTik para aplicar el horario. Esto afecta el tráfico de red en tiempo real."
          data={{
            Estado: enabled ? 'Activado' : 'Desactivado',
            Horario: enabled ? `${hourFrom} – ${hourTo}` : '—',
            'Días bloqueados': blockedDays.length > 0 ? blockedDays.join(', ') : 'ninguno',
            Alcance: scope === 'all' ? 'Todos' : 'Solo no registrados',
          }}
          confirmLabel="Aplicar"
          variant="warning"
          onConfirm={handleApply}
          onCancel={() => setShowConfirm(false)}
          isLoading={updateSchedule.isPending}
        />
      )}
    </div>
  );
}
