/**
 * Цветовые темы сайта. Меняется только акцентный цвет — основа (тёмно-бирюзовый фон) у всех одна.
 * Каждая тема проверена на контраст: текст на кнопке и акцентный текст на фоне — не ниже 4.5:1.
 * CSS-версия этих же значений — src/styles/tokens.css (проверка совпадения — admin/test/themes.test.ts).
 */
import type { THEMES, BACKGROUNDS } from './schema';

export interface Theme { label: string; accent: string; hover: string; onAccent: string; glowRgb: string }

export const THEME_VALUES: Record<(typeof THEMES)[number], Theme> = {
  violet: { label: 'Фиолетовая', accent: '#a97bff', hover: '#c3a0ff', onAccent: '#160c2a', glowRgb: '150, 95, 255' },
  coral: { label: 'Коралловая', accent: '#ff7a6b', hover: '#ff9d91', onAccent: '#2a0e0a', glowRgb: '255, 110, 90' },
  mint: { label: 'Мятная', accent: '#4fd1a5', hover: '#7fe0bf', onAccent: '#06231a', glowRgb: '60, 200, 150' },
  sky: { label: 'Небесная', accent: '#5fb4ff', hover: '#8ccbff', onAccent: '#08203a', glowRgb: '70, 150, 255' },
};

/**
 * Цвета фона. Все тёмные: светлый текст и акцентные цвета читаются на любом (контраст ≥ 4.5:1).
 * bg — фон страницы, surface/surface2/tile — карточки, footer — подвал, barRgb — нижняя плашка на телефоне.
 * CSS-версия — src/styles/tokens.css (совпадение проверяет тест).
 */
export interface Background { label: string; bg: string; surface: string; surface2: string; tile: string; footer: string; barRgb: string }

export const BG_VALUES: Record<(typeof BACKGROUNDS)[number], Background> = {
  teal: { label: 'Бирюзовая ночь', bg: '#0e1a1c', surface: '#15252a', surface2: '#1e3439', tile: '#1a2d31', footer: '#0a1416', barRgb: '10, 20, 22' },
  graphite: { label: 'Графит', bg: '#141416', surface: '#1d1d21', surface2: '#28282e', tile: '#222227', footer: '#0d0d0f', barRgb: '13, 13, 15' },
  navy: { label: 'Тёмно-синий', bg: '#0d1424', surface: '#151e33', surface2: '#1e2a44', tile: '#19233b', footer: '#090e1a', barRgb: '9, 14, 26' },
  wine: { label: 'Бордо', bg: '#1c0f14', surface: '#2a161d', surface2: '#3a1f28', tile: '#321b23', footer: '#130a0e', barRgb: '19, 10, 14' },
  black: { label: 'Чёрный', bg: '#0a0a0a', surface: '#151515', surface2: '#202020', tile: '#1a1a1a', footer: '#050505', barRgb: '5, 5, 5' },
};
