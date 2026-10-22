/* ============================================================
   REBUILT — charts.js
   Hand-rolled SVG (no chart library). Three shapes:
   • radialProgress — completion / level ring, brand gradient stroke
   • barChart       — weekly trends, drawn as the logo's slanted bars
   • sparkBars      — tiny inline version for cards
   All values come from real state; nothing here invents numbers.
   ============================================================ */

window.REBUILT = window.REBUILT || {};

REBUILT.Charts = (function () {
  let uid = 0;
  const nextId = (p) => `${p}-${++uid}`;

  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  /** Circular progress ring. Returns an SVG string (the number in the middle is HTML the caller overlays). */
  function radialProgress(opts) {
    const size = opts.size || 160;
    const stroke = opts.strokeWidth || 12;
    const pct = Math.max(0, Math.min(100, Number(opts.pct) || 0));
    const r = (size - stroke) / 2;
    const c = size / 2;
    const circumference = 2 * Math.PI * r;
    const offset = circumference * (1 - pct / 100);
    const gid = nextId("rg");
    const track = opts.trackColor || "var(--ring-track)";

    return `
      <svg class="radial-ring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="${esc(opts.ariaLabel || "")}">
        <defs>
          <linearGradient id="${gid}" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0" stop-color="#FD662B"/><stop offset=".55" stop-color="#FFB500"/><stop offset="1" stop-color="#FFE504"/>
          </linearGradient>
        </defs>
        <circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${track}" stroke-width="${stroke}"></circle>
        <circle class="radial-ring__value" cx="${c}" cy="${c}" r="${r}" fill="none" stroke="url(#${gid})"
          stroke-width="${stroke}" stroke-linecap="round"
          stroke-dasharray="${circumference.toFixed(2)}" stroke-dashoffset="${offset.toFixed(2)}"
          transform="rotate(-90 ${c} ${c})"></circle>
      </svg>`;
  }

  /**
   * Bar chart drawn as the logo's slanted bars (parallelograms with a gradient).
   * data = [{ label, value, highlight? }]. Chronological left→right regardless of page direction.
   * opts: width, height, maxValue, suffix, unit label for aria, showValues
   */
  function barChart(data, opts) {
    opts = opts || {};
    const W = opts.width || 420;
    const H = opts.height || 190;
    const padTop = 22;
    const padBottom = 30;
    const lean = 7; // how far each bar leans, like the logo
    const gap = opts.gap != null ? opts.gap : 14;
    const n = Math.max(1, data.length);
    const maxValue = opts.maxValue || Math.max(1, ...data.map((d) => d.value));
    const barW = (W - lean - gap * (n - 1)) / n;
    const usable = H - padTop - padBottom;
    const gid = nextId("bg");
    const base = padTop + usable;

    const bars = data
      .map((d, i) => {
        const x = i * (barW + gap);
        const h = Math.max(d.value > 0 ? 5 : 3, (d.value / maxValue) * usable);
        const top = base - h;
        const empty = d.value <= 0;
        const pts = `${x},${base} ${x + barW},${base} ${x + barW + lean},${top} ${x + lean},${top}`;
        const fill = empty ? "var(--surface-3)" : `url(#${gid})`;
        const opacity = d.highlight === false ? 0.8 : 1;
        const label = `${esc(d.label)}: ${esc(d.value)}${esc(opts.suffix || "")}`;
        return `
          <g class="bar-chart__col">
            <polygon points="${pts}" fill="${fill}" opacity="${opacity}"><title>${label}</title></polygon>
            ${opts.showValues && !empty ? `<text x="${x + barW / 2 + lean / 2}" y="${top - 6}" text-anchor="middle" class="chart__value">${esc(d.value)}</text>` : ""}
            <text x="${x + barW / 2 + lean / 2}" y="${H - 9}" text-anchor="middle" class="chart__label${d.highlight ? " is-today" : ""}">${esc(d.label)}</text>
          </g>`;
      })
      .join("");

    const aria = esc(opts.ariaLabel || "رسم بياني بالأعمدة");
    return `
      <svg class="bar-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${aria}" style="direction:ltr">
        <defs>
          <linearGradient id="${gid}" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0" stop-color="#FD662B"/><stop offset=".6" stop-color="#FFB500"/><stop offset="1" stop-color="#FFE504"/>
          </linearGradient>
        </defs>
        <line x1="0" y1="${base}" x2="${W}" y2="${base}" class="chart__axis"/>
        ${bars}
      </svg>`;
  }

  return { radialProgress, barChart };
})();
