import { escapeHTML as esc } from '../core/utils.js';

const STATUS_LABELS = {
  todo: 'Belum dikerjakan',
  in_progress: 'Sedang dikerjakan',
  review: 'Dalam peninjauan',
  done: 'Selesai',
};

const STATUS_COLORS = {
  todo: 'var(--pink-light)',
  in_progress: 'var(--pink-primary)',
  review: 'var(--warning)',
  done: 'var(--success)',
};

const PRIORITY_LABELS = {
  low: 'Rendah',
  medium: 'Sedang',
  high: 'Tinggi',
  critical: 'Kritis',
};

const PRIORITY_COLORS = {
  low: 'var(--success)',
  medium: 'var(--warning)',
  high: 'var(--pink-primary)',
  critical: 'var(--danger)',
};

const COLOR_PALETTE = [
  'var(--pink-primary)',
  'var(--success)',
  'var(--warning)',
  'var(--pink-soft)',
  'var(--beige-accent)',
  'var(--danger)',
  'var(--muted-ink)',
];

function sanitizeNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? Math.round(num) : 0;
}

function normalizeKeyValuePairs(counts, labels = {}, defaultLabels = {}) {
  if (!counts || typeof counts !== 'object') return [];

  if (Array.isArray(counts)) {
    return counts.map((val, idx) => {
      const label = (Array.isArray(labels) ? labels[idx] : labels?.[idx]) ?? defaultLabels[idx] ?? `Kategori ${idx + 1}`;
      return {
        key: String(idx),
        value: sanitizeNumber(val),
        label: String(label),
      };
    });
  }

  return Object.entries(counts).map(([key, val]) => {
    const label = (labels && typeof labels === 'object' && Object.hasOwn(labels, key))
      ? labels[key]
      : (defaultLabels[key] ?? key);
    return {
      key,
      value: sanitizeNumber(val),
      label: String(label),
    };
  });
}

export function donutChart(counts, labels = {}) {
  const items = normalizeKeyValuePairs(counts, labels, STATUS_LABELS);
  const total = items.reduce((sum, item) => sum + item.value, 0);

  if (items.length === 0 || total === 0) {
    const ariaText = 'Grafik lingkaran: Belum ada data status tugas.';
    return `<svg class="chart-donut chart-empty" viewBox="0 0 240 240" role="img" aria-label="${esc(ariaText)}"><circle cx="120" cy="120" r="70" fill="none" stroke="var(--beige-accent)" stroke-width="24"/><text x="120" y="115" text-anchor="middle" font-size="14" font-weight="600" fill="var(--muted-ink)">Belum ada data</text><text x="120" y="135" text-anchor="middle" font-size="12" fill="var(--muted-ink)">status tugas</text></svg>`;
  }

  const ariaDetails = items.map((item) => `${item.label}: ${item.value} tugas`).join(', ');
  const ariaText = `Distribusi tugas: ${ariaDetails}. Total: ${total} tugas.`;

  let cumulativePercent = 0;
  const segments = [];

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    if (item.value <= 0) continue;

    const percent = Number(((item.value / total) * 100).toFixed(4));
    const remainder = Number((100 - percent).toFixed(4));
    const color = STATUS_COLORS[item.key] || COLOR_PALETTE[idx % COLOR_PALETTE.length];

    segments.push(
      `<circle cx="120" cy="120" r="70" fill="none" stroke="${color}" stroke-width="26" ` +
      `pathLength="100" stroke-dasharray="${percent} ${remainder}" ` +
      `stroke-dashoffset="${-cumulativePercent}" transform="rotate(-90 120 120)">` +
      `<title>${esc(item.label)}: ${item.value} tugas (${percent}%)</title>` +
      `</circle>`
    );

    cumulativePercent += percent;
  }

  const legendY = 240;
  const legendItems = items.map((item, idx) => {
    const color = STATUS_COLORS[item.key] || COLOR_PALETTE[idx % COLOR_PALETTE.length];
    return `<g class="chart-legend-item" transform="translate(0, ${idx * 22})"><rect width="10" height="10" fill="${color}" stroke="var(--ink)" stroke-width="1.5" rx="2"/><text x="16" y="9" font-size="11" fill="var(--ink)">${esc(item.label)} (${item.value})</text></g>`;
  });

  return (
    `<svg class="chart-donut" viewBox="0 0 300 ${legendY + items.length * 22 + 10}" role="img" aria-label="${esc(ariaText)}">` +
    `<g class="chart-donut-graphic">${segments.join('')}</g>` +
    `<g class="chart-donut-center" aria-hidden="true">` +
    `<text x="120" y="115" text-anchor="middle" font-size="28" font-weight="bold" fill="var(--ink)">${total}</text>` +
    `<text x="120" y="135" text-anchor="middle" font-size="12" fill="var(--muted-ink)">Total Tugas</text>` +
    `</g>` +
    `<g class="chart-donut-legend" transform="translate(16, ${legendY})" aria-hidden="true">${legendItems.join('')}</g>` +
    `</svg>`
  );
}

export function barChart(counts, labels = {}) {
  const items = normalizeKeyValuePairs(counts, labels, PRIORITY_LABELS);
  const total = items.reduce((sum, item) => sum + item.value, 0);

  if (items.length === 0 || (!counts && !labels)) {
    const ariaText = 'Grafik prioritas: Belum ada data prioritas tugas.';
    return `<svg class="chart-bar chart-empty" viewBox="0 0 340 180" role="img" aria-label="${esc(ariaText)}"><text x="170" y="95" text-anchor="middle" font-size="14" fill="var(--muted-ink)">Belum ada data prioritas tugas</text></svg>`;
  }

  const ariaDetails = items.map((item) => `${item.label}: ${item.value} tugas`).join(', ');
  const ariaText = `Grafik prioritas tugas: ${ariaDetails}. Total: ${total} tugas.`;

  const maxVal = Math.max(...items.map((i) => i.value), 1);
  const chartHeight = 120;
  const chartWidth = 300;
  const startX = 20;
  const startY = 140;
  const count = items.length;
  const barWidth = Math.max(20, Math.floor((chartWidth - (count - 1) * 12) / count));

  const bars = items.map((item, idx) => {
    const x = startX + idx * (barWidth + 12);
    const height = Math.round((item.value / maxVal) * chartHeight);
    const y = startY - height;
    const color = PRIORITY_COLORS[item.key] || COLOR_PALETTE[idx % COLOR_PALETTE.length];

    return (
      `<g class="chart-bar-col">` +
      `<rect x="${x}" y="${y}" width="${barWidth}" height="${height}" fill="${color}" stroke="var(--ink)" stroke-width="2" rx="4">` +
      `<title>${esc(item.label)}: ${item.value} tugas</title>` +
      `</rect>` +
      `<text x="${x + barWidth / 2}" y="${y - 6}" text-anchor="middle" font-size="12" font-weight="bold" fill="var(--ink)">${item.value}</text>` +
      `<text x="${x + barWidth / 2}" y="${startY + 18}" text-anchor="middle" font-size="11" fill="var(--ink)">${esc(item.label)}</text>` +
      `</g>`
    );
  });

  return (
    `<svg class="chart-bar" viewBox="0 0 340 180" role="img" aria-label="${esc(ariaText)}">` +
    `<line x1="16" y1="${startY}" x2="324" y2="${startY}" stroke="var(--ink)" stroke-width="2"/>` +
    `<g class="chart-bar-group">${bars.join('')}</g>` +
    `</svg>`
  );
}

export function workloadChart(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    const ariaText = 'Beban kerja tim: Belum ada data beban kerja tim.';
    return `<svg class="chart-workload chart-empty" viewBox="0 0 360 160" role="img" aria-label="${esc(ariaText)}"><text x="180" y="85" text-anchor="middle" font-size="14" fill="var(--muted-ink)">Belum ada data beban kerja tim</text></svg>`;
  }

  const items = rows.map((row) => {
    const active = sanitizeNumber(row?.active);
    const overdue = Math.min(active, sanitizeNumber(row?.overdue));
    const name = String(row?.name || 'Anggota');
    return { name, active, overdue };
  });

  const ariaDetails = items.map((item) => `${item.name}: ${item.active} tugas aktif, ${item.overdue} terlambat`).join('; ');
  const ariaText = `Beban kerja tim: ${ariaDetails}.`;

  const maxVal = Math.max(...items.map((i) => i.active), 1);
  const rowHeight = 54;
  const startY = 18;
  const totalHeight = Math.max(140, items.length * rowHeight + 36);
  const trackX = 16;
  const trackWidth = 210;

  const rowElements = items.map((item, idx) => {
    const y = startY + idx * rowHeight;
    const activeWidth = Math.round((item.active / maxVal) * trackWidth);
    const overdueWidth = Math.round((item.overdue / maxVal) * trackWidth);

    return (
      `<g class="chart-workload-row" transform="translate(0, ${y})">` +
      `<text x="16" y="14" font-size="12" font-weight="600" fill="var(--ink)">${esc(item.name.length>44?`${item.name.slice(0,41)}…`:item.name)}</text>` +
      `<rect x="${trackX}" y="24" width="${trackWidth}" height="16" fill="var(--surface-cream)" stroke="var(--ink)" stroke-width="1.5" rx="3"/>` +
      (activeWidth > 0
        ? `<rect x="${trackX}" y="24" width="${activeWidth}" height="16" fill="var(--pink-primary)" stroke="var(--ink)" stroke-width="1.5" rx="3"/>`
        : '') +
      (overdueWidth > 0
        ? `<rect x="${trackX}" y="24" width="${overdueWidth}" height="16" fill="var(--danger)" stroke="var(--ink)" stroke-width="1.5" rx="3"/>`
        : '') +
      `<text x="${trackX + trackWidth + 10}" y="36" font-size="11" fill="var(--ink)">${item.active} aktif (${item.overdue} terlambat)</text>` +
      `</g>`
    );
  });

  return (
    `<svg class="chart-workload" viewBox="0 0 420 ${totalHeight}" role="img" aria-label="${esc(ariaText)}">` +
    `<g class="chart-workload-group">${rowElements.join('')}</g>` +
    `</svg>`
  );
}

export function projectProgressChart(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    const ariaText = 'Progres proyek: Belum ada data progres proyek.';
    return `<svg class="chart-progress chart-empty" viewBox="0 0 360 160" role="img" aria-label="${esc(ariaText)}"><text x="180" y="85" text-anchor="middle" font-size="14" fill="var(--muted-ink)">Belum ada data progres proyek</text></svg>`;
  }

  const items = rows.map((row) => {
    const total = sanitizeNumber(row?.total);
    const done = Math.min(total, sanitizeNumber(row?.done));
    const percentage = total > 0 ? Math.min(100, Math.max(0, Math.round((done / total) * 100))) : 0;
    const name = String(row?.name || 'Proyek');
    return { name, done, total, percentage };
  });

  const ariaDetails = items.map((item) => `${item.name}: ${item.percentage}% (${item.done} dari ${item.total} tugas)`).join('; ');
  const ariaText = `Progres proyek: ${ariaDetails}.`;

  const rowHeight = 44;
  const startY = 20;
  const totalHeight = Math.max(140, items.length * rowHeight + 30);
  const trackX = 16;
  const trackWidth = 270;

  const projectElements = items.map((item, idx) => {
    const y = startY + idx * rowHeight;
    const progressWidth = Math.round((item.percentage / 100) * trackWidth);

    return (
      `<g class="chart-progress-row" transform="translate(0, ${y})">` +
      `<text x="16" y="12" font-size="12" font-weight="600" fill="var(--ink)">${esc(item.name.length>44?`${item.name.slice(0,41)}…`:item.name)}</text>` +
      `<text x="330" y="12" text-anchor="end" font-size="12" font-weight="bold" fill="var(--ink)">${item.percentage}%</text>` +
      `<rect x="${trackX}" y="18" width="${trackWidth}" height="14" fill="var(--surface-cream)" stroke="var(--ink)" stroke-width="2" rx="4"/>` +
      (progressWidth > 0
        ? `<rect x="${trackX}" y="18" width="${progressWidth}" height="14" fill="var(--success)" stroke="var(--ink)" stroke-width="2" rx="4"/>`
        : '') +
      `<text x="296" y="29" font-size="10" fill="var(--muted-ink)">(${item.done}/${item.total})</text>` +
      `</g>`
    );
  });

  return (
    `<svg class="chart-progress" viewBox="0 0 350 ${totalHeight}" role="img" aria-label="${esc(ariaText)}">` +
    `<g class="chart-progress-group">${projectElements.join('')}</g>` +
    `</svg>`
  );
}
