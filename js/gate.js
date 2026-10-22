/* ============================================================
   REBUILT — gate.js
   Everything before the app itself:

     welcome → auth (sign up / sign in) → [confirm-email] → onboarding
     forgot → forgot-sent                (password recovery, request)
     reset  → reset-done | reset-expired (password recovery, the e-mailed link)

   Runs in #gate-root in front of the app shell and hands control back
   via onComplete() once the user has an account and has finished
   onboarding. Onboarding answers are held in a local draft and only
   committed to state at the very end, so backing out mid-flow never
   half-corrupts real data.

   Field errors are applied in place (no re-render), so nothing the
   user typed — including passwords — is ever lost to a validation error.
   ============================================================ */

window.REBUILT = window.REBUILT || {};

REBUILT.Gate = (function () {
  const I = () => REBUILT.Icons;
  const esc = (s) => REBUILT.Components.esc(s);

  const ONBOARD_STEPS = ["onboard-basic", "onboard-life", "onboard-skills", "onboard-hobbies", "onboard-goals", "onboard-challenges", "onboard-summary"];
  const TAG_STEPS = {
    "onboard-skills": {
      icon: "sparkles",
      title: "إيه مهاراتك؟",
      sub: "اختار اللي يناسبك، وتقدر تضيف غيرها. كله اختياري.",
      presets: () => REBUILT.Data.PRESET_SKILLS,
      key: "skills",
      addPlaceholder: "ضيف مهارة تانية",
    },
    "onboard-hobbies": {
      icon: "heart",
      title: "بتحب تعمل إيه في وقتك؟",
      sub: "اختار حاجة أو أكتر. كله اختياري.",
      presets: () => REBUILT.Data.PRESET_HOBBIES,
      key: "hobbies",
      addPlaceholder: "ضيف اهتمام تاني",
    },
    "onboard-goals": {
      icon: "target",
      title: "إيه أهم حاجة عايز تحققها الفترة الجاية؟",
      sub: "كل اختيار هيبقى هدف في REBUILT، وتقدر تقسّمه لخطوات وتتابع تقدّمه.",
      presets: () => REBUILT.Data.PRESET_GOALS,
      key: "goals",
      addPlaceholder: "ضيف هدفك الخاص",
    },
  };
  const COOLDOWN_SECONDS = 30;

  let state, onComplete, ctx, step, authMode, draft, form, cooldownTimer;

  /* ---------------- Entry ---------------- */

  function start(_state, _onComplete, _ctx) {
    state = _state;
    onComplete = _onComplete;
    ctx = _ctx || {};
    authMode = "signup";
    form = { name: "", email: state.user.email || "" };
    resetDraft();

    // 1) A password-recovery visit always wins: the recovery link creates a session,
    //    and without this check the user would simply land inside the app.
    const recovery = REBUILT.Auth.getRecovery();
    if (recovery.status === "error") {
      step = "reset-expired";
    } else if (recovery.status === "ready" && REBUILT.Auth.isRealAuth()) {
      step = "reset";
    } else if (!state.meta.hasLocalAccount) {
      step = "welcome";
    } else if (!state.meta.isOnboarded) {
      step = "onboard-basic";
    } else {
      return finishGate();
    }

    setAppHidden(true);
    render();
  }

  function resetDraft() {
    draft = {
      name: state.user.name || "",
      occupation: state.userProfile.occupation || "",
      occupationCustom: state.userProfile.occupationCustom || "",
      lifeDescription: state.userProfile.lifeDescription || "",
      skills: (state.userProfile.skills || []).slice(),
      hobbies: (state.userProfile.hobbies || []).slice(),
      goals: REBUILT.Goals.titlesFor(state.goals || []),
      challenges: state.userProfile.challenges || "",
    };
  }

  const root = () => document.getElementById("gate-root");
  const qs = (sel) => root().querySelector(sel);
  const qsa = (sel) => Array.prototype.slice.call(root().querySelectorAll(sel));

  function setAppHidden(hidden) {
    const app = document.getElementById("app");
    if (app) app.hidden = hidden;
    const g = root();
    g.hidden = !hidden;
    document.body.classList.toggle("is-gate", hidden);
  }

  function finishGate() {
    clearInterval(cooldownTimer);
    const g = root();
    g.innerHTML = "";
    setAppHidden(false);
    onComplete();
  }

  /** After any successful sign-in / sign-up / password reset: take the server copy, then route. */
  async function continueAfterAuth() {
    if (ctx.reload) state = await ctx.reload();
    resetDraft();
    form.name = state.user.name || form.name;
    if (state.meta.isOnboarded) return finishGate();
    step = "onboard-basic";
    render();
  }

  /* ---------------- Rendering ---------------- */

  function render() {
    clearInterval(cooldownTimer);
    const g = root();
    g.hidden = false;
    g.innerHTML = stepHTML();
    g.scrollTop = 0;
    window.scrollTo(0, 0);
    bindStep();
    const first = qs("[data-autofocus]");
    if (first && !window.matchMedia("(pointer: coarse)").matches) first.focus({ preventScroll: true });
  }

  function stepHTML() {
    switch (step) {
      case "welcome": return welcomeHTML();
      case "auth": return authHTML();
      case "confirm-email": return confirmEmailHTML();
      case "forgot": return forgotHTML();
      case "forgot-sent": return forgotSentHTML();
      case "reset": return resetHTML();
      case "reset-done": return resetDoneHTML();
      case "reset-expired": return resetExpiredHTML();
      case "onboard-basic": return basicHTML();
      case "onboard-life": return lifeHTML();
      case "onboard-challenges": return challengesHTML();
      case "onboard-summary": return summaryHTML();
      default:
        if (TAG_STEPS[step]) return tagStepHTML(TAG_STEPS[step]);
        return welcomeHTML();
    }
  }

  /* ---------- Shared layout ---------- */

  const BENEFITS = [
    ["flame", "عادات يومية", "كل يوم تلتزم فيه بيزوّد سلسلتك."],
    ["tasks", "مهام منظّمة", "أولوية وموعد لكل مهمة، وXP على كل إنجاز."],
    ["target", "أهداف بخطوات", "قسّم هدفك وتابع تقدّمك بالنسبة المئوية."],
    ["trophy", "مستويات وإنجازات", "تقدّمك الحقيقي بيتحوّل لمستويات تشوفها."],
  ];

  /** Two-pane frame used by every auth / recovery / onboarding step. */
  function frame(inner, opts) {
    opts = opts || {};
    const back = opts.back
      ? `<button type="button" class="btn btn--ghost btn--sm gate__back" data-go="${opts.back}">${I().svg("arrowRight")}${opts.backLabel || "رجوع"}</button>`
      : "<span></span>";
    return `
      <div class="gate">
        <aside class="gate__aside" aria-hidden="${opts.asideHidden === false ? "false" : "true"}">
          ${REBUILT.Brand.lockup("gate__lockup")}
          <div class="gate__pitch">
            <p class="gate__tag" dir="ltr">Plan. Do. Improve. Repeat.</p>
            <h2 class="gate__headline">ابنِ نفسك،<br/>خطوة ورا خطوة.</h2>
            <ul class="gate__benefits">
              ${BENEFITS.map((b) => `<li><span class="gate__benefit-ico">${I().svg(b[0])}</span><span><strong>${b[1]}</strong><small>${b[2]}</small></span></li>`).join("")}
            </ul>
          </div>
          ${REBUILT.Brand.stair("gate__stair")}
        </aside>
        <main class="gate__main" id="gate-main">
          <div class="gate__top">
            ${back}
            ${REBUILT.Brand.lockup("gate__lockup-sm")}
          </div>
          <div class="gate__card ${opts.cls || ""}">${inner}</div>
        </main>
      </div>`;
  }

  function modeNotice() {
    if (REBUILT.Auth.isRealAuth()) return "";
    const reason = REBUILT.SupabaseClient && REBUILT.SupabaseClient.getError && REBUILT.SupabaseClient.getError();
    return `
      <div class="notice notice--warn" role="note">
        ${I().svg("info")}
        <div>وضع محلي: مفيش اتصال بسيرفر REBUILT دلوقتي، فبياناتك بتتخزن على المتصفح ده بس.${reason ? `<br/><span class="faint">السبب: ${esc(reason)}</span>` : ""}</div>
      </div>`;
  }

  /** A labelled input. Errors are filled in later by setFieldError(). */
  function field(o) {
    const id = "f-" + o.name;
    const isPw = o.type === "password";
    const input = `<input class="field__input ${o.ltr ? "field__input--ltr" : ""}" id="${id}" name="${o.name}" type="${o.type || "text"}"
        value="${esc(o.value || "")}" ${o.autocomplete ? `autocomplete="${o.autocomplete}"` : ""} ${o.placeholder ? `placeholder="${esc(o.placeholder)}"` : ""}
        ${o.ltr ? 'dir="ltr"' : ""} ${o.inputmode ? `inputmode="${o.inputmode}"` : ""} ${o.maxlength ? `maxlength="${o.maxlength}"` : ""}
        ${o.autofocus ? "data-autofocus" : ""} aria-describedby="${id}-err${o.hint ? " " + id + "-hint" : ""}" autocapitalize="${o.type === "email" || o.type === "password" ? "none" : "sentences"}" spellcheck="false" />`;
    return `
      <div class="field" data-field="${o.name}">
        <label class="field__label" for="${id}">${o.label}${o.optional ? `<span class="optional">اختياري</span>` : ""}</label>
        ${isPw
          ? `<div class="input-affix">${input}<button type="button" class="input-affix__btn" data-toggle-pw="${id}" aria-label="إظهار الباسورد" aria-pressed="false">${I().svg("eye")}</button></div>`
          : input}
        ${o.hint ? `<span class="field__hint" id="${id}-hint">${o.hint}</span>` : ""}
        <span class="field__error" id="${id}-err" role="alert">${I().svg("alert", { size: 14 })}<span data-err-text></span></span>
      </div>`;
  }

  const strengthMeter = () => `
    <div class="strength" data-strength="0" aria-live="polite">
      <span class="strength__bars"><i></i><i></i><i></i></span>
      <span class="strength__label" data-strength-label></span>
    </div>`;

  const noticeSlot = () => `<div id="gate-notice" aria-live="polite"></div>`;

  function setFieldError(name, message) {
    const f = qs(`[data-field="${name}"]`);
    if (!f) return;
    f.classList.toggle("is-invalid", !!message);
    const t = f.querySelector("[data-err-text]");
    if (t) t.textContent = message || "";
    const input = f.querySelector("input,textarea");
    if (input) input.setAttribute("aria-invalid", message ? "true" : "false");
  }

  function applyErrors(errors) {
    ["name", "email", "password", "confirmPassword"].forEach((n) => setFieldError(n, errors[n] || ""));
    const firstBad = qs(".field.is-invalid input");
    if (firstBad) firstBad.focus();
  }

  function showNotice(kind, html, extra) {
    const slot = qs("#gate-notice");
    if (!slot) return;
    slot.innerHTML = html
      ? `<div class="notice notice--${kind}" role="${kind === "danger" ? "alert" : "status"}">${I().svg(kind === "success" ? "checkCircle" : kind === "danger" ? "alert" : "info")}<div>${html}${extra || ""}</div></div>`
      : "";
  }

  function setLoading(btn, on) {
    if (!btn) return;
    btn.disabled = on;
    btn.classList.toggle("is-loading", on);
    if (on) btn.setAttribute("aria-busy", "true");
    else btn.removeAttribute("aria-busy");
  }

  /* ---------- Welcome / landing ---------- */

  function welcomeHTML() {
    const features = [
      ["flame", "عادات", "ابنِ روتين يومي وشوف سلسلة أيامك بتكبر."],
      ["tasks", "مهام", "رتّب شغلك بالأولوية والموعد، وخلّص بدون لخبطة."],
      ["target", "أهداف", "قسّم هدفك الكبير لخطوات وتابع نسبة إنجازه."],
      ["chart", "تقدّمك", "إحصائيات حقيقية من نشاطك، ومستويات وإنجازات."],
    ];
    return `
      <div class="landing">
        <header class="landing__bar">
          ${REBUILT.Brand.lockup("landing__logo")}
          <button type="button" class="btn btn--secondary btn--sm" data-go="signin">تسجيل الدخول</button>
        </header>

        <section class="landing__hero">
          <div class="landing__copy">
            <p class="landing__tag" dir="ltr">Plan. Do. Improve. Repeat.</p>
            <h1 class="landing__title">ابنِ نفسك،<br/><span class="grad-text">يوم ورا يوم.</span></h1>
            <p class="landing__lead">REBUILT بتجمع عاداتك ومهامك وأهدافك في مكان واحد، وبتحوّل كل خطوة لتقدّم تشوفه: XP ومستويات وسلاسل أيام.</p>
            <div class="landing__cta">
              <button type="button" class="btn btn--primary btn--lg" data-go="signup" data-autofocus>ابدأ دلوقتي ${I().svg("arrowLeft")}</button>
              <button type="button" class="btn btn--secondary btn--lg" data-go="signin">عندي حساب</button>
            </div>
            ${REBUILT.Auth.isRealAuth() ? "" : `<div class="landing__mode">${modeNotice()}</div>`}
          </div>

          <div class="landing__visual" aria-hidden="true">
            ${REBUILT.Brand.stair("landing__stair")}
            <div class="lv-card lv-card--habit">
              <span class="lv-card__ico">${I().svg("book")}</span>
              <span class="lv-card__text"><strong>قراءة 20 دقيقة</strong><small>عادة يومية</small></span>
              <span class="lv-card__check">${I().svg("check", { size: 14, stroke: 2.8 })}</span>
            </div>
            <div class="lv-card lv-card--goal">
              <span class="lv-card__text"><strong>هدف: 12 كتاب</strong>
                <span class="progress progress--sm"><span class="progress__fill" style="width:58%"></span></span>
              </span>
            </div>
            <div class="lv-card lv-card--streak">
              <span class="lv-card__ico lv-card__ico--hot">${I().svg("flame")}</span>
              <span class="lv-card__text"><strong>سلسلة أيام</strong><small>كمّل ومتقطعهاش</small></span>
            </div>
          </div>
        </section>

        <section class="landing__features" aria-label="مميزات REBUILT">
          ${features.map((f) => `
            <article class="feature">
              <span class="feature__ico">${I().svg(f[0], { size: 22 })}</span>
              <h3>${f[1]}</h3>
              <p>${f[2]}</p>
            </article>`).join("")}
        </section>

        <footer class="landing__foot">
          <span class="num">REBUILT</span><span dir="ltr">Build yourself.</span>
        </footer>
      </div>`;
  }

  /* ---------- Auth ---------- */

  function authHTML() {
    const isSignup = authMode === "signup";
    return frame(`
      <div class="segmented gate__tabs" role="tablist" aria-label="نوع الدخول">
        <button type="button" role="tab" class="segmented__btn ${isSignup ? "is-selected" : ""}" aria-selected="${isSignup}" data-authmode="signup">إنشاء حساب</button>
        <button type="button" role="tab" class="segmented__btn ${!isSignup ? "is-selected" : ""}" aria-selected="${!isSignup}" data-authmode="signin">تسجيل الدخول</button>
      </div>

      <h1 class="gate__title">${isSignup ? "ابدأ رحلتك مع REBUILT" : "أهلاً بيك تاني"}</h1>
      <p class="gate__sub">${isSignup ? "حساب واحد وبياناتك معاك في أي مكان." : "سجّل دخولك وكمّل من حيث وقفت."}</p>

      <form class="gate__form" id="auth-form" novalidate>
        ${noticeSlot()}
        ${isSignup ? field({ name: "name", label: "الاسم", autocomplete: "name", value: form.name, autofocus: true, maxlength: 40 }) : ""}
        ${field({ name: "email", type: "email", label: "الإيميل", autocomplete: "email", value: form.email, ltr: true, inputmode: "email", autofocus: !isSignup })}
        ${field({ name: "password", type: "password", label: "الباسورد", autocomplete: isSignup ? "new-password" : "current-password", hint: isSignup ? "6 حروف على الأقل. كل ما كان أطول كان أأمن." : "" })}
        ${isSignup ? strengthMeter() : ""}
        ${isSignup ? field({ name: "confirmPassword", type: "password", label: "تأكيد الباسورد", autocomplete: "new-password" }) : ""}
        ${!isSignup ? `<div class="gate__row"><button type="button" class="btn-link" data-go="forgot">نسيت الباسورد؟</button></div>` : ""}
        <button type="submit" class="btn btn--primary btn--lg btn--block" id="auth-submit"><span>${isSignup ? "إنشاء الحساب" : "دخول"}</span></button>
        ${REBUILT.Auth.isRealAuth()
          ? `<p class="gate__fine">${I().svg("shield", { size: 15 })}<span>${isSignup ? "حسابك محفوظ على سيرفر REBUILT، وهتوصلك رسالة تأكيد على إيميلك." : "اتصالك بالسيرفر مؤمّن، وبياناتك ليك بس."}</span></p>`
          : modeNotice()}
      </form>

      <p class="gate__switch">${isSignup
        ? `عندك حساب؟ <button type="button" class="btn-link" data-authmode="signin">سجّل دخولك</button>`
        : `لسه معندكش حساب؟ <button type="button" class="btn-link" data-authmode="signup">ابدأ دلوقتي</button>`}</p>
    `, { back: "welcome" });
  }

  function confirmEmailHTML() {
    return frame(`
      <div class="gate__state">
        <span class="gate__state-ico">${I().svg("mail", { size: 30 })}</span>
        <h1 class="gate__title">بص في إيميلك</h1>
        <p class="gate__sub">بعتنا رسالة تأكيد على <bdi class="num-ltr">${esc(form.email)}</bdi>. افتحها واضغط على اللينك، وبعدها ارجع هنا وسجّل دخول.</p>
        <p class="gate__fine gate__fine--center">لو مالقتهاش، بص في الـ Spam أو الـ Promotions.</p>
        <button type="button" class="btn btn--primary btn--lg btn--block" data-go="signin-after-confirm">أكدت، يلا ندخل</button>
        <button type="button" class="btn btn--ghost btn--block" data-go="signup">استخدم إيميل تاني</button>
      </div>
    `);
  }

  /* ---------- Password recovery ---------- */

  function forgotHTML() {
    if (!REBUILT.Auth.isRealAuth()) {
      return frame(`
        <div class="gate__state">
          <span class="gate__state-ico gate__state-ico--warn">${I().svg("key", { size: 28 })}</span>
          <h1 class="gate__title">استعادة الباسورد</h1>
          <p class="gate__sub">استعادة الباسورد بتتم برسالة على الإيميل من سيرفر REBUILT، والسيرفر مش متاح دلوقتي. في الوضع المحلي مفيش باسورد على سيرفر أصلًا، فمفيش حاجة تتبعت.</p>
          ${modeNotice()}
          <button type="button" class="btn btn--primary btn--lg btn--block" data-go="signin">رجوع لتسجيل الدخول</button>
        </div>
      `, { back: "signin" });
    }
    return frame(`
      <span class="gate__state-ico gate__state-ico--left">${I().svg("key", { size: 26 })}</span>
      <h1 class="gate__title">نسيت الباسورد؟</h1>
      <p class="gate__sub">اكتب إيميلك وهنبعتلك لينك تحط بيه باسورد جديد.</p>
      <form class="gate__form" id="forgot-form" novalidate>
        ${noticeSlot()}
        ${field({ name: "email", type: "email", label: "الإيميل", autocomplete: "email", value: form.email, ltr: true, inputmode: "email", autofocus: true })}
        <button type="submit" class="btn btn--primary btn--lg btn--block" id="forgot-submit"><span>ابعتلي اللينك</span></button>
      </form>
    `, { back: "signin", backLabel: "رجوع لتسجيل الدخول" });
  }

  function forgotSentHTML() {
    return frame(`
      <div class="gate__state">
        <span class="gate__state-ico">${I().svg("mail", { size: 30 })}</span>
        <h1 class="gate__title">اتبعت اللينك</h1>
        <p class="gate__sub">لو <bdi class="num-ltr">${esc(form.email)}</bdi> مسجّل عندنا، هتوصلك رسالة فيها لينك لتغيير الباسورد خلال دقايق.</p>
        <ul class="gate__tips">
          <li>${I().svg("check", { size: 15, stroke: 2.4 })}بص في الـ Spam أو الـ Promotions.</li>
          <li>${I().svg("check", { size: 15, stroke: 2.4 })}اللينك صالح لفترة قصيرة وبيتستخدم مرة واحدة.</li>
        </ul>
        ${noticeSlot()}
        <button type="button" class="btn btn--secondary btn--block" id="resend-btn" disabled>ابعت تاني <span class="num" data-cooldown></span></button>
        <button type="button" class="btn btn--primary btn--lg btn--block" data-go="signin">رجوع لتسجيل الدخول</button>
      </div>
    `);
  }

  function resetHTML() {
    return frame(`
      <span class="gate__state-ico gate__state-ico--left">${I().svg("lock", { size: 26 })}</span>
      <h1 class="gate__title">باسورد جديد</h1>
      <p class="gate__sub">اختار باسورد جديد لحسابك.</p>
      <form class="gate__form" id="reset-form" novalidate>
        ${noticeSlot()}
        ${field({ name: "password", type: "password", label: "الباسورد الجديد", autocomplete: "new-password", autofocus: true, hint: "6 حروف على الأقل." })}
        ${strengthMeter()}
        ${field({ name: "confirmPassword", type: "password", label: "تأكيد الباسورد الجديد", autocomplete: "new-password" })}
        <button type="submit" class="btn btn--primary btn--lg btn--block" id="reset-submit"><span>حفظ الباسورد</span></button>
      </form>
    `);
  }

  function resetDoneHTML() {
    return frame(`
      <div class="gate__state">
        <span class="gate__state-ico gate__state-ico--ok">${I().svg("checkCircle", { size: 32 })}</span>
        <h1 class="gate__title">اتغيّر الباسورد</h1>
        <p class="gate__sub">تمام. باسوردك الجديد اشتغل وإنت دلوقتي داخل حسابك.</p>
        <button type="button" class="btn btn--primary btn--lg btn--block" data-go="continue" data-autofocus>كمّل لـ REBUILT</button>
      </div>
    `);
  }

  function resetExpiredHTML() {
    return frame(`
      <div class="gate__state">
        <span class="gate__state-ico gate__state-ico--warn">${I().svg("alert", { size: 30 })}</span>
        <h1 class="gate__title">اللينك مش شغال</h1>
        <p class="gate__sub">اللينك ده انتهت صلاحيته أو اتستخدم قبل كده. اطلب لينك جديد وهيوصلك في ثواني.</p>
        <button type="button" class="btn btn--primary btn--lg btn--block" data-go="forgot" data-autofocus>اطلب لينك جديد</button>
        <button type="button" class="btn btn--ghost btn--block" data-go="signin">رجوع لتسجيل الدخول</button>
      </div>
    `);
  }

  /* ---------- Onboarding ---------- */

  function onboardFrame(inner, opts) {
    opts = opts || {};
    const idx = ONBOARD_STEPS.indexOf(step);
    const total = ONBOARD_STEPS.length;
    const pct = Math.round(((idx + 1) / total) * 100);
    const back = idx > 0 ? `<button type="button" class="btn btn--secondary" data-go="back">${I().svg("arrowRight")}رجوع</button>` : "<span></span>";
    const next = opts.hideNext ? "" : `<button type="button" class="btn btn--primary" data-go="next">${opts.nextLabel || "التالي"} ${I().svg("arrowLeft")}</button>`;
    return frame(`
      <div class="wizard-head">
        <span class="wizard-head__count">الخطوة <span class="num">${idx + 1}</span> من <span class="num">${total}</span></span>
        <div class="progress progress--sm" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-label="تقدّم الإعداد"><span class="progress__fill" style="width:${pct}%"></span></div>
      </div>
      ${inner}
      <div class="wizard-nav">${back}${next}</div>
    `, { cls: "gate__card--wizard", asideHidden: true });
  }

  function basicHTML() {
    return onboardFrame(`
      <h1 class="gate__title">نعرفك أكتر</h1>
      <p class="gate__sub">دول بيساعدوا REBUILT يبقى مناسب ليك.</p>
      <div class="gate__form">
        ${field({ name: "name", label: "اسمك", autocomplete: "name", value: draft.name, autofocus: true, maxlength: 40 })}
        <div class="field">
          <span class="field__label" id="occ-label">بتعمل إيه في حياتك؟<span class="optional">اختياري</span></span>
          <div class="chip-row" id="occupation-picker" role="radiogroup" aria-labelledby="occ-label">
            ${REBUILT.Data.OCCUPATIONS.map((o) => `<button type="button" role="radio" aria-checked="${draft.occupation === o.id}" class="chip ${draft.occupation === o.id ? "is-selected" : ""}" data-occ="${o.id}">${o.label}</button>`).join("")}
          </div>
        </div>
        ${field({ name: "occupationCustom", label: "حدّد أكتر", value: draft.occupationCustom, optional: true, placeholder: "مثلاً: مصمم جرافيك" , maxlength: 60 })}
      </div>
    `);
  }

  function lifeHTML() {
    return onboardFrame(`
      <h1 class="gate__title">احكيلنا شوية عن حياتك</h1>
      <p class="gate__sub">أيامك عادةً بتكون إزاي؟ اختياري.</p>
      <div class="field">
        <label class="field__label visually-hidden" for="life-desc">وصف حياتك</label>
        <textarea class="field__input" id="life-desc" rows="5" maxlength="600" data-autofocus placeholder="مثلاً: طالب وبشتغل بعد الجامعة وبتعلم برمجة...">${esc(draft.lifeDescription)}</textarea>
      </div>
    `);
  }

  function tagStepHTML(cfg) {
    const presets = cfg.presets();
    const selected = draft[cfg.key];
    const extras = selected.filter((s) => !presets.includes(s));
    return onboardFrame(`
      <h1 class="gate__title">${cfg.title}</h1>
      <p class="gate__sub">${cfg.sub}</p>
      <div class="chip-row" id="tag-picker">
        ${presets.concat(extras).map((p) => `<button type="button" class="chip ${selected.includes(p) ? "is-selected" : ""}" aria-pressed="${selected.includes(p)}" data-tag="${esc(p)}">${esc(p)}</button>`).join("")}
      </div>
      <div class="gate__add">
        <input class="field__input" id="tag-custom-input" type="text" maxlength="60" placeholder="${cfg.addPlaceholder}" aria-label="${cfg.addPlaceholder}" />
        <button type="button" class="btn btn--secondary" id="tag-custom-add" aria-label="إضافة">${I().svg("plus")}</button>
      </div>
    `);
  }

  function challengesHTML() {
    return onboardFrame(`
      <h1 class="gate__title">إيه أكتر حاجة بتصعّب عليك تنظم حياتك؟</h1>
      <p class="gate__sub">اكتب بصراحة، اختياري. ده بيخلّي REBUILT يفهمك أكتر.</p>
      <div class="field">
        <label class="field__label visually-hidden" for="challenges">التحديات</label>
        <textarea class="field__input" id="challenges" rows="5" maxlength="600" data-autofocus placeholder="مثلاً: بابدأ حاجات كتير وما بكملهاش...">${esc(draft.challenges)}</textarea>
      </div>
    `);
  }

  function summaryHTML() {
    const row = (icon, label, list) => `
      <li><span class="summary__ico">${I().svg(icon)}</span><span><strong>${label}</strong>${list.length ? `<span class="summary__chips">${list.map((x) => `<span class="badge">${esc(x)}</span>`).join("")}</span>` : `<span class="faint">لسه مفيش</span>`}</span></li>`;
    return onboardFrame(`
      <span class="gate__state-ico gate__state-ico--left gate__state-ico--ok">${I().svg("checkCircle", { size: 28 })}</span>
      <h1 class="gate__title">جاهزين يا ${esc((draft.name || "بطل").trim().split(/\s+/)[0])}</h1>
      <p class="gate__sub">دي ملخص إجاباتك. تقدر تعدّل أي حاجة منهم بعدين من الملف الشخصي.</p>
      <ul class="summary">
        ${row("target", "أهدافك", draft.goals)}
        ${row("sparkles", "مهاراتك", draft.skills)}
        ${row("heart", "اهتماماتك", draft.hobbies)}
      </ul>
      <button type="button" class="btn btn--primary btn--lg btn--block" id="gate-finish" data-autofocus>يلا نبني يومك</button>
    `, { hideNext: true });
  }

  /* ---------------- Binding ---------------- */

  function bindStep() {
    qsa("[data-go]").forEach((btn) => btn.addEventListener("click", () => go(btn.dataset.go)));

    qsa("[data-toggle-pw]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const input = document.getElementById(btn.dataset.togglePw);
        if (!input) return;
        const show = input.type === "password";
        input.type = show ? "text" : "password";
        btn.setAttribute("aria-pressed", String(show));
        btn.setAttribute("aria-label", show ? "إخفاء الباسورد" : "إظهار الباسورد");
        btn.innerHTML = I().svg(show ? "eyeOff" : "eye");
        input.focus();
      });
    });

    // Clear a field's error as soon as the user edits it.
    qsa(".field input, .field textarea").forEach((el) => {
      el.addEventListener("input", () => {
        const f = el.closest(".field");
        if (f && f.classList.contains("is-invalid")) setFieldError(f.dataset.field, "");
      });
    });

    const pw = qs("#f-password");
    if (pw && qs("[data-strength]")) pw.addEventListener("input", () => updateStrength(pw.value));

    if (step === "auth") bindAuth();
    if (step === "forgot") bindForgot();
    if (step === "forgot-sent") bindForgotSent();
    if (step === "reset") bindReset();
    if (step === "onboard-basic") bindBasic();
    if (TAG_STEPS[step]) bindTags(TAG_STEPS[step]);
    if (step === "onboard-summary") qs("#gate-finish").addEventListener("click", commitOnboarding);

    // Enter in a single-line onboarding input moves forward.
    if (ONBOARD_STEPS.includes(step) && step !== "onboard-summary") {
      qsa(".wizard-head ~ .gate__form input[type=text], .wizard-head ~ .gate__form input:not([type])").forEach((el) =>
        el.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); go("next"); } })
      );
    }
  }

  function updateStrength(value) {
    const meter = qs("[data-strength]");
    if (!meter) return;
    const score = REBUILT.Auth.passwordStrength(value);
    meter.dataset.strength = String(score);
    const label = qs("[data-strength-label]");
    if (label) label.textContent = ["", "ضعيف", "كويس", "قوي"][score] || "";
  }

  function go(target) {
    // Leaving the "expired link" screen for anywhere else drops the stale recovery marker.
    if (step === "reset-expired" && target !== "forgot") REBUILT.Auth.clearRecovery();
    switch (target) {
      case "welcome": step = "welcome"; return render();
      case "signup": authMode = "signup"; step = "auth"; return render();
      case "signin": authMode = "signin"; step = "auth"; return render();
      case "signin-after-confirm": authMode = "signin"; step = "auth"; return render();
      case "forgot":
        if (REBUILT.Auth.getRecovery().status === "error") REBUILT.Auth.clearRecovery();
        step = "forgot";
        return render();
      case "continue": return continueAfterAuth();
      case "next": return handleNext();
      case "back": return prevOnboardStep();
      default: return;
    }
  }

  /* ---------- Auth form ---------- */

  function bindAuth() {
    qsa("[data-authmode]").forEach((btn) => {
      btn.addEventListener("click", () => {
        captureFormValues();
        authMode = btn.dataset.authmode;
        render();
      });
    });

    qs("#auth-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const payload = {
        name: (fd.get("name") || "").toString(),
        email: (fd.get("email") || "").toString().trim(),
        password: (fd.get("password") || "").toString(),
        confirmPassword: (fd.get("confirmPassword") || "").toString(),
      };
      form.name = payload.name || form.name;
      form.email = payload.email;

      const isSignup = authMode === "signup";
      const check = isSignup ? REBUILT.Auth.validateSignUp(payload) : REBUILT.Auth.validateSignIn(payload);
      showNotice("", "");
      applyErrors(check.errors);
      if (!check.valid) return;

      const submitBtn = qs("#auth-submit");
      setLoading(submitBtn, true);

      let result;
      try {
        result = isSignup ? await REBUILT.Auth.signUp(state, payload) : await REBUILT.Auth.signIn(state, payload);
      } catch (err) {
        result = { ok: false, error: "حصلت مشكلة صغيرة، جرّب تاني." };
      }
      setLoading(submitBtn, false);

      if (!result.ok) {
        showNotice("danger", esc(result.error));
        return;
      }

      // Email confirmation is enabled: there's no session yet, so park them on the
      // "check your inbox" screen instead of letting them in.
      if (result.needsEmailConfirmation) {
        REBUILT.Storage.save(state);
        step = "confirm-email";
        return render();
      }

      REBUILT.Storage.save(state);
      await continueAfterAuth();
    });
  }

  function captureFormValues() {
    const name = qs("#f-name");
    const email = qs("#f-email");
    if (name) form.name = name.value;
    if (email) form.email = email.value;
  }

  /* ---------- Forgot / reset ---------- */

  function bindForgot() {
    const f = qs("#forgot-form");
    if (!f) return;
    f.addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = (new FormData(e.target).get("email") || "").toString().trim();
      form.email = email;
      const check = REBUILT.Auth.validateEmailOnly({ email });
      showNotice("", "");
      applyErrors(check.errors);
      if (!check.valid) return;
      const btn = qs("#forgot-submit");
      setLoading(btn, true);
      let res;
      try {
        res = await REBUILT.Auth.requestPasswordReset(email);
      } catch (err) {
        res = { ok: false, error: "حصلت مشكلة صغيرة، جرّب تاني." };
      }
      setLoading(btn, false);
      if (!res.ok) return showNotice("danger", esc(res.error));
      step = "forgot-sent";
      render();
    });
  }

  function bindForgotSent() {
    const btn = qs("#resend-btn");
    const label = qs("[data-cooldown]");
    let left = COOLDOWN_SECONDS;
    const tick = () => {
      if (!btn.isConnected) return clearInterval(cooldownTimer);
      if (left > 0) {
        label.textContent = `(${left})`;
        btn.disabled = true;
        left -= 1;
      } else {
        label.textContent = "";
        btn.disabled = false;
        clearInterval(cooldownTimer);
      }
    };
    tick();
    cooldownTimer = setInterval(tick, 1000);

    btn.addEventListener("click", async () => {
      setLoading(btn, true);
      let res;
      try {
        res = await REBUILT.Auth.requestPasswordReset(form.email);
      } catch (err) {
        res = { ok: false, error: "حصلت مشكلة صغيرة، جرّب تاني." };
      }
      setLoading(btn, false);
      if (!res.ok) return showNotice("danger", esc(res.error));
      showNotice("success", "بعتناه تاني.");
      left = COOLDOWN_SECONDS;
      clearInterval(cooldownTimer);
      tick();
      cooldownTimer = setInterval(tick, 1000);
    });
  }

  function bindReset() {
    qs("#reset-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const payload = { password: (fd.get("password") || "").toString(), confirmPassword: (fd.get("confirmPassword") || "").toString() };
      const check = REBUILT.Auth.validateNewPassword(payload);
      showNotice("", "");
      applyErrors(check.errors);
      if (!check.valid) return;

      const btn = qs("#reset-submit");
      setLoading(btn, true);
      let res;
      try {
        res = await REBUILT.Auth.updatePassword(payload.password);
      } catch (err) {
        res = { ok: false, error: "حصلت مشكلة صغيرة، جرّب تاني." };
      }
      setLoading(btn, false);

      if (!res.ok) {
        const stale = /session|link|صلاحيته|الجلسة/i.test(res.error || "") || res.code === "otp_expired" || res.code === "session_not_found";
        showNotice("danger", esc(res.error), stale ? `<br/><button type="button" class="btn-link" data-go="forgot">اطلب لينك جديد</button>` : "");
        qsa("#gate-notice [data-go]").forEach((b) => b.addEventListener("click", () => go(b.dataset.go)));
        return;
      }
      REBUILT.Auth.clearRecovery();
      step = "reset-done";
      render();
    });
  }

  /* ---------- Onboarding ---------- */

  function bindBasic() {
    qsa("#occupation-picker .chip").forEach((btn) => {
      btn.addEventListener("click", () => {
        draft.occupation = draft.occupation === btn.dataset.occ ? "" : btn.dataset.occ;
        qsa("#occupation-picker .chip").forEach((b) => {
          const on = b.dataset.occ === draft.occupation;
          b.classList.toggle("is-selected", on);
          b.setAttribute("aria-checked", String(on));
        });
      });
    });
  }

  function bindTags(cfg) {
    qsa("#tag-picker .chip").forEach((btn) => {
      btn.addEventListener("click", () => {
        const list = draft[cfg.key];
        const idx = list.indexOf(btn.dataset.tag);
        if (idx >= 0) list.splice(idx, 1);
        else list.push(btn.dataset.tag);
        const on = idx < 0;
        btn.classList.toggle("is-selected", on);
        btn.setAttribute("aria-pressed", String(on));
      });
    });
    const addBtn = qs("#tag-custom-add");
    const input = qs("#tag-custom-input");
    const add = () => {
      const val = input.value.trim();
      if (!val) return;
      if (!draft[cfg.key].some((x) => x.toLowerCase() === val.toLowerCase())) draft[cfg.key].push(val);
      render();
      const again = qs("#tag-custom-input");
      if (again) again.focus();
    };
    addBtn.addEventListener("click", add);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); add(); }
    });
  }

  function handleNext() {
    if (step === "onboard-basic") {
      draft.name = (qs("#f-name") || {}).value || "";
      draft.occupationCustom = (qs("#f-occupationCustom") || {}).value || "";
      if (!draft.name.trim()) {
        setFieldError("name", "محتاجين اسمك الأول.");
        qs("#f-name").focus();
        return;
      }
    }
    if (step === "onboard-life") draft.lifeDescription = (qs("#life-desc") || {}).value || "";
    if (step === "onboard-challenges") draft.challenges = (qs("#challenges") || {}).value || "";
    const idx = ONBOARD_STEPS.indexOf(step);
    step = ONBOARD_STEPS[idx + 1] || "onboard-summary";
    render();
  }

  function prevOnboardStep() {
    // Keep what was typed on this step before moving back.
    if (step === "onboard-basic") return;
    if (step === "onboard-life") draft.lifeDescription = (qs("#life-desc") || {}).value || draft.lifeDescription;
    if (step === "onboard-challenges") draft.challenges = (qs("#challenges") || {}).value || draft.challenges;
    const idx = ONBOARD_STEPS.indexOf(step);
    if (idx <= 0) return;
    step = ONBOARD_STEPS[idx - 1];
    render();
  }

  function commitOnboarding() {
    state.user.name = draft.name.trim() || state.user.name;
    state.userProfile.occupation = draft.occupation;
    state.userProfile.occupationCustom = draft.occupationCustom.trim();
    state.userProfile.lifeDescription = draft.lifeDescription.trim();
    state.userProfile.skills = draft.skills.slice();
    state.userProfile.hobbies = draft.hobbies.slice();
    state.userProfile.challenges = draft.challenges.trim();

    // Each chosen goal becomes a real goal (with steps/progress to be added on the Goals page).
    const existing = state.goals || [];
    const known = new Set(existing.map((g) => g.title.toLowerCase()));
    const fresh = draft.goals
      .filter((t) => !known.has(t.toLowerCase()))
      .map((title) => REBUILT.Goals.create({ title }));
    state.goals = existing.concat(fresh);
    state.userProfile.goals = REBUILT.Goals.titlesFor(state.goals);

    if (state.userProfile.challenges) state.aiProfile.knownChallenges = [state.userProfile.challenges];
    state.meta.isOnboarded = true;

    REBUILT.Storage.syncProfile(state.user.id, { name: state.user.name });
    REBUILT.Storage.syncOnboarding(state.user.id, state.userProfile, state.aiProfile.knownChallenges, state.goals);
    REBUILT.Storage.save(state);
    finishGate();
  }

  return { start };
})();
