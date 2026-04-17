/**
 * CountryFlag — convierte código ISO 3166-1 alpha-2 a emoji de bandera.
 *
 * Usa Unicode Regional Indicator Symbols (U+1F1E6..U+1F1FF).
 * No requiere fuentes ni dependencias externas.
 *
 * Casos especiales:
 *  - "LOCAL" → 🏠
 *  - "UNKNOWN" o vacío → 🌐
 */

interface CountryFlagProps {
  code: string;
  size?: 'sm' | 'md' | 'lg';
  /** Si es true, muestra el código ISO como tooltip */
  tooltip?: boolean;
  className?: string;
}

function isoToFlagEmoji(code: string): string {
  if (!code || code === 'UNKNOWN') return '🌐';
  if (code === 'LOCAL') return '🏠';
  // Regional Indicator = 0x1F1E6 − 65 + charCode
  return [...code.toUpperCase()]
    .map(c => String.fromCodePoint(0x1F1E6 - 65 + c.charCodeAt(0)))
    .join('');
}

const SIZE_CLASS: Record<string, string> = {
  sm: 'text-base',
  md: 'text-xl',
  lg: 'text-3xl',
};

export function CountryFlag({
  code,
  size = 'md',
  tooltip = true,
  className = '',
}: CountryFlagProps) {
  const flag = isoToFlagEmoji(code);
  const sizeClass = SIZE_CLASS[size] ?? SIZE_CLASS.md;

  return (
    <span
      role="img"
      aria-label={`Flag of ${code}`}
      title={tooltip ? code : undefined}
      className={`inline-block leading-none select-none ${sizeClass} ${className}`}
    >
      {flag}
    </span>
  );
}

export { isoToFlagEmoji };
