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
        ${security}
        ${appearance}
        ${data}
        ${danger}
      </div>
    `;
  }

  function afterRender(container, state) {
    const on = (sel, evt, fn) => { const el = container.querySelector(sel); if (el) el.addEventListener(evt, fn); };

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
