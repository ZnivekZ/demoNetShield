import { FONT_SCALE_OPTIONS } from '../../config/themes';

interface FontSizeSliderProps {
  value: number;
  onChange: (scale: number) => void;
}

/**
 * FontSizeSlider — control de escala de tipografía.
 * Usa los valores predefinidos de FONT_SCALE_OPTIONS.
 * Incluye preview en tiempo real del tamaño de texto.
 */
export function FontSizeSlider({ value, onChange }: FontSizeSliderProps) {
  const min = FONT_SCALE_OPTIONS[0].value;
  const max = FONT_SCALE_OPTIONS[FONT_SCALE_OPTIONS.length - 1].value;
  const step = 0.125;

  const currentOption = FONT_SCALE_OPTIONS.find(o => Math.abs(o.value - value) < 0.001);
  const currentLabel = currentOption?.label ?? 'Personalizado';

  return (
    <div className="font-slider">
      <div className="font-slider__header">
        <span className="font-slider__label">Tamaño de texto</span>
        <span className="font-slider__value">{currentLabel}</span>
      </div>

      <input
        id="font-scale-slider"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        className="font-slider__range"
        aria-label="Escala de tipografía"
      />

      <div className="font-slider__marks">
        {FONT_SCALE_OPTIONS.map(opt => (
          <button
            key={opt.value}
            className={`font-slider__mark ${Math.abs(opt.value - value) < 0.001 ? 'active' : ''}`}
            onClick={() => onChange(opt.value)}
            aria-label={`Tamaño ${opt.label}`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="font-slider__preview">
        <span className="font-slider__preview-label">Vista previa:</span>
        <span
          className="font-slider__preview-text"
          style={{ fontSize: `${value}rem` }}
        >
          NetShield Dashboard
        </span>
      </div>
    </div>
  );
}
