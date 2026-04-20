import { useState, useCallback, useEffect } from 'react';
import {
  type ThemeId,
  DEFAULT_THEME,
  DEFAULT_FONT_SCALE,
  LS_THEME_KEY,
  LS_FONT_SCALE_KEY,
} from '../config/themes';

/**
 * useTheme — gestiona tema visual y escala de tipografía.
 *
 * - Lee/escribe `data-theme` en `document.documentElement`
 * - Lee/escribe `--font-scale` como CSS custom property en `<html>`
 * - Persiste en localStorage con las mismas claves que usa el anti-FOUC
 *   de index.html para que no haya FOUC al recargar.
 */
export function useTheme() {
  // Leer el tema actual del DOM (ya aplicado por el anti-FOUC script)
  const [theme, setThemeState] = useState<ThemeId>(() => {
    if (typeof document !== 'undefined') {
      const attr = document.documentElement.getAttribute('data-theme');
      if (attr) return attr as ThemeId;
    }
    return DEFAULT_THEME;
  });

  // Leer la escala actual del DOM o del localStorage
  const [fontScale, setFontScaleState] = useState<number>(() => {
    try {
      const stored = localStorage.getItem(LS_FONT_SCALE_KEY);
      return stored ? parseFloat(stored) : DEFAULT_FONT_SCALE;
    } catch {
      return DEFAULT_FONT_SCALE;
    }
  });

  /** Cambia el tema: actualiza el DOM y persiste en localStorage */
  const applyTheme = useCallback((newTheme: ThemeId) => {
    document.documentElement.setAttribute('data-theme', newTheme);
    setThemeState(newTheme);
    try {
      localStorage.setItem(LS_THEME_KEY, newTheme);
    } catch {
      // Modo privado u otro error — ignorar
    }
  }, []);

  /** Cambia la escala de fuente: actualiza el DOM y persiste en localStorage */
  const applyFontScale = useCallback((scale: number) => {
    document.documentElement.style.setProperty('--font-scale', String(scale));
    setFontScaleState(scale);
    try {
      localStorage.setItem(LS_FONT_SCALE_KEY, String(scale));
    } catch {
      // Modo privado u otro error — ignorar
    }
  }, []);

  /** Restaura los defaults (dark + 1.0) */
  const reset = useCallback(() => {
    applyTheme(DEFAULT_THEME);
    applyFontScale(DEFAULT_FONT_SCALE);
  }, [applyTheme, applyFontScale]);

  // Inicializar la escala de fuente en el DOM al montar (por si el anti-FOUC
  // solo aplicó el tema pero no la escala exactamente)
  useEffect(() => {
    document.documentElement.style.setProperty('--font-scale', String(fontScale));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    theme,
    fontScale,
    applyTheme,
    applyFontScale,
    reset,
  };
}
