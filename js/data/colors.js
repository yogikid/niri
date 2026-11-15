import { appError } from '../core/utils.js';

// Resolve application-owned CSS tokens at the boundary; persisted colors are #RRGGBB.
// Tests/Node supply palette explicitly. No hardcoded fallback brand color.
export function resolveColor(value = 'var(--pink-primary)', palette = {}) {
  let color = value;
  const token = typeof color === 'string' ? /^var\((--[a-zA-Z0-9-]+)\)$/.exec(color)?.[1] : null;
  if (token) color = palette[token] ?? palette[token.slice(2)] ?? (typeof document !== 'undefined' && typeof getComputedStyle === 'function' ? getComputedStyle(document.documentElement).getPropertyValue(token).trim() : '');
  if (typeof color !== 'string' || !/^#[0-9a-f]{6}$/i.test(color)) throw appError('invalid-argument', { message: `Warna ${value} belum tersedia. Berikan palette token heksadesimal atau muat CSS NiRi.` });
  return color;
}
