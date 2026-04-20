/**
 * NetShield Theme Configuration
 * Define los 6 temas disponibles y sus metadatos para el selector de UI.
 */

export type ThemeId = 'dark' | 'light' | 'sepia' | 'navy' | 'purple' | 'arctic';

export interface ThemeConfig {
  id: ThemeId;
  label: string;
  description: string;
  /** Tres colores representativos del tema para el swatch visual */
  swatches: [string, string, string];
  isDark: boolean;
}

export const THEMES: ThemeConfig[] = [
  {
    id: 'dark',
    label: 'Dark OLED',
    description: 'Negro puro, máximo contraste',
    swatches: ['#000000', '#0a0a0a', '#3b82f6'],
    isDark: true,
  },
  {
    id: 'navy',
    label: 'Navy Blue',
    description: 'Azul oscuro estilo GitHub',
    swatches: ['#0d1117', '#161b22', '#2f81f7'],
    isDark: true,
  },
  {
    id: 'purple',
    label: 'Purple Dark',
    description: 'Tonos lavanda estilo Dracula',
    swatches: ['#1e1e2e', '#27273a', '#cba6f7'],
    isDark: true,
  },
  {
    id: 'arctic',
    label: 'Arctic Blue',
    description: 'Paleta nórdica azul-gris',
    swatches: ['#2e3440', '#3b4252', '#88c0d0'],
    isDark: true,
  },
  {
    id: 'light',
    label: 'Light',
    description: 'Fondo claro, texto oscuro',
    swatches: ['#ffffff', '#f1f5f9', '#3b82f6'],
    isDark: false,
  },
  {
    id: 'sepia',
    label: 'Sepia',
    description: 'Tonos cálidos para lectura',
    swatches: ['#f4ede4', '#ede4d8', '#8b5e3c'],
    isDark: false,
  },
];

export const DEFAULT_THEME: ThemeId = 'dark';
export const DEFAULT_FONT_SCALE = 1.0;

export const FONT_SCALE_OPTIONS = [
  { value: 0.875, label: 'Pequeño' },
  { value: 1.0,   label: 'Normal' },
  { value: 1.125, label: 'Grande' },
  { value: 1.25,  label: 'Muy grande' },
] as const;

export const LS_THEME_KEY = 'netshield_theme';
export const LS_FONT_SCALE_KEY = 'netshield_font_scale';
