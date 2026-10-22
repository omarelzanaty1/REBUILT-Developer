/* ============================================================
   REBUILT — icons.js
   The icon system. One 24×24 line-icon set, drawn for this
   project (round caps/joins, 1.75 stroke, currentColor) — no
   emoji are used as UI icons anywhere in the app.

   Usage
     REBUILT.Icons.svg("flame", { size: 20 })  → "<svg …>"
     REBUILT.Icons.flame                       → same, 1em (legacy-friendly)
     REBUILT.Icons.has("flame")                → boolean
     REBUILT.Icons.HABIT_KEYS                  → icon keys offered in the picker
     REBUILT.Icons.fromLegacy("🔥")            → "flame"   (old emoji data)
   ============================================================ */

window.REBUILT = window.REBUILT || {};

REBUILT.Icons = (function () {
  const C = (cx, cy, r) => `<circle cx="${cx}" cy="${cy}" r="${r}"/>`;
  const R = (x, y, w, h, rx) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx || 0}"/>`;
  const DOT = (cx, cy) => `<circle cx="${cx}" cy="${cy}" r="1.1" fill="currentColor" stroke="none"/>`;

  /** name → inner SVG markup (24×24 grid) */
  const SET = {
    /* ---- Actions ---- */
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    edit: '<path d="M4 20h4L19.2 8.8a2.1 2.1 0 0 0-3-3L5 17v3z"/><path d="M14.5 7.5l3 3"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
    refresh: '<path d="M20 11a8 8 0 0 0-14-4L4 9"/><path d="M4 4v5h5"/><path d="M4 13a8 8 0 0 0 14 4l2-2"/><path d="M20 20v-5h-5"/>',
    download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
    upload: '<path d="M12 16V5M7 10l5-5 5 5M5 20h14"/>',
    logout: '<path d="M9 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3"/><path d="M15 8l4 4-4 4M19 12H9"/>',
    more: DOT(5, 12) + DOT(12, 12) + DOT(19, 12),
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',

    /* ---- Chevrons / arrows ---- */
    chevronDown: '<path d="M6 9l6 6 6-6"/>',
    chevronUp: '<path d="M6 15l6-6 6 6"/>',
    chevronLeft: '<path d="M15 6l-6 6 6 6"/>',
    chevronRight: '<path d="M9 6l6 6-6 6"/>',
    arrowLeft: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
    arrowRight: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    trend: '<path d="M4 17l6-6 4 4 6-8"/><path d="M15 7h5v5"/>',

    /* ---- Navigation / sections ---- */
    home: '<path d="M3.5 11L12 3.5 20.5 11"/><path d="M5.5 9.8V20h4.5v-5.5h4V20h4.5V9.8"/>',
    flame:
      '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
    tasks: R(4, 4, 16, 16, 3.5) + '<path d="M8.3 12.2l2.5 2.5 4.9-5.2"/>',
    target: C(12, 12, 9) + C(12, 12, 5) + `<circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none"/>`,
    calendar: R(4, 5, 16, 15, 2.5) + '<path d="M4 10h16M8 3v4M16 3v4"/>',
    chart: '<path d="M5 20V11M12 20V4M19 20v-6"/>',
    trophy:
      '<path d="M8 4h8v5a4 4 0 0 1-8 0V4z"/><path d="M8 6H5v2a3 3 0 0 0 3 3M16 6h3v2a3 3 0 0 1-3 3M12 13v4M9 20h6M10.5 17h3"/>',
    sparkles:
      '<path d="M11 3.5l1.9 5.1 5.1 1.9-5.1 1.9L11 17.5l-1.9-5.1L4 10.5l5.1-1.9L11 3.5z"/><path d="M18 15l.8 2.2L21 18l-2.2.8L18 21l-.8-2.2L15 18l2.2-.8L18 15z"/>',
    user: C(12, 8, 4) + '<path d="M4 21a8 8 0 0 1 16 0"/>',
    sliders: '<path d="M4 7h8M16 7h4M4 17h4M12 17h8"/>' + C(14, 7, 2) + C(10, 17, 2),

    /* ---- Status / feedback ---- */
    info: C(12, 12, 9) + '<path d="M12 11v5"/>' + DOT(12, 8),
    alert: '<path d="M12 4l9.5 16.5h-19L12 4z"/><path d="M12 10v4.5"/>' + DOT(12, 17.5),
    checkCircle: C(12, 12, 9) + '<path d="M8 12.5l3 3 5-6"/>',
    xCircle: C(12, 12, 9) + '<path d="M9 9l6 6M15 9l-6 6"/>',
    bolt: '<path d="M13 3L5 13.5h6L10 21l8-10.5h-6L13 3z"/>',
    star: '<path d="M12 3.5l2.6 5.5 6 .8-4.4 4.2 1.1 6-5.3-2.9-5.3 2.9 1.1-6L3.4 9.8l6-.8L12 3.5z"/>',
    flag: '<path d="M5 21V4"/><path d="M5 5h11l-2 4 2 4H5"/>',
    clock: C(12, 12, 9) + '<path d="M12 7v5l3.2 2"/>',
    repeat: '<path d="M17 3l3 3-3 3"/><path d="M20 6H8a4 4 0 0 0-4 4"/><path d="M7 21l-3-3 3-3"/><path d="M4 18h12a4 4 0 0 0 4-4"/>',
    list: '<path d="M9 6h11M9 12h11M9 18h11"/>' + DOT(4.5, 6) + DOT(4.5, 12) + DOT(4.5, 18),
    lightbulb:
      '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>',

    /* ---- Account / auth ---- */
    lock: R(5, 11, 14, 9, 2.5) + '<path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    mail: R(3, 5, 18, 14, 2.5) + '<path d="M3.5 7.5L12 13l8.5-5.5"/>',
    key: C(8, 15, 4) + '<path d="M11 12l9-9M16 8l3 3"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/>' + C(12, 12, 3),
    eyeOff:
      '<path d="M3 3l18 18"/><path d="M10.6 5.1A9.8 9.8 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4"/><path d="M6.5 6.7C3.6 8.5 2 12 2 12s3.5 7 10 7c1.6 0 3-.4 4.3-1"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
    shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>',

    /* ---- Planner item types ---- */
    coffee: '<path d="M5 9h11v6a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4V9z"/><path d="M16 10h2a2 2 0 0 1 0 4h-2M8 3v3M12 3v3"/>',

    /* ---- Habit pickers ---- */
    dumbbell: '<path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11"/>',
    book: '<path d="M12 6c-2-1.5-5-2-8-2v14c3 0 6 .5 8 2 2-1.5 5-2 8-2V4c-3 0-6 .5-8 2z"/><path d="M12 6v14"/>',
    droplet: '<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/>',
    moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/>',
    sun: C(12, 12, 4) + '<path d="M12 2.5v2M12 19.5v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2.5 12h2M19.5 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    heart: '<path d="M12 20s-8-5-8-11a4.5 4.5 0 0 1 8-2.5A4.5 4.5 0 0 1 20 9c0 6-8 11-8 11z"/>',
    pen: '<path d="M4 20l1-4L16.5 4.5a2.1 2.1 0 0 1 3 3L8 19l-4 1z"/><path d="M14 7l3 3"/>',
    music: '<path d="M9 18V5l11-2v13"/>' + C(6, 18, 3) + C(17, 16, 3),
    code: '<path d="M8 7l-5 5 5 5M16 7l5 5-5 5M14 4l-4 16"/>',
    briefcase: R(3, 7, 18, 13, 2.5) + '<path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 13h18"/>',
    cap: '<path d="M2 9l10-5 10 5-10 5L2 9z"/><path d="M6 11.5V16c0 1.5 3 3 6 3s6-1.5 6-3v-4.5M22 9v6"/>',
    leaf: '<path d="M5 19C5 9 11 4 20 4c0 9-5 15-15 15z"/><path d="M5 19l8-8"/>',
    activity: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
    apple: '<path d="M12 8c-2-1.8-7-1.3-7 4.5 0 4 3 8 5 8 1 0 1.4-.5 2-.5s1 .5 2 .5c2 0 5-4 5-8 0-5.8-5-6.3-7-4.5z"/><path d="M12 8c0-2 1-3.5 3-4.5"/>',
    wallet: '<path d="M4 7a2 2 0 0 1 2-2h11v4"/><path d="M4 7v10a2 2 0 0 0 2 2h14V9H6a2 2 0 0 1-2-2z"/>' + DOT(16, 14),
    smile: C(12, 12, 9) + '<path d="M8.5 14.2a4 4 0 0 0 7 0"/>' + DOT(9, 9.8) + DOT(15, 9.8),
    bike: C(6, 17, 3.2) + C(18, 17, 3.2) + '<path d="M6 17l4-8h5l3 8M10 9L8.5 6h-2M13.5 9.5L11 17"/>',
    globe: C(12, 12, 9) + '<path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>',
  };

  /* Keys offered in the habit icon picker, with an Arabic label for a11y. */
  const HABIT_ICONS = [
    ["flame", "نار"], ["dumbbell", "تمرين"], ["book", "قراءة"], ["droplet", "مياه"],
    ["moon", "نوم"], ["sun", "صباح"], ["heart", "صحة"], ["lightbulb", "تفكير"],
    ["coffee", "استراحة"], ["pen", "كتابة"], ["music", "موسيقى"], ["code", "برمجة"],
    ["briefcase", "شغل"], ["cap", "دراسة"], ["leaf", "طبيعة"], ["activity", "نشاط"],
    ["apple", "أكل صحي"], ["wallet", "فلوس"], ["smile", "مزاج"], ["target", "هدف"],
    ["bolt", "طاقة"], ["bike", "رياضة"], ["globe", "لغات"], ["star", "نجمة"],
  ];
  const HABIT_KEYS = HABIT_ICONS.map((p) => p[0]);

  /* Old data stored emoji in habit.icon — map the ones the previous
     picker offered to the closest icon so existing habits keep a sensible
     icon without touching what's saved. */
  const LEGACY = {
    "🔥": "flame", "💪": "dumbbell", "🏋️": "dumbbell", "🏃": "activity", "🚴": "bike", "🧘": "leaf", "🌿": "leaf",
    "📚": "book", "📖": "book", "💧": "droplet", "🥤": "droplet", "😴": "moon", "🌙": "moon", "🌅": "sun", "☀️": "sun",
    "❤️": "heart", "🧠": "lightbulb", "💡": "lightbulb", "☕": "coffee", "✍️": "pen", "📝": "pen", "🎵": "music",
    "🎧": "music", "💻": "code", "👨‍💻": "code", "💼": "briefcase", "🎓": "cap", "🍎": "apple", "🥗": "apple",
    "💰": "wallet", "😊": "smile", "🧑": "user", "🎯": "target", "⚡": "bolt", "🌍": "globe", "⭐": "star",
    "🏆": "trophy", "✅": "tasks", "🗓️": "calendar", "📅": "calendar", "⏰": "clock",
  };

  function has(name) {
    return Object.prototype.hasOwnProperty.call(SET, name);
  }

  /** Resolve any stored icon value (key, legacy emoji, unknown) to a known key. */
  function resolve(value, fallback) {
    if (value && has(value)) return value;
    if (value && LEGACY[value]) return LEGACY[value];
    return fallback || "target";
  }

  function svg(name, opts) {
    const o = opts || {};
    const body = SET[name] || SET.target;
    const size = o.size ? `${o.size}` : "1em";
    const stroke = o.stroke || 1.75;
    const cls = o.cls ? ` ${o.cls}` : "";
    return `<svg class="icon${cls}" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;
  }

  const api = {
    svg,
    has,
    resolve,
    names: () => Object.keys(SET),
    HABIT_ICONS,
    HABIT_KEYS,
    fromLegacy: (v) => resolve(v),
    isEmojiLike: (v) => !!v && !has(v),
  };

  // Legacy-friendly string getters: REBUILT.Icons.plus, REBUILT.Icons.check, …
  Object.keys(SET).forEach((name) => {
    Object.defineProperty(api, name, { get: () => svg(name), enumerable: true });
  });
  // Old names still used by a few call-sites
  Object.defineProperty(api, "fire", { get: () => svg("flame"), enumerable: false });
  Object.defineProperty(api, "x_circle", { get: () => svg("xCircle"), enumerable: false });

  return api;
})();
