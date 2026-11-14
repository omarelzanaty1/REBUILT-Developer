/* ============================================================
   REBUILT — brand.js
   Small helpers for the official identity. All logo artwork is
   the vector logo supplied in the brand file (assets/brand/*.svg);
   nothing is redrawn or approximated here.
   ============================================================ */

window.REBUILT = window.REBUILT || {};

REBUILT.Brand = (function () {
  const BASE = "assets/brand/";

  /* The wordmark and the R are drawn in the theme's ink colour: a picture loaded through <img> cannot read the
     page's CSS variables, so the light theme has its own copies (…-light.svg) and the right one is picked when
     the markup is built (a theme change re-renders the screen). */
  const isLight = () => !!(REBUILT.Theme && REBUILT.Theme.getResolved() === "light");
  const withInk = (file) => (isLight() ? file.replace(/\.svg$/, "-light.svg") : file);

  function img(file, cls, alt, extra) {
    return `<img class="${cls || ""}" src="${BASE}${file}" alt="${alt === undefined ? "REBUILT" : alt}" ${extra || ""} decoding="async" />`;
  }

  /* Both inks are fetched once, a moment after the page has loaded. A theme change then finds the other copy already in memory:
     the new logo appears in the same frame as the new colours. Without this the new <img> is empty for a few milliseconds, the page
     is shorter for that long, the browser clamps the scroll position, and the screen visibly jumps when the file arrives. */
  const kept = [];
  function preloadInks() {
    ["rebuilt-lockup", "rebuilt-mark", "rebuilt-wordmark"].forEach((n) => ["", "-light"].forEach((v) => {
      const im = new Image(); im.decoding = "async"; im.src = BASE + n + v + ".svg"; kept.push(im);
    }));
  }
  if (document.readyState === "complete") setTimeout(preloadInks, 0); else window.addEventListener("load", () => setTimeout(preloadInks, 0), { once: true });

  /** Horizontal lockup: mark + REBUILT wordmark + "Build yourself". */
  const lockup = (cls) => img(withInk("rebuilt-lockup.svg"), cls, "REBUILT — Build yourself", 'width="690" height="166"');
  /** The R + stair mark on its own. */
  const mark = (cls) => img(withInk("rebuilt-mark.svg"), cls, "REBUILT", 'width="284" height="212"');
  /** The rising stair — the logo's three gradient bars, used as a motif. */
  const stair = (cls) => img("rebuilt-stair.svg", cls, "", 'width="162" height="150" aria-hidden="true"');
  /** Heavy squared REBUILT wordmark (no tagline). */
  const wordmark = (cls) => img(withInk("rebuilt-wordmark.svg"), cls, "REBUILT");

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
