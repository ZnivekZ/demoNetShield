import { useEffect, useRef } from 'react';
import { X, RotateCcw, Palette, Type } from 'lucide-react';
import { THEMES } from '../../config/themes';
import { useTheme } from '../../hooks/useTheme';
import { ThemeCard } from './ThemeCard';
import { FontSizeSlider } from './FontSizeSlider';

interface SettingsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * SettingsDrawer — Panel lateral derecho "Centro de Control".
 * Permite cambiar el tema visual y la escala de tipografía.
 * Se cierra al hacer clic fuera o presionar Escape.
 */
export function SettingsDrawer({ isOpen, onClose }: SettingsDrawerProps) {
  const { theme, fontScale, applyTheme, applyFontScale, reset } = useTheme();
  const drawerRef = useRef<HTMLDivElement>(null);

  // Cerrar con Escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  // Atrapar foco dentro del drawer cuando está abierto
  useEffect(() => {
    if (isOpen) {
      drawerRef.current?.focus();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <>
      {/* Overlay semitransparente */}
      <div
        className="settings-overlay"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer */}
      <div
        ref={drawerRef}
        id="settings-drawer"
        className="settings-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Centro de Control"
        tabIndex={-1}
      >
        {/* Header */}
        <div className="settings-drawer__header">
          <div className="settings-drawer__title-row">
            <Palette size={16} className="settings-drawer__title-icon" />
            <h2 className="settings-drawer__title">Centro de Control</h2>
          </div>
          <button
            className="settings-drawer__close"
            onClick={onClose}
            aria-label="Cerrar panel de configuración"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="settings-drawer__body">

          {/* Sección: Tema */}
          <section className="settings-section">
            <div className="settings-section__header">
              <Palette size={14} />
              <h3 className="settings-section__title">Tema visual</h3>
            </div>
            <div className="settings-themes-grid">
              {THEMES.map(t => (
                <ThemeCard
                  key={t.id}
                  theme={t}
                  isSelected={theme === t.id}
                  onSelect={applyTheme}
                />
              ))}
            </div>
          </section>

          <div className="settings-divider" />

          {/* Sección: Tipografía */}
          <section className="settings-section">
            <div className="settings-section__header">
              <Type size={14} />
              <h3 className="settings-section__title">Tipografía</h3>
            </div>
            <FontSizeSlider value={fontScale} onChange={applyFontScale} />
          </section>

        </div>

        {/* Footer */}
        <div className="settings-drawer__footer">
          <button
            className="settings-reset-btn"
            onClick={reset}
            title="Restaurar tema Dark OLED y tamaño Normal"
          >
            <RotateCcw size={13} />
            Restablecer todo
          </button>
          <span className="settings-version">NetShield v1.0</span>
        </div>
      </div>
    </>
  );
}
