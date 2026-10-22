/* ============================================================
   REBUILT — brand.js
   Small helpers for the official identity. All logo artwork is
   the vector logo supplied in the brand file (assets/brand/*.svg);
   nothing is redrawn or approximated here.
   ============================================================ */

window.REBUILT = window.REBUILT || {};

REBUILT.Brand = (function () {
  const BASE = "assets/brand/";

  function img(file, cls, alt, extra) {
    return `<img class="${cls || ""}" src="${BASE}${file}" alt="${alt === undefined ? "REBUILT" : alt}" ${extra || ""} decoding="async" />`;
  }

  /** Horizontal lockup: mark + REBUILT wordmark + "Build yourself". */
  const lockup = (cls) => img("rebuilt-lockup.svg", cls, "REBUILT — Build yourself", 'width="690" height="166"');
  /** The R + stair mark on its own. */
  const mark = (cls) => img("rebuilt-mark.svg", cls, "REBUILT", 'width="284" height="212"');
  /** The rising stair — the logo's three gradient bars, used as a motif. */
  const stair = (cls) => img("rebuilt-stair.svg", cls, "", 'width="162" height="150" aria-hidden="true"');
  /** Heavy squared REBUILT wordmark (no tagline). */
  const wordmark = (cls) => img("rebuilt-wordmark.svg", cls, "REBUILT");

  /** First letter of a name (Arabic or Latin), upper-cased; "R" when there's no name. */
  function initial(name) {
    const t = String(name || "").trim();
    if (!t) return "R";
    return Array.from(t)[0].toUpperCase();
  }

  /** Avatar = initial on the brand gradient. No emoji, no image upload (there's no storage for one). */
  function avatar(name, size) {
    const cls = size ? ` avatar--${size}` : "";
    return `<span class="avatar${cls}" aria-hidden="true">${initial(name)}</span>`;
  }

  /** Three skewed bars that rise left→right: a quiet divider/accent. */
  function stairDivider() {
    return `<span class="stair-divider" aria-hidden="true"><i></i><i></i><i></i></span>`;
  }

  return { lockup, mark, stair, wordmark, initial, avatar, stairDivider };
})();
