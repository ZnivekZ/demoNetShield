/**
 * GlobalSearch — Header search bar for unified IP/MAC lookup.
 * Searches MikroTik ARP + Wazuh agents + recent alerts in a single query.
 * Displays results in a modal with quick-action buttons.
 */
import { useEffect, useRef, useState } from 'react';
import { Search, X, Wifi, Shield, AlertCircle, ShieldOff, Package } from 'lucide-react';
import { useNetworkSearch } from '../../hooks/useNetworkSearch';
import { formatDistanceToNow } from '../utils/time';

interface GlobalSearchProps {
  onBlockIP?: (ip: string) => void;
}

export function GlobalSearch({ onBlockIP }: GlobalSearchProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const { search, result, isLoading, error, clear } = useNetworkSearch();
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Open with Ctrl+K / Cmd+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(true);
      }
      if (e.key === 'Escape') { setOpen(false); clear(); setQuery(''); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [clear]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  const handleSearch = () => {
    if (query.length > 1) search(query);
  };

  const hasResult = result && (result.arp_match || result.agent_match || result.recent_alerts.length > 0 || result.glpi_match);

  if (!open) {
    return (
      <button
        id="global-search-trigger"
        className="btn btn-ghost"
        onClick={() => setOpen(true)}
        style={{ fontSize: '0.8rem', gap: '0.5rem', paddingInline: '0.75rem' }}
        title="Buscar IP o MAC (Ctrl+K)"
      >
        <Search size={14} />
        <span className="search-placeholder-text">Buscar IP o MAC…</span>
        <kbd className="search-kbd">Ctrl+K</kbd>
      </button>
    );
  }

  return (
    <div
      className="confirm-modal-overlay"
      onClick={e => { if (e.target === dialogRef.current?.parentElement) { setOpen(false); clear(); setQuery(''); } }}
    >
      <div
        ref={dialogRef}
        className="search-modal animate-fade-in-up"
        role="dialog"
        aria-label="Buscar en la red"
      >
        {/* Search Input */}
        <div className="search-modal__input-row">
          <Search size={16} style={{ color: 'var(--color-surface-400)', flexShrink: 0 }} />
          <input
            ref={inputRef}
            id="global-search-input"
            className="search-modal__input"
            placeholder="Buscar por IP o MAC (ej: 192.168.88.10 o AA:BB:CC:DD:EE:FF)…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSearch(); }}
          />
          {(query || result) && (
            <button onClick={() => { clear(); setQuery(''); }} style={{ color: 'var(--color-surface-400)', background: 'none', border: 'none', cursor: 'pointer' }}>
              <X size={14} />
            </button>
          )}
          <button
            className="btn btn-primary"
            onClick={handleSearch}
            disabled={isLoading || query.length < 2}
            style={{ flexShrink: 0, fontSize: '0.75rem', padding: '0.35rem 0.75rem' }}
          >
            {isLoading ? <span className="loading-spinner" style={{ width: 14, height: 14 }} /> : 'Buscar'}
          </button>
        </div>

        {/* Results */}
        {error && (
          <div className="search-modal__error">
            <AlertCircle size={14} /> {error}
          </div>
        )}

        {hasResult && (
          <div className="search-modal__results">
            {/* ARP Match */}
            {result.arp_match && (
              <div className="search-result-section">
                <div className="search-result-section__title">
                  <Wifi size={13} /> MikroTik ARP
                </div>
                <div className="search-result-card">
                  <div className="search-result-row">
                    <span className="search-result-label">IP</span>
                    <span className="search-result-value">{result.arp_match.ip_address}</span>
                  </div>
                  <div className="search-result-row">
                    <span className="search-result-label">MAC</span>
                    <span className="search-result-value" style={{ fontFamily: 'var(--font-mono)' }}>{result.arp_match.mac_address}</span>
                  </div>
                  <div className="search-result-row">
                    <span className="search-result-label">Interfaz</span>
                    <span className="search-result-value">{result.arp_match.interface}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Wazuh Agent Match */}
            {result.agent_match && (
              <div className="search-result-section">
                <div className="search-result-section__title">
                  <Shield size={13} /> Agente Wazuh
                </div>
                <div className="search-result-card">
                  <div className="search-result-row">
                    <span className="search-result-label">Nombre</span>
                    <span className="search-result-value">{result.agent_match.name}</span>
                  </div>
                  <div className="search-result-row">
                    <span className="search-result-label">Estado</span>
                    <span className={`badge ${result.agent_match.status === 'active' ? 'badge-success' : 'badge-danger'}`}>
                      {result.agent_match.status}
                    </span>
                  </div>
                  <div className="search-result-row">
                    <span className="search-result-label">OS</span>
                    <span className="search-result-value">{result.agent_match.os_name} {result.agent_match.os_version}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Recent Alerts */}
            {result.recent_alerts.length > 0 && (
              <div className="search-result-section">
                <div className="search-result-section__title">
                  <AlertCircle size={13} /> Últimas alertas
                </div>
                {result.recent_alerts.slice(0, 5).map((alert, i) => (
                  <div key={i} className="search-result-alert">
                    <span className={`badge badge-${alert.rule_level >= 12 ? 'critical' : alert.rule_level >= 8 ? 'high' : 'medium'}`}>
                      {alert.rule_level}
                    </span>
                    <span className="search-result-alert__desc">{alert.rule_description}</span>
                    <span className="search-result-alert__time">
                      {formatDistanceToNow(alert.timestamp)}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* GLPI Inventory Match */}
            {result.glpi_match && (
              <div className="search-result-section">
                <div className="search-result-section__title">
                  <Package size={13} /> GLPI Inventario
                  {result.glpi_match.mock && (
                    <span className="badge badge-warning" style={{ fontSize: '0.58rem', marginLeft: 4 }}>demo</span>
                  )}
                </div>
                <div className="search-result-card">
                  <div className="search-result-row">
                    <span className="search-result-label">Equipo</span>
                    <span className="search-result-value">{result.glpi_match.name}</span>
                  </div>
                  <div className="search-result-row">
                    <span className="search-result-label">IP</span>
                    <span className="search-result-value" style={{ fontFamily: 'var(--font-mono)' }}>
                      {result.glpi_match.ip || '—'}
                    </span>
                  </div>
                  <div className="search-result-row">
                    <span className="search-result-label">Serial</span>
                    <span className="search-result-value" style={{ fontFamily: 'var(--font-mono)' }}>
                      {result.glpi_match.serial || '—'}
                    </span>
                  </div>
                  <div className="search-result-row">
                    <span className="search-result-label">Estado GLPI</span>
                    <span className={`badge ${result.glpi_match.status === 'activo' ? 'badge-success' : result.glpi_match.status === 'bajo_investigacion' ? 'badge-danger' : 'badge-warning'}`} style={{ fontSize: '0.62rem' }}>
                      {result.glpi_match.status}
                    </span>
                  </div>
                  {result.glpi_match.location && (
                    <div className="search-result-row">
                      <span className="search-result-label">Ubicación</span>
                      <span className="search-result-value">{result.glpi_match.location}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Quick Actions */}
            {result.arp_match?.ip_address && onBlockIP && (
              <div className="search-modal__actions">
                <button
                  className="btn btn-danger"
                  style={{ fontSize: '0.75rem' }}
                  onClick={() => {
                    onBlockIP(result.arp_match!.ip_address);
                    setOpen(false);
                  }}
                >
                  <ShieldOff size={13} /> Bloquear IP
                </button>
              </div>
            )}
          </div>
        )}

        {result && !hasResult && !isLoading && (
          <div className="search-modal__empty">
            No se encontraron resultados para <strong>{query}</strong>
          </div>
        )}
      </div>
    </div>
  );
}
