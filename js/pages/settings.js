/* ============================================================
   REBUILT — pages/settings.js
   Only settings that actually do something are shown.

   Removed on purpose (they stored a value but nothing used it):
   a "daily reminder" toggle (there is no notification system),
   an AI response-length preference (the assistant isn't live),
   and the emoji avatar picker (avatars are the name's initial).

   Import / demo data / wipe only touch this device's copy. With a
   connected account the server is the source of truth and would
   overwrite them on the next load, so they're hidden there with a
   note instead of pretending to work.
   ============================================================ */

window.REBUILT = window.REBUILT || {};
REBUILT.Pages = REBUILT.Pages || {};

REBUILT.Pages.settings = (function () {
  const { Components, Icons: I } = REBUILT;
  const esc = Components.esc;

  function section(icon, title, sub, inner, cls) {
    return `
      <section class="card settings-card ${cls || ""}">
        <div class="settings-card__head">
          <span class="settings-card__ico">${I.svg(icon)}</span>
          <div><h2 class="card__title">${title}</h2>${sub ? `<p class="card__sub">${sub}</p>` : ""}</div>
        </div>
        ${inner}
      </section>`;
  }

  function row(label, hint, control) {
    return `
      <div class="setting-row">
        <div class="setting-row__text"><strong>${label}</strong>${hint ? `<span>${hint}</span>` : ""}</div>
        <div class="setting-row__control">${control}</div>
      </div>`;
  }

  function render(state) {
    const connected = REBUILT.Auth.isRealAuth();

    const account = section(
      "user",
      REBUILT.t("settings.account"),
      null,
      `
      <div class="setting-row">
        <div class="setting-row__text">
          <strong>${state.user.email ? `<bdi class="num-ltr">${esc(state.user.email)}</bdi>` : REBUILT.t("settings.no_email")}</strong>
          <span>${connected ? REBUILT.t("settings.an_account_connected_to_the") : REBUILT.t("settings.local_mode_your_data_is")}</span>
        </div>
        <span class="badge ${connected ? "badge--success" : "badge--soon"}">${I.svg(connected ? "shield" : "info", { size: 12 })}${connected ? REBUILT.t("settings.connected") : REBUILT.t("settings.local")}</span>
      </div>
      <div class="settings-actions">
        <button type="button" class="btn btn--secondary" data-nav="profile">${REBUILT.t("settings.profile", { p1: I.svg("user") })}</button>
        <button type="button" class="btn btn--secondary" id="sign-out-btn">${REBUILT.t("settings.sign_out", { p1: I.svg("logout") })}</button>
      </div>`
    );

    const methods = connected
      ? section(
          "shield",
          REBUILT.t("settings.sign_in_methods"),
          REBUILT.t("settings.the_ways_you_can_sign"),
          `
        <div id="link-notice" aria-live="polite"></div>
        <div id="signin-methods" aria-busy="true"><p class="faint">${REBUILT.t("settings.loading_your_sign_in_methods")}</p></div>
        <div class="notice notice--info">${I.svg("info")}<div>${REBUILT.t("settings.linking_google_adds_a_sign")}</div></div>`
        )
      : "";

    const security = connected
      ? section(
          "key",
          REBUILT.t("settings.change_password"),
          REBUILT.t("settings.choose_a_new_password_for"),
          `
        <form class="form settings-form" id="password-form" novalidate>
          <div id="pw-notice" aria-live="polite"></div>
          ${Components.inputField({ name: "password", type: "password", label: REBUILT.t("settings.new_password"), hint: REBUILT.t("settings.at_least_characters", { MIN_PASSWORD_LENGTH: REBUILT.Auth.MIN_PASSWORD_LENGTH }) })}
          ${Components.inputField({ name: "confirmPassword", type: "password", label: REBUILT.t("settings.confirm_new_password") })}
          <div><button type="submit" class="btn btn--primary" id="pw-submit"><span>${REBUILT.t("settings.save_password")}</span></button></div>
        </form>`
        )
      : "";

    const langs = REBUILT.I18n.languages().map((l) => ({ id: l.code, label: `<span lang="${l.code}">${esc(l.name)}</span>` }));
    const themes = REBUILT.Theme.PREFS.map((id) => ({ id, label: REBUILT.t("settings.theme_" + id) }));
    const appearance = section(
      "sliders",
      REBUILT.t("settings.appearance_language"),
      REBUILT.t("settings.appearance_sub"),
      row(
        REBUILT.t("settings.language"),
        REBUILT.t("settings.language_hint"),
        Components.segmented("pref-lang", langs, REBUILT.I18n.lang())
      ) + row(
        REBUILT.t("settings.theme"),
        REBUILT.t("settings.theme_hint"),
        Components.segmented("pref-theme", themes, REBUILT.Theme.getPref())
      ) + row(
        REBUILT.t("settings.reduce_motion"),
        REBUILT.t("settings.turns_off_animations_and_transitions"),
        `<label class="switch"><input type="checkbox" id="motion-toggle" ${state.settings.reduceMotion ? "checked" : ""} aria-label="${REBUILT.t("settings.reduce_motion")}" /><span class="switch__track"></span></label>`
      )
    );

    const localButtons = connected
      ? ""
      : `
        <label class="btn btn--secondary" for="import-data-input">${REBUILT.t("settings.import_from_file", { p1: I.svg("upload") })}</label>
        <input type="file" id="import-data-input" accept="application/json" class="visually-hidden" />
        <button type="button" class="btn btn--secondary" id="load-demo-btn">${REBUILT.t("settings.sample_data", { p1: I.svg("info") })}</button>`;
    const localNote = connected
      ? `<div class="notice notice--info">${I.svg("info")}<div>${REBUILT.t("settings.import_sample_data_and_full")}</div></div>`
      : "";

    const data = section(
      "download",
      REBUILT.t("settings.your_data"),
      REBUILT.t("settings.export_a_backup_copy_of"),
      `
      <div class="settings-actions"><button type="button" class="btn btn--secondary" id="export-data-btn">${REBUILT.t("settings.export_data", { p1: I.svg("download") })}</button>${localButtons}</div>
      ${localNote}`
    );

    const danger = connected
      ? ""
      : section(
          "alert",
          REBUILT.t("settings.start_from_scratch"),
          REBUILT.t("settings.permanently_deletes_everything_on_this"),
          `<div class="settings-actions"><button type="button" class="btn btn--danger" id="reset-empty-btn">${REBUILT.t("settings.delete_all_data", { p1: I.svg("trash") })}</button></div>`,
          "settings-card--danger"
        );

    return `
      ${Components.pageHeader({ title: REBUILT.t("settings.settings") })}
      <div class="settings-stack">
        ${account}
        ${methods}
        ${security}
        ${appearance}
        ${data}
        ${danger}
      </div>
    `;
  }

  /** "Sign-in methods": the identities attached to this account, and the way to add Google to it. */
  const providerOf = (list, name) => list.find((i) => i.provider === name);

  function renderMethods(container, res) {
    const box = container.querySelector("#signin-methods");
    if (!box) return;
    box.removeAttribute("aria-busy");
    if (!res || !res.ok) {
      box.innerHTML = `<div class="notice notice--warn">${I.svg("alert")}<div>${esc((res && res.error) || REBUILT.t("settings.we_couldn_t_load_your"))}<br/><button type="button" class="btn-link" id="methods-retry">${REBUILT.t("settings.try_again")}</button></div></div>`;
      const retry = box.querySelector("#methods-retry");
      if (retry) retry.addEventListener("click", () => loadMethods(container));
      return;
    }
    const email = providerOf(res.identities, "email");
    const google = providerOf(res.identities, "google");
    const emailRow = row(
      REBUILT.t("settings.email_and_password"),
      email ? REBUILT.t("settings.you_can_sign_in_with") : REBUILT.t("settings.you_haven_t_set_a"),
      `<span class="badge ${email ? "badge--success" : "badge--soon"}">${email ? REBUILT.t("settings.enabled") : REBUILT.t("settings.not_enabled")}</span>`
    );
    const googleRow = google
      ? row("Google", google.email ? `<bdi class="num-ltr">${esc(google.email)}</bdi>` : REBUILT.t("settings.google_account_linked"), `<span class="badge badge--success">${REBUILT.t("settings.linked", { p1: I.svg("check", { size: 12 }) })}</span>`)
      : row("Google", REBUILT.t("settings.not_linked_yet_link_it"), `<button type="button" class="btn btn--secondary" id="link-google-btn">${REBUILT.t("settings.link_google_account", { p1: I.googleG(18) })}</button>`);
    box.innerHTML = emailRow + googleRow;
    const btn = box.querySelector("#link-google-btn");
    if (btn) btn.addEventListener("click", () => startLink(container, btn));
  }

  /* The last good answer, kept for THIS account only. The page is drawn again when the language or the theme changes: without it the block
     would collapse to "Loading…" and grow back a moment later, and the whole page (the button just pressed included) would jump. */
  let lastMethods = null; // { uid, res }

  async function loadMethods(container, uid) {
    const box = container.querySelector("#signin-methods");
    const known = uid && lastMethods && lastMethods.uid === uid ? lastMethods.res : null;
    if (known) renderMethods(container, known); // same size as before; refreshed just below
    else if (box) { box.setAttribute("aria-busy", "true"); box.innerHTML = `<p class="faint">${REBUILT.t("settings.loading_your_sign_in_methods")}</p>`; }
    let res;
    try {
      res = await REBUILT.Auth.getIdentities();
    } catch (err) {
      res = { ok: false, error: REBUILT.Messages.genericError() };
    }
    if (res && res.ok && uid) lastMethods = { uid, res };
    if (known && res && res.ok && JSON.stringify(known) === JSON.stringify(res)) return; // nothing changed: leave what is on screen alone
    if (known && !(res && res.ok)) return;                                             // keep the good answer rather than swap it for an error
    renderMethods(container, res);
  }

  let linkBusy = false;
  async function startLink(container, btn) {
    if (linkBusy) return; // one trip to Google at a time
    linkBusy = true;
    const notice = container.querySelector("#link-notice");
    if (notice) notice.innerHTML = "";
    btn.disabled = true;
    btn.classList.add("is-loading");
    let res;
    try {
      res = await REBUILT.Auth.linkGoogle();
    } catch (err) {
      res = { ok: false, error: REBUILT.Messages.genericError() };
    }
    if (res.ok) {
      // The browser is leaving for Google; keep the button busy so a second click can't start another trip.
      setTimeout(() => { linkBusy = false; btn.disabled = false; btn.classList.remove("is-loading"); }, 10000);
      return;
    }
    linkBusy = false;
    btn.disabled = false;
    btn.classList.remove("is-loading");
    if (notice) notice.innerHTML = `<div class="notice notice--danger" role="alert">${I.svg("alert")}<div>${esc(res.error)}</div></div>`;
  }

  function afterRender(container, state) {
    const on = (sel, evt, fn) => { const el = container.querySelector(sel); if (el) el.addEventListener(evt, fn); };

    if (container.querySelector("#signin-methods")) {
      const back = REBUILT.OAuthNotice; // how the trip to Google went (set by app.js), shown once
      REBUILT.OAuthNotice = null;
      const slot = container.querySelector("#link-notice");
      if (back && slot) {
        slot.innerHTML = back.ok
          ? `<div class="notice notice--success" role="status">${I.svg("checkCircle")}<div>${REBUILT.t("settings.your_google_account_was_linked")}</div></div>`
          : `<div class="notice notice--danger" role="alert">${I.svg("alert")}<div>${esc(back.error)}</div></div>`;
      }
      loadMethods(container, state && state.user && state.user.id);
    }

    // Language and theme apply at once, on this device. The listeners in app.js redraw the screen.
    Components.bindSegmented(container, "pref-lang", (code) => REBUILT.I18n.setLang(code));
    Components.bindSegmented(container, "pref-theme", (pref, btn) => REBUILT.Theme.setPref(pref, { origin: btn }));

    on("#sign-out-btn", "click", () => REBUILT.Actions.signOut());
    on("#motion-toggle", "change", (e) => REBUILT.Actions.updateSettings({ reduceMotion: e.target.checked }));
    on("#export-data-btn", "click", () => REBUILT.Actions.exportData());
    on("#load-demo-btn", "click", () => REBUILT.Actions.loadDemoData());
    on("#reset-empty-btn", "click", () => REBUILT.Actions.resetToEmpty());
    on("#import-data-input", "change", (e) => {
      const file = e.target.files[0];
      if (file) REBUILT.Actions.importData(file);
      e.target.value = "";
    });

    const form = container.querySelector("#password-form");
    if (form) {
      Components.clearErrorsOnInput(form);
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const fd = new FormData(form);
        const payload = { password: (fd.get("password") || "").toString(), confirmPassword: (fd.get("confirmPassword") || "").toString() };
        const check = REBUILT.Auth.validateNewPassword(payload);
        const notice = container.querySelector("#pw-notice");
        notice.innerHTML = "";
        ["password", "confirmPassword"].forEach((n) => Components.setFieldError(form, n, ""));
        if (!check.valid) {
          const first = check.errors.password ? "password" : "confirmPassword";
          Components.setFieldError(form, first === "password" ? "confirmPassword" : "password", "");
          Components.setFieldError(form, first, check.errors[first]);
          return;
        }
        const btn = container.querySelector("#pw-submit");
        btn.disabled = true;
        btn.classList.add("is-loading");
        let res;
        try {
          res = await REBUILT.Actions.changePassword(payload.password);
        } catch (err) {
          res = { ok: false, error: REBUILT.Messages.genericError() };
        }
        btn.disabled = false;
        btn.classList.remove("is-loading");
        if (!res.ok) {
          notice.innerHTML = `<div class="notice notice--danger" role="alert">${I.svg("alert")}<div>${esc(res.error)}</div></div>`;
          return;
        }
        form.reset();
        REBUILT.Toast.show({ icon: "checkCircle", text: REBUILT.t("settings.password_changed"), tone: "success" });
      });
    }
  }

  return { render, afterRender };
})();
