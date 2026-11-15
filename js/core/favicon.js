// NiRi: browser mengisolasi CSS favicon SVG; injeksikan token yang sama tanpa duplikasi warna.
export async function initializeFavicon() {
  const link = document.querySelector('link[rel="icon"]'); if (!link) return;
  try {
    const url = new URL('../../assets/favicon.svg', import.meta.url);
    const response = await fetch(url); if (!response.ok) return;
    const svg = await response.text();
    const tokens = getComputedStyle(document.documentElement);
    const style = `style="--ink:${tokens.getPropertyValue('--ink').trim()};--pink-primary:${tokens.getPropertyValue('--pink-primary').trim()}"`;
    const image = svg.replace('<svg ', `<svg ${style} `);
    link.href = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(image)}`;
  } catch { /* NiRi: favicon monokrom tetap berfungsi jika pengambilan gagal. */ }
}
