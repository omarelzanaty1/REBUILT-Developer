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
      "الحساب",
      null,
      `
      <div class="setting-row">
        <div class="setting-row__text">
          <strong>${state.user.email ? `<bdi class="num-ltr">${esc(state.user.email)}</bdi>` : "من غير إيميل"}</strong>
          <span>${connected ? "حساب متصل بسيرفر REBUILT، وبياناتك محفوظة عليه." : "وضع محلي: بياناتك على المتصفح ده بس."}</span>
        </div>
        <span class="badge ${connected ? "badge--success" : "badge--soon"}">${I.svg(connected ? "shield" : "info", { size: 12 })}${connected ? "متصل" : "محلي"}</span>
      </div>
      <div class="settings-actions">
        <button type="button" class="btn btn--secondary" data-nav="profile">${I.svg("user")}الملف الشخصي</button>
        <button type="button" class="btn btn--secondary" id="sign-out-btn">${I.svg("logout")}تسجيل الخروج</button>
      </div>`
    );

    const methods = connected
      ? section(
          "shield",
          "طرق تسجيل الدخول",
          "الطرق اللي تقدر تدخل بيها على نفس الحساب وبنفس بياناتك.",
          `
        <div id="link-notice" aria-live="polite"></div>
        <div id="signin-methods" aria-busy="true"><p class="faint">بنجيب طرق الدخول…</p></div>
        <div class="notice notice--info">${I.svg("info")}<div>ربط Google بيضيف طريقة دخول لحسابك الحالي بنفس عاداتك ومهامك وتقدّمك. مش بيعمل حساب جديد ومش بيدمج حسابات. لو إيميل Google مختلف عن إيميل حسابك، اربطه من هنا الأول بدل ما تدخل بيه من صفحة الدخول، عشان ماتتعملش حسابين.</div></div>`
        )
      : "";

    const security = connected
      ? section(
          "key",
          "تغيير الباسورد",
          "اختار باسورد جديد لحسابك.",
          `
        <form class="form settings-form" id="password-form" novalidate>
          <div id="pw-notice" aria-live="polite"></div>
          ${Components.inputField({ name: "password", type: "password", label: "الباسورد الجديد", hint: `${REBUILT.Auth.MIN_PASSWORD_LENGTH} حروف على الأقل.` })}
          ${Components.inputField({ name: "confirmPassword", type: "password", label: "تأكيد الباسورد الجديد" })}
          <div><button type="submit" class="btn btn--primary" id="pw-submit"><span>حفظ الباسورد</span></button></div>
        </form>`
        )
      : "";

    const appearance = section(
      "sliders",
      "المظهر",
      "REBUILT في الوضع الداكن دايمًا، ده جزء من هوية المنتج.",
      row(
        "تقليل الحركة",
        "بيوقف الأنيميشن والانتقالات.",
        `<label class="switch"><input type="checkbox" id="motion-toggle" ${state.settings.reduceMotion ? "checked" : ""} aria-label="تقليل الحركة" /><span class="switch__track"></span></label>`
      )
    );

    const localButtons = connected
      ? ""
      : `
        <label class="btn btn--secondary" for="import-data-input">${I.svg("upload")}استيراد من ملف</label>
        <input type="file" id="import-data-input" accept="application/json" class="visually-hidden" />
        <button type="button" class="btn btn--secondary" id="load-demo-btn">${I.svg("info")}بيانات تجريبية</button>`;
    const localNote = connected
      ? `<div class="notice notice--info">${I.svg("info")}<div>الاستيراد والبيانات التجريبية والمسح الكامل متاحين في الوضع المحلي بس. حسابك المتصل بيحتفظ ببياناتك على السيرفر، فأي تعديل محلي كان هيتمسح عند أول تحميل.</div></div>`
      : "";

    const data = section(
      "download",
      "بياناتك",
      "صدّر نسخة احتياطية من كل بياناتك.",
      `
      <div class="settings-actions"><button type="button" class="btn btn--secondary" id="export-data-btn">${I.svg("download")}تصدير البيانات</button>${localButtons}</div>
      ${localNote}`
    );

    const danger = connected
      ? ""
      : section(
          "alert",
          "بدء من الصفر",
          "بيمسح كل اللي على الجهاز ده نهائيًا: العادات، المهام، الأهداف، الـXP والتاريخ.",
          `<div class="settings-actions"><button type="button" class="btn btn--danger" id="reset-empty-btn">${I.svg("trash")}مسح كل البيانات</button></div>`,
          "settings-card--danger"
        );

    return `
      ${Components.pageHeader({ title: "الإعدادات" })}
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
      box.innerHTML = `<div class="notice notice--warn">${I.svg("alert")}<div>${esc((res && res.error) || "مقدرناش نجيب طرق الدخول دلوقتي.")}<br/><button type="button" class="btn-link" id="methods-retry">جرّب تاني</button></div></div>`;
      const retry = box.querySelector("#methods-retry");
      if (retry) retry.addEventListener("click", () => loadMethods(container));
      return;
    }
    const email = providerOf(res.identities, "email");
    const google = providerOf(res.identities, "google");
    const emailRow = row(
      "الإيميل والباسورد",
      email ? "تقدر تدخل بإيميلك وباسوردك." : "لسه معملتش باسورد. تقدر تضيف واحد من «تغيير الباسورد» تحت.",
      `<span class="badge ${email ? "badge--success" : "badge--soon"}">${email ? "مفعّل" : "مش مفعّل"}</span>`
    );
    const googleRow = google
      ? row("Google", google.email ? `<bdi class="num-ltr">${esc(google.email)}</bdi>` : "حساب Google مرتبط.", `<span class="badge badge--success">${I.svg("check", { size: 12 })}مرتبط</span>`)
      : row("Google", "لسه مش مربوط. اربطه عشان تدخل بيه على نفس الحساب.", `<button type="button" class="btn btn--secondary" id="link-google-btn">${I.googleG(18)}ربط حساب Google</button>`);
    box.innerHTML = emailRow + googleRow;
    const btn = box.querySelector("#link-google-btn");
    if (btn) btn.addEventListener("click", () => startLink(container, btn));
  }

  async function loadMethods(container) {
    const box = container.querySelector("#signin-methods");
    if (box) { box.setAttribute("aria-busy", "true"); box.innerHTML = `<p class="faint">بنجيب طرق الدخول…</p>`; }
    let res;
    try {
      res = await REBUILT.Auth.getIdentities();
    } catch (err) {
      res = { ok: false, error: REBUILT.Messages.genericError() };
    }
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
          ? `<div class="notice notice--success" role="status">${I.svg("checkCircle")}<div>اتربط حساب Google بحسابك الحالي. بياناتك زي ما هي، وتقدر تدخل بيه من دلوقتي.</div></div>`
          : `<div class="notice notice--danger" role="alert">${I.svg("alert")}<div>${esc(back.error)}</div></div>`;
      }
      loadMethods(container);
    }

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
        REBUILT.Toast.show({ icon: "checkCircle", text: "اتغيّر الباسورد.", tone: "success" });
      });
    }
  }

  return { render, afterRender };
})();
