/* ============================================================
   REBUILT — shell.js
   The app chrome: sidebar (desktop) / icon rail (tablet) /
   top bar + bottom tabs + "More" sheet (phone). One NAV config
   drives all of them so they can never drift apart.
   ============================================================ */

window.REBUILT = window.REBUILT || {};

REBUILT.Shell = (function () {
  const I = () => REBUILT.Icons;

  /** id → label/icon. `group` decides sidebar sections; `tab` marks the phone bottom-bar items. */
  const NAV = [
    { id: "dashboard", get label() { return REBUILT.t("common.home"); }, icon: "home", group: "main", tab: true },
    { id: "planner", get label() { return REBUILT.t("common.my_day"); }, icon: "calendar", group: "main" },
    { id: "habits", get label() { return REBUILT.t("common.habits"); }, icon: "flame", group: "main", tab: true },
    { id: "tasks", get label() { return REBUILT.t("common.tasks"); }, icon: "tasks", group: "main", tab: true },
    { id: "goals", get label() { return REBUILT.t("common.goals"); }, icon: "target", group: "main", tab: true },
    { id: "analytics", get label() { return REBUILT.t("common.analytics"); }, icon: "chart", group: "insights" },
    { id: "achievements", get label() { return REBUILT.t("common.achievements"); }, icon: "trophy", group: "insights" },
    { id: "ai", label: "REBUILT AI", icon: "sparkles", group: "ai", get badge() { return REBUILT.t("common.soon"); } },
    { id: "profile", get label() { return REBUILT.t("common.profile"); }, icon: "user", group: "account", sheetOnly: true },
    { id: "settings", get label() { return REBUILT.t("common.settings"); }, icon: "sliders", group: "account" },
  ];
  const MORE_IDS = ["planner", "analytics", "achievements", "ai", "profile", "settings"];

  const GROUPS = [
    { id: "main", label: "" },
    { id: "insights", get label() { return REBUILT.t("common.your_progress"); } },
    { id: "ai", label: "" },
    { id: "account", label: "" },
  ];

  let mounted = false;

  function navItem(n) {
    return `
      <button type="button" class="nav-item" data-nav="${n.id}" data-tip="${n.label}">
        ${I().svg(n.icon)}
        <span class="nav-item__label">${n.label}</span>
        ${n.badge ? `<span class="badge badge--soon">${n.badge}</span>` : ""}
      </button>`;
  }

  function sidebarHTML() {
    const groups = GROUPS.map((g) => {
      const items = NAV.filter((n) => n.group === g.id && !n.sheetOnly);
      if (!items.length) return "";
      return `
        <div class="sidebar__group">
          ${g.label ? `<div class="sidebar__group-label">${g.label}</div>` : ""}
          ${items.map(navItem).join("")}
        </div>`;
    }).join("");

    return `
      <button type="button" class="sidebar__brand" data-nav="dashboard" aria-label="${REBUILT.t("common.rebuilt_home")}">
        ${REBUILT.Brand.lockup("sidebar__lockup")}
        ${REBUILT.Brand.mark("sidebar__mark")}
      </button>
      <nav class="sidebar__nav" aria-label="${REBUILT.t("common.main_navigation")}">${groups}</nav>
      <button type="button" class="sidebar__user" data-nav="profile" id="sidebar-user" data-tip="${REBUILT.t("common.profile")}" aria-label="${REBUILT.t("common.profile")}">
        <span id="sidebar-avatar"></span>
        <span class="sidebar__user-info">
          <span class="sidebar__username" id="sidebar-username">—</span>
          <span class="progress progress--sm" aria-hidden="true"><span class="progress__fill" id="sidebar-xpbar"></span></span>
          <span class="sidebar__level">
            <span>Level <span class="num" id="sidebar-level">1</span></span>
            <span class="sidebar__streak">${I().svg("flame", { size: 14 })}<span class="num" id="sidebar-streak">0</span></span>
          </span>
        </span>
      </button>`;
  }

  function topbarHTML() {
    return `
      <button type="button" class="topbar__brand" data-nav="dashboard" aria-label="${REBUILT.t("common.rebuilt_home")}">${REBUILT.Brand.lockup("topbar__lockup")}</button>
      <div class="topbar__end">
        <span class="pill pill--streak" title="${REBUILT.t("common.streak_days")}">${I().svg("flame", { size: 16 })}<span class="num" id="topbar-streak">0</span></span>
        <span class="pill pill--xp" title="${REBUILT.t("common.level")}">${I().svg("bolt", { size: 16 })}<span class="num" id="topbar-level">1</span></span>
        <button type="button" class="topbar__avatar" data-nav="profile" aria-label="${REBUILT.t("common.profile")}"><span id="topbar-avatar"></span></button>
      </div>`;
  }

  function bottomNavHTML() {
    const tabs = NAV.filter((n) => n.tab);
    return `
      <div class="bottom-nav__inner">
        ${tabs.map((n) => `<button type="button" class="tab-item" data-nav="${n.id}" aria-label="${n.label}">${I().svg(n.icon)}<span>${n.label}</span></button>`).join("")}
        <button type="button" class="tab-item" id="more-btn" aria-label="${REBUILT.t("common.more")}" aria-haspopup="dialog">${I().svg("menu")}<span>${REBUILT.t("common.more")}</span></button>
      </div>`;
  }

  function mount() {
    if (mounted) return;
    const sb = document.getElementById("sidebar");
    const tb = document.getElementById("topbar");
    const bn = document.getElementById("bottom-nav");
    if (!sb || !tb || !bn) return;
    sb.innerHTML = sidebarHTML();
    tb.innerHTML = topbarHTML();
    bn.innerHTML = bottomNavHTML();
    document.getElementById("more-btn").addEventListener("click", toggleMore);
    mounted = true;
  }

  /** Draw the navigation again (a new language or theme changes its words and the logo). */
  function remount() {
    closeMore();
    mounted = false;
    mount();
    if (REBUILT.Router) setActive(REBUILT.Router.getCurrent());
  }

  /** Reflect current state in the chrome (name, avatar initial, level, streak, XP bar). */
  function update(state) {
    if (!mounted) return;
    const info = REBUILT.XP.getLevelInfo(state.xp.total);
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set("sidebar-username", state.user.name || REBUILT.t("common.rebuilt_hero"));
    set("sidebar-level", info.level);
    set("sidebar-streak", state.streak.current);
    set("topbar-level", info.level);
    set("topbar-streak", state.streak.current);
    const bar = document.getElementById("sidebar-xpbar");
    if (bar) bar.style.width = info.progressPct + "%";
    ["sidebar-avatar", "topbar-avatar"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = REBUILT.Brand.avatar(state.user.name, id === "sidebar-avatar" ? "" : "sm");
    });
  }

  /** Mark the active destination in every nav surface. */
  function setActive(page) {
    document.querySelectorAll("#sidebar [data-nav], #bottom-nav [data-nav], .more-sheet [data-nav]").forEach((el) => {
      const on = el.dataset.nav === page;
      el.classList.toggle("is-active", on);
      if (on) el.setAttribute("aria-current", "page");
      else el.removeAttribute("aria-current");
    });
    const more = document.getElementById("more-btn");
    if (more) more.classList.toggle("is-active", MORE_IDS.includes(page));
    closeMore();
  }

  /* ---------- "More" sheet (phones) ---------- */

  function toggleMore() {
    if (document.querySelector(".more-sheet")) closeMore();
    else openMore();
  }

  function openMore() {
    closeMore();
    const current = REBUILT.Router.getCurrent();
    const overlay = document.createElement("div");
    overlay.className = "more-sheet-overlay";
    const sheet = document.createElement("div");
    sheet.className = "more-sheet";
    sheet.setAttribute("role", "dialog");
    sheet.setAttribute("aria-label", REBUILT.t("common.more"));
    sheet.innerHTML = `
      <div class="more-sheet__grab"></div>
      <div class="more-sheet__grid">
        ${MORE_IDS.map((id) => NAV.find((n) => n.id === id)).map((n) => `
          <button type="button" class="more-tile ${n.id === current ? "is-active" : ""}" data-nav="${n.id}">
            ${I().svg(n.icon)}<span>${n.label}</span>${n.badge ? `<span class="badge badge--soon">${n.badge}</span>` : ""}
          </button>`).join("")}
      </div>`;
    document.body.appendChild(overlay);
    document.body.appendChild(sheet);
    requestAnimationFrame(() => { overlay.classList.add("is-visible"); sheet.classList.add("is-visible"); });
    overlay.addEventListener("click", closeMore);
    document.addEventListener("keydown", onMoreKey);
  }

  function onMoreKey(e) {
    if (e.key === "Escape") closeMore();
  }

  function closeMore() {
    document.querySelectorAll(".more-sheet, .more-sheet-overlay").forEach((el) => el.remove());
    document.removeEventListener("keydown", onMoreKey);
  }

  return { NAV, mount, remount, update, setActive, openMore, closeMore };
})();
