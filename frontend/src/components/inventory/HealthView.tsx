/**
 * HealthView — Inventory status dashboard (GLPI only).
 *
 * No cross-tool correlation: an asset is "Activo" when its GLPI status is
 * `activo`. Wazuh/MikroTik are deliberately NOT used for the status logic.
 * The IP column, when available, is resolved from the network layer
 * (DHCP leases / DNS cache) because the GLPI HLAPI v3.0 does not expose it.
 *
 * Filter: chips by asset type. Default = only Computers; more types can be
 * added to widen the selection.
 *
 * Shows: stat cards, status pie, type breakdown and the per-asset table.
 */
import { useEffect, useMemo, useState } from 'react';
import { CheckCircle, AlertTriangle, XCircle, Monitor } from 'lucide-react';
import { useGlpiHealth } from '../../hooks/useGlpiHealth';
import { useGlpiStatus } from '../../hooks/useGlpiAssets';
import { AssetHealthTable } from './AssetHealthTable';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';

const HEALTH_COLORS = { ok: '#22c55e', warning: '#f59e0b', critical: '#ef4444' };

const TYPE_COLORS: Record<string, string> = {
  Computer: '#3b82f6',
  Printer: '#a855f7',
  Peripheral: '#06b6d4',
  Phone: '#f97316',
  NetworkEquipment: '#14b8a6',
  Monitor: '#8b5cf6',
};

const TYPE_LABELS: Record<string, string> = {
  Computer: 'Computadora',
  Printer: 'Impresora',
  Peripheral: 'Periférico',
  Phone: 'Teléfono',
  NetworkEquipment: 'Equipo de Red',
  Monitor: 'Monitor',
};

const TYPE_LABELS_PLURAL: Record<string, string> = {
  Computer: 'Computadoras',
  Printer: 'Impresoras',
  Peripheral: 'Periféricos',
  Phone: 'Teléfonos',
  NetworkEquipment: 'Equipos de Red',
  Monitor: 'Monitores',
};

/** Filtro por defecto: solo computadoras. */
const DEFAULT_TYPES = ['Computer'];

const TOOLTIP_STYLE = {
  background: 'rgba(15,23,42,0.95)',
  border: '1px solid rgba(148,163,184,0.1)',
  borderRadius: 8,
  fontSize: 12,
  color: '#e2e8f0',
};

export function HealthView() {
  const [selectedTypes, setSelectedTypes] = useState<string[]>(DEFAULT_TYPES);
  const { data: health, isLoading: healthLoading } = useGlpiHealth(selectedTypes);
  const { data: glpiStatus } = useGlpiStatus();

  const summary = health?.summary;
  const glpiOffline = glpiStatus?.available === false;

  const availableTypes = health?.availableTypes ?? [];
  const typeCounts = health?.typeCounts ?? {};

  // Chips: computadoras primero, después por cantidad
  const chipTypes = useMemo(() => {
    const types = availableTypes.length ? [...availableTypes] : [...DEFAULT_TYPES];
    return types.sort((a, b) => {
      if (a === 'Computer') return -1;
      if (b === 'Computer') return 1;
      return (typeCounts[b] ?? 0) - (typeCounts[a] ?? 0) || a.localeCompare(b);
    });
  }, [availableTypes, typeCounts]);

  // Si el inventario no tiene computadoras, el default no debe dejar la vista vacía.
  useEffect(() => {
    if (!health) return;
    if (
      selectedTypes.length === 1 &&
      selectedTypes[0] === 'Computer' &&
      availableTypes.length > 0 &&
      !availableTypes.includes('Computer')
    ) {
      setSelectedTypes([]);
    }
  }, [health, availableTypes, selectedTypes]);

  const toggleType = (type: string) => {
    setSelectedTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type],
    );
  };

  const statusChartData = [
    { name: 'Activo', value: summary?.ok ?? 0, color: HEALTH_COLORS.ok },
    { name: 'En reparación', value: summary?.warning ?? 0, color: HEALTH_COLORS.warning },
    { name: 'No activo', value: summary?.critical ?? 0, color: HEALTH_COLORS.critical },
  ].filter((d) => d.value > 0);

  const typeChartData = glpiOffline
    ? [{ name: 'Sin conexión', value: 1, color: HEALTH_COLORS.critical }]
    : Object.entries(health?.byType ?? {})
        .map(([type, value]) => ({
          name: TYPE_LABELS[type] ?? type,
          value,
          color: TYPE_COLORS[type] ?? '#64748b',
        }))
        .filter((d) => d.value > 0);

  return (
    <div className="health-view">
      {/* Filtro por tipo de activo */}
      <div className="health-filter">
        <span className="health-filter__label">Tipo de activo</span>
        <div className="health-filter__chips" role="group" aria-label="Filtrar por tipo de activo">
          <button
            type="button"
            className={`health-filter__chip ${selectedTypes.length === 0 ? 'is-active' : ''}`}
            onClick={() => setSelectedTypes([])}
            aria-pressed={selectedTypes.length === 0}
          >
            Todos
          </button>
          {chipTypes.map((type) => (
            <button
              key={type}
              type="button"
              className={`health-filter__chip ${selectedTypes.includes(type) ? 'is-active' : ''}`}
              onClick={() => toggleType(type)}
              aria-pressed={selectedTypes.includes(type)}
            >
              {TYPE_LABELS_PLURAL[type] ?? type}
              {typeCounts[type] != null && (
                <span className="health-filter__count">{typeCounts[type]}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Stat Cards Row */}
      <div className="health-stat-row">
        <div className="stat-card animate-fade-in-up stagger-1">
          <div className="health-stat-card__icon" style={{ color: '#22c55e' }}>
            <CheckCircle size={20} />
          </div>
          <div className="health-stat-card__value" style={{ color: '#22c55e' }}>
            {healthLoading ? '…' : (summary?.active ?? summary?.ok ?? 0)}
          </div>
          <div className="health-stat-card__label">Activos</div>
        </div>

        <div className="stat-card animate-fade-in-up stagger-2">
          <div className="health-stat-card__icon" style={{ color: '#f59e0b' }}>
            <AlertTriangle size={20} />
          </div>
          <div className="health-stat-card__value" style={{ color: '#f59e0b' }}>
            {healthLoading ? '…' : (summary?.warning ?? 0)}
          </div>
          <div className="health-stat-card__label">En Reparación / Pendientes</div>
        </div>

        <div className="stat-card animate-fade-in-up stagger-3">
          <div className="health-stat-card__icon" style={{ color: '#ef4444' }}>
            <XCircle size={20} />
          </div>
          <div className="health-stat-card__value" style={{ color: '#ef4444' }}>
            {healthLoading ? '…' : (summary?.critical ?? 0)}
          </div>
          <div className="health-stat-card__label">No Activos</div>
        </div>

        <div className="stat-card animate-fade-in-up stagger-4">
          <div className="health-stat-card__icon" style={{ color: 'var(--color-brand-400)' }}>
            <Monitor size={20} />
          </div>
          <div className="health-stat-card__value" style={{ color: 'var(--color-brand-400)' }}>
            {healthLoading ? '…' : (summary?.total ?? 0)}
          </div>
          <div className="health-stat-card__label">Total Activos</div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="health-charts-row">
        {/* Status pie chart */}
        <div className="glass-card health-chart-card">
          <div className="health-chart-card__title">Estado de Activos (GLPI)</div>
          {healthLoading ? (
            <div className="health-chart-card__loading">
              <span className="loading-spinner" />
            </div>
          ) : statusChartData.length === 0 ? (
            <div className="health-chart-card__loading" style={{ fontSize: '0.8rem', color: 'var(--color-surface-500)' }}>
              Sin activos en el inventario
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={statusChartData} cx="50%" cy="50%" innerRadius={55} outerRadius={80} dataKey="value" paddingAngle={2}>
                  {statusChartData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, color: '#94a3b8' }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Type pie chart */}
        <div className="glass-card health-chart-card">
          <div className="health-chart-card__title">
            Por Tipo de Activo
            {glpiOffline && (
              <span className="badge badge-danger" style={{ marginLeft: 8, fontSize: '0.6rem' }}>
                Sin conexión
              </span>
            )}
          </div>
          {!glpiOffline && healthLoading ? (
            <div className="health-chart-card__loading">
              <span className="loading-spinner" />
            </div>
          ) : typeChartData.length === 0 ? (
            <div className="health-chart-card__loading" style={{ fontSize: '0.8rem', color: 'var(--color-surface-500)' }}>
              Sin datos
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={typeChartData} cx="50%" cy="50%" innerRadius={55} outerRadius={80} dataKey="value" paddingAngle={2}>
                  {typeChartData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, color: '#94a3b8' }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Per-asset table */}
      <div className="glass-card animate-fade-in-up">
        <div style={{ padding: '1rem 1.25rem 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-surface-200)' }}>
            Detalle por Equipo
          </span>
          <span style={{ fontSize: '0.7rem', color: 'var(--color-surface-500)' }}>
            {selectedTypes.length === 0
              ? 'Todos los tipos'
              : selectedTypes.map((t) => TYPE_LABELS_PLURAL[t] ?? t).join(' · ')}
          </span>
        </div>
        <AssetHealthTable assets={health?.assets ?? []} isLoading={healthLoading} />
      </div>
    </div>
  );
}
