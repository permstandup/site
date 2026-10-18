/**
 * Цветовые темы сайта. Меняется только акцентный цвет — основа (тёмно-бирюзовый фон) у всех одна.
 * Каждая тема проверена на контраст: текст на кнопке и акцентный текст на фоне — не ниже 4.5:1.
 * CSS-версия этих же значений — src/styles/tokens.css (проверка совпадения — admin/test/themes.test.ts).
 */
import type { THEMES } from './schema';

export interface Theme { label: string; accent: string; hover: string; onAccent: string; glowRgb: string }

export const THEME_VALUES: Record<(typeof THEMES)[number], Theme> = {
  violet: { label: 'Фиолетовая', accent: '#a97bff', hover: '#c3a0ff', onAccent: '#160c2a', glowRgb: '150, 95, 255' },
  coral: { label: 'Коралловая', accent: '#ff7a6b', hover: '#ff9d91', onAccent: '#2a0e0a', glowRgb: '255, 110, 90' },
  mint: { label: 'Мятная', accent: '#4fd1a5', hover: '#7fe0bf', onAccent: '#06231a', glowRgb: '60, 200, 150' },
  sky: { label: 'Небесная', accent: '#5fb4ff', hover: '#8ccbff', onAccent: '#08203a', glowRgb: '70, 150, 255' },
};
