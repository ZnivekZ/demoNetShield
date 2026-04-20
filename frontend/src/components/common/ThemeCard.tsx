import type { ThemeConfig } from '../../config/themes';

interface ThemeCardProps {
  theme: ThemeConfig;
  isSelected: boolean;
  onSelect: (id: ThemeConfig['id']) => void;
}

/**
 * ThemeCard — tarjeta seleccionable para el selector de tema.
 * Muestra 3 swatches de color, el nombre, y una descripción breve.
 */
export function ThemeCard({ theme, isSelected, onSelect }: ThemeCardProps) {
  return (
    <button
      id={`theme-card-${theme.id}`}
      className={`theme-card ${isSelected ? 'theme-card--selected' : ''}`}
      onClick={() => onSelect(theme.id)}
      aria-pressed={isSelected}
      aria-label={`Tema ${theme.label}`}
      title={theme.description}
    >
      <div className="theme-card__swatches">
        {theme.swatches.map((color, i) => (
          <span
            key={i}
            className="theme-card__swatch"
            style={{ background: color }}
          />
        ))}
      </div>
      <div className="theme-card__info">
        <p className="theme-card__name">{theme.label}</p>
        <p className="theme-card__desc">{theme.description}</p>
      </div>
      {isSelected && (
        <span className="theme-card__check" aria-hidden="true">✓</span>
      )}
    </button>
  );
}
