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
    { id: "dashboard", label: "الرئيسية", icon: "home", group: "main", tab: true },
    { id: "planner", label: "يومي", icon: "calendar", group: "main" },
    { id: "habits", label: "العادات", icon: "flame", group: "main", tab: true },
    { id: "tasks", label: "المهام", icon: "tasks", group: "main", tab: true },
    { id: "goals", label: "الأهداف", icon: "target", group: "main", tab: true },
    { id: "analytics", label: "الإحصائيات", icon: "chart", group: "insights" },
    { id: "achievements", label: "الإنجازات", icon: "trophy", group: "insights" },
    { id: "ai", label: "REBUILT AI", icon: "sparkles", group: "ai", badge: "قريبًا" },
    { id: "profile", label: "الملف الشخصي", icon: "user", group: "account", sheetOnly: true },
    { id: "settings", label: "الإعدادات", icon: "sliders", group: "account" },
  ];
  const MORE_IDS = ["planner", "analytics", "achievements", "ai", "profile", "settings"];

  const GROUPS = [
    { id: "main", label: "" },
    { id: "insights", label: "تقدّمك" },
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
      <button type="button" class="sidebar__brand" data-nav="dashboard" aria-label="REBUILT — الرئيسية">
        ${REBUILT.Brand.lockup("sidebar__lockup")}
        ${REBUILT.Brand.mark("sidebar__mark")}
      </button>
      <nav class="sidebar__nav" aria-label="التنقل الرئيسي">${groups}</nav>
      <button type="button" class="sidebar__user" data-nav="profile" id="sidebar-user" data-tip="الملف الشخصي" aria-label="الملف الشخصي">
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
      <button type="button" class="topbar__brand" data-nav="dashboard" aria-label="REBUILT — الرئيسية">${REBUILT.Brand.lockup("topbar__lockup")}</button>
      <div class="topbar__end">
        <span class="pill pill--streak" title="أيام الاستمرار">${I().svg("flame", { size: 16 })}<span class="num" id="topbar-streak">0</span></span>
        <span class="pill pill--xp" title="المستوى">${I().svg("bolt", { size: 16 })}<span class="num" id="topbar-level">1</span></span>
        <button type="button" class="topbar__avatar" data-nav="profile" aria-label="الملف الشخصي"><span id="topbar-avatar"></span></button>
      </div>`;
  }

  function bottomNavHTML() {
    const tabs = NAV.filter((n) => n.tab);
    return `
      <div class="bottom-nav__inner">
        ${tabs.map((n) => `<button type="button" class="tab-item" data-nav="${n.id}" aria-label="${n.label}">${I().svg(n.icon)}<span>${n.label}</span></button>`).join("")}
        <button type="button" class="tab-item" id="more-btn" aria-label="المزيد" aria-haspopup="dialog">${I().svg("menu")}<span>المزيد</span></button>
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

  /** Reflect current state in the chrome (name, avatar initial, level, streak, XP bar). */
  function update(state) {
    if (!mounted) return;
    const info = REBUILT.XP.getLevelInfo(state.xp.total);
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set("sidebar-username", state.user.name || "بطل REBUILT");
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
    sheet.setAttribute("aria-label", "المزيد");
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

  return { NAV, mount, update, setActive, openMore, closeMore };
})();
