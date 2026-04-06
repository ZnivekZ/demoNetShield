/**
 * LocationMap — Grid of cards showing asset count per classroom/lab.
 * Clicking a location card filters to show its assets.
 */
import { useState } from 'react';
import { MapPin, Monitor, ChevronRight, Building2 } from 'lucide-react';
import { useGlpiLocations, useGlpiAssetsByLocation } from '../../hooks/useGlpiAssets';
import type { GlpiAsset, GlpiLocation } from '../../types';

interface Props {
  onSelectAsset: (asset: GlpiAsset) => void;
}

function LocationCard({
  location,
  onSelect,
  isSelected,
}: {
  location: GlpiLocation;
  onSelect: () => void;
  isSelected: boolean;
}) {
  const { data: assets = [], isLoading } = useGlpiAssetsByLocation(location.id);

  return (
    <div
      id={`location-card-${location.id}`}
      className={`glass-card location-card ${isSelected ? 'location-card--active' : ''}`}
      onClick={onSelect}
      style={{ cursor: 'pointer' }}
    >
      <div className="location-card__header">
        <div className="location-card__icon">
          <Building2 size={16} />
        </div>
        <div className="location-card__name">{location.name}</div>
        {isSelected && <ChevronRight size={14} style={{ color: 'var(--color-brand-400)', marginLeft: 'auto', flexShrink: 0 }} />}
      </div>
      {location.completename && location.completename !== location.name && (
        <div className="location-card__sub">{location.completename}</div>
      )}
      <div className="location-card__stats">
        <Monitor size={12} />
        {isLoading ? (
          <span>…</span>
        ) : (
          <span>{assets.length} equipo{assets.length !== 1 ? 's' : ''}</span>
        )}
      </div>
    </div>
  );
}

function LocationAssets({
  locationId,
  locationName,
  onSelectAsset,
}: {
  locationId: number;
  locationName: string;
  onSelectAsset: (asset: GlpiAsset) => void;
}) {
  const { data: assets = [], isLoading } = useGlpiAssetsByLocation(locationId);

  return (
    <div className="glass-card location-assets">
      <div className="location-assets__header">
        <MapPin size={14} style={{ color: 'var(--color-brand-400)' }} />
        <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>
          {locationName} — {assets.length} equipo{assets.length !== 1 ? 's' : ''}
        </span>
      </div>
      {isLoading ? (
        <div style={{ padding: '1rem', textAlign: 'center' }}>
          <span className="loading-spinner" />
        </div>
      ) : assets.length === 0 ? (
        <div style={{ padding: '1rem', fontSize: '0.8rem', color: 'var(--color-surface-500)' }}>
          Sin equipos en esta ubicación.
        </div>
      ) : (
        <div className="location-assets__list">
          {assets.map((asset) => (
            <div
              key={asset.id}
              className="location-asset-item"
              onClick={() => onSelectAsset(asset)}
              title="Ver detalle"
            >
              <Monitor size={13} style={{ color: 'var(--color-brand-400)', flexShrink: 0 }} />
              <div className="location-asset-item__info">
                <span className="location-asset-item__name">{asset.name}</span>
                <span className="location-asset-item__ip">{asset.ip || 'Sin IP'}</span>
              </div>
              <span
                className={`badge ${asset.status === 'activo' ? 'badge-success' : asset.status === 'reparacion' ? 'badge-warning' : 'badge-low'}`}
                style={{ fontSize: '0.58rem', flexShrink: 0 }}
              >
                {asset.status}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function LocationMap({ onSelectAsset }: Props) {
  const { data: locations = [], isLoading } = useGlpiLocations();
  const [selectedLocation, setSelectedLocation] = useState<GlpiLocation | null>(null);

  if (isLoading) {
    return (
      <div style={{ padding: '3rem', textAlign: 'center' }}>
        <span className="loading-spinner" />
        <p style={{ color: 'var(--color-surface-500)', fontSize: '0.85rem', marginTop: '0.75rem' }}>
          Cargando ubicaciones…
        </p>
      </div>
    );
  }

  if (locations.length === 0) {
    return (
      <div className="glass-card" style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-surface-500)' }}>
        No hay ubicaciones configuradas en GLPI.
      </div>
    );
  }

  return (
    <div className="location-map">
      <div className="location-map__grid">
        {locations.map((loc) => (
          <LocationCard
            key={loc.id}
            location={loc}
            isSelected={selectedLocation?.id === loc.id}
            onSelect={() => setSelectedLocation(selectedLocation?.id === loc.id ? null : loc)}
          />
        ))}
      </div>

      {selectedLocation && (
        <LocationAssets
          locationId={selectedLocation.id}
          locationName={selectedLocation.name}
          onSelectAsset={onSelectAsset}
        />
      )}
    </div>
  );
}
