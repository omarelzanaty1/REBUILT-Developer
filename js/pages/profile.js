/* ============================================================
   REBUILT — pages/profile.js
   Who you are in REBUILT: name, level, lifetime numbers, and the
   "about me" answers from onboarding (editable). The avatar is the
   name's initial on the brand gradient — there is no image storage,
   so there's no upload control pretending otherwise.
   ============================================================ */

window.REBUILT = window.REBUILT || {};
REBUILT.Pages = REBUILT.Pages || {};

REBUILT.Pages.profile = (function () {
  const { XP, Data, Charts, Components, Icons: I } = REBUILT;
  const esc = Components.esc;
  const fmt = (n) => REBUILT.I18n.number(n);

  function occupationLabel(profile) {
    const found = Data.OCCUPATIONS.find((o) => o.id === profile.occupation);
    const base = found ? found.label : "";
    return [base, profile.occupationCustom].filter(Boolean).join(" · ");
  }

  function statTile(icon, label, value) {
    return `<div class="stat"><span class="stat__icon">${I.svg(icon)}</span><span class="stat__value">${value}</span><span class="stat__label">${label}</span></div>`;
  }

  function chips(list, empty) {
    return list && list.length
      ? `<div class="chip-row chip-row--static">${list.map((x) => `<span class="badge">${esc(x)}</span>`).join("")}</div>`
      : `<span class="faint">${empty}</span>`;
  }

  function render(state) {
    const levelInfo = XP.getLevelInfo(state.xp.total);
    const achievements = REBUILT.Achievements.getEnriched(state);
    const unlocked = achievements.filter((a) => a.unlocked);
    const habitsCompletedTotal = state.habits.reduce((sum, h) => sum + (h.completionHistory || []).length, 0);
    const tasksCompletedTotal = state.tasks.filter((t) => t.completed).length;
    const daysSinceStart = state.user.createdAt ? Math.max(1, Math.round((Date.now() - new Date(state.user.createdAt)) / 86400000)) : 1;
    const p = state.userProfile;
    const goalStats = REBUILT.Goals.stats(state.goals || []);
    const aboutEmpty = !occupationLabel(p) && !p.lifeDescription && !p.skills.length && !p.hobbies.length;

    return `
      ${Components.pageHeader({ title: REBUILT.t("profile.profile") })}

      <section class="profile-hero card card--brand">
        ${REBUILT.Brand.avatar(state.user.name, "xl")}
        <div class="profile-hero__info">
          <h2 class="profile-hero__name">
            <span>${esc(state.user.name || REBUILT.t("profile.rebuilt_hero"))}</span>
            <button type="button" class="icon-btn icon-btn--sm" id="edit-name-btn" aria-label="${REBUILT.t("profile.edit_name")}">${I.svg("edit")}</button>
          </h2>
          <p class="profile-hero__meta">${REBUILT.t("profile.building_yourself_for")} <span class="num">${daysSinceStart}</span> ${REBUILT.t("profile.days_2", { n: daysSinceStart, p1: state.user.email ? ` · <bdi class="num-ltr">${esc(state.user.email)}</bdi>` : "" })}</p>
          <div class="profile-hero__xp">
            <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${levelInfo.progressPct}" aria-label="${REBUILT.t("profile.level_progress")}"><span class="progress__fill" style="width:${levelInfo.progressPct}%"></span></div>
            <span class="num" dir="ltr">${fmt(levelInfo.currentLevelXP)} / ${fmt(levelInfo.neededForNextLevel)} XP</span>
          </div>
        </div>
        <div class="profile-hero__level">
          ${Charts.radialProgress({ pct: levelInfo.progressPct, size: 92, strokeWidth: 8, ariaLabel: REBUILT.t("profile.level_progress") })}
          <div class="profile-hero__level-num"><small>LEVEL</small><strong class="num">${levelInfo.level}</strong></div>
        </div>
      </section>

      <section class="stat-grid" aria-label="${REBUILT.t("profile.your_numbers")}">
        ${statTile("bolt", REBUILT.t("profile.total_xp"), `<span class="num">${fmt(state.xp.total)}</span>`)}
        ${statTile("flame", REBUILT.t("profile.current_streak"), `<span class="num">${state.streak.current}</span><small> ${REBUILT.t("profile.days", { n: state.streak.current })}</small>`)}
        ${statTile("trophy", REBUILT.t("profile.longest_streak"), `<span class="num">${state.streak.longest}</span><small> ${REBUILT.t("profile.days", { n: state.streak.longest })}</small>`)}
        ${statTile("target", REBUILT.t("profile.goals_achieved"), `<span class="num">${goalStats.done}</span>`)}
        ${statTile("repeat", REBUILT.t("profile.habits_done"), `<span class="num">${fmt(habitsCompletedTotal)}</span>`)}
        ${statTile("tasks", REBUILT.t("profile.tasks_completed"), `<span class="num">${fmt(tasksCompletedTotal)}</span>`)}
      </section>

      <div class="grid grid--2">
        <section class="card">
          <div class="card__head">
            <h2 class="card__title">${REBUILT.t("profile.about_me")}</h2>
            <button type="button" class="btn btn--secondary btn--sm" id="edit-about-btn">${REBUILT.t("profile.edit", { p1: I.svg("edit") })}</button>
          </div>
          ${aboutEmpty
            ? Components.emptyState({ compact: true, icon: "user", text: REBUILT.t("profile.add_a_short_bio_so") })
            : `<dl class="about">
                ${occupationLabel(p) ? `<div><dt>${REBUILT.t("profile.work_study")}</dt><dd>${esc(occupationLabel(p))}</dd></div>` : ""}
                ${p.lifeDescription ? `<div><dt>${REBUILT.t("profile.your_day")}</dt><dd>${esc(p.lifeDescription)}</dd></div>` : ""}
                <div><dt>${REBUILT.t("profile.your_skills")}</dt><dd>${chips(p.skills, REBUILT.t("profile.nothing_yet"))}</dd></div>
                <div><dt>${REBUILT.t("profile.your_interests")}</dt><dd>${chips(p.hobbies, REBUILT.t("profile.nothing_yet"))}</dd></div>
                ${p.challenges ? `<div><dt>${REBUILT.t("profile.what_makes_it_hard")}</dt><dd>${esc(p.challenges)}</dd></div>` : ""}
              </dl>`}
        </section>

        <section class="card">
          <div class="card__head">
            <h2 class="card__title">${REBUILT.t("profile.your_latest_achievements")}</h2>
            <button type="button" class="card__link" data-nav="achievements">${REBUILT.t("profile.all", { p1: I.svg("chevronLeft", { size: 14 }) })}</button>
          </div>
          ${unlocked.length
            ? `<div class="badge-grid badge-grid--compact">${unlocked.slice(-4).reverse().map(Components.achievementBadge).join("")}</div>`
            : Components.emptyState({ compact: true, icon: "trophy", text: REBUILT.t("profile.your_first_achievement_is_coming") })}
        </section>
      </div>
    `;
  }

  function afterRender(container, state) {
    const nameBtn = container.querySelector("#edit-name-btn");
    if (nameBtn) nameBtn.addEventListener("click", () => openNameForm(state));
    const aboutBtn = container.querySelector("#edit-about-btn");
    if (aboutBtn) aboutBtn.addEventListener("click", () => openAboutForm(state));
  }

  function openNameForm(state) {
    REBUILT.Modal.open({
      title: REBUILT.t("profile.edit_name"),
      size: "sm",
      body: `
        <form class="form" id="edit-name-form" novalidate>
          ${Components.inputField({ name: "name", label: REBUILT.t("profile.name"), value: state.user.name || "", maxlength: 40, autofocus: true })}
          <div class="modal__footer"><button type="submit" class="btn btn--primary">${REBUILT.t("profile.save")}</button></div>
        </form>`,
      onMount: (modal) => {
        Components.clearErrorsOnInput(modal);
        modal.querySelector("#edit-name-form").addEventListener("submit", (e) => {
          e.preventDefault();
          const name = (new FormData(e.target).get("name") || "").toString().trim();
          if (!name) return Components.setFieldError(modal, "name", REBUILT.t("profile.enter_your_name"));
          REBUILT.Modal.close();
          REBUILT.Actions.updateProfile({ name });
        });
      },
    });
  }

  /** Occupation + life description + skills + hobbies + challenges. Goals live on their own page. */
  function openAboutForm(state) {
    const p = state.userProfile;
    const lists = { skills: p.skills.slice(), hobbies: p.hobbies.slice() };
    let occupation = p.occupation || "";

    const tagBlock = (key, label, presets, placeholder) => `
      <div class="field" data-tags="${key}">
        <span class="field__label">${label}<span class="optional">${REBUILT.t("profile.optional")}</span></span>
        <div class="chip-row" data-tag-list></div>
        <div class="gate__add">
          <input class="field__input" type="text" maxlength="60" placeholder="${placeholder}" aria-label="${placeholder}" data-tag-input />
          <button type="button" class="btn btn--secondary" data-tag-add aria-label="${REBUILT.t("profile.add")}">${I.svg("plus")}</button>
        </div>
      </div>`;

    REBUILT.Modal.open({
      title: REBUILT.t("profile.about_me"),
      body: `
        <form class="form" id="about-form" novalidate>
          <div class="field">
            <span class="field__label" id="occ-lbl">${REBUILT.t("profile.what_do_you_do_in")}<span class="optional">${REBUILT.t("profile.optional")}</span></span>
            <div class="chip-row" id="occ-picker" role="radiogroup" aria-labelledby="occ-lbl">
              ${Data.OCCUPATIONS.map((o) => `<button type="button" role="radio" aria-checked="${occupation === o.id}" class="chip ${occupation === o.id ? "is-selected" : ""}" data-occ="${o.id}">${o.label}</button>`).join("")}
            </div>
          </div>
          ${Components.inputField({ name: "occupationCustom", label: REBUILT.t("profile.select_more"), value: p.occupationCustom || "", optional: true, maxlength: 60 })}
          ${Components.inputField({ name: "lifeDescription", label: REBUILT.t("profile.what_are_your_days_usually"), value: p.lifeDescription || "", optional: true, textarea: true, rows: 3, maxlength: 600 })}
          ${tagBlock("skills", REBUILT.t("profile.your_skills"), Data.PRESET_SKILLS, REBUILT.t("profile.add_a_skill"))}
          ${tagBlock("hobbies", REBUILT.t("profile.your_interests"), Data.PRESET_HOBBIES, REBUILT.t("profile.add_an_interest"))}
          ${Components.inputField({ name: "challenges", label: REBUILT.t("profile.what_makes_it_hardest_to"), value: p.challenges || "", optional: true, textarea: true, rows: 3, maxlength: 600 })}
          <div class="modal__footer"><button type="submit" class="btn btn--primary">${REBUILT.t("profile.save")}</button></div>
        </form>`,
      onMount: (modal) => {
        modal.querySelectorAll("#occ-picker .chip").forEach((btn) => {
          btn.addEventListener("click", () => {
            occupation = occupation === btn.dataset.occ ? "" : btn.dataset.occ;
            modal.querySelectorAll("#occ-picker .chip").forEach((b) => {
              const on = b.dataset.occ === occupation;
              b.classList.toggle("is-selected", on);
              b.setAttribute("aria-checked", String(on));
            });
          });
        });

        const presetsOf = { skills: Data.PRESET_SKILLS, hobbies: Data.PRESET_HOBBIES };
        function paint(key) {
          const block = modal.querySelector(`[data-tags="${key}"]`);
          const shown = presetsOf[key].concat(lists[key].filter((x) => !presetsOf[key].includes(x)));
          block.querySelector("[data-tag-list]").innerHTML = shown
            .map((t) => `<button type="button" class="chip ${lists[key].includes(t) ? "is-selected" : ""}" aria-pressed="${lists[key].includes(t)}" data-tag="${esc(t)}">${esc(t)}</button>`)
            .join("");
          block.querySelectorAll("[data-tag]").forEach((chip) => {
            chip.addEventListener("click", () => {
              const i = lists[key].indexOf(chip.dataset.tag);
              if (i >= 0) lists[key].splice(i, 1);
              else lists[key].push(chip.dataset.tag);
              paint(key);
            });
          });
        }
        ["skills", "hobbies"].forEach((key) => {
          paint(key);
          const block = modal.querySelector(`[data-tags="${key}"]`);
          const input = block.querySelector("[data-tag-input]");
          const add = () => {
            const v = input.value.trim();
            if (!v) return;
            if (!lists[key].some((x) => x.toLowerCase() === v.toLowerCase())) lists[key].push(v);
            input.value = "";
            paint(key);
            input.focus();
          };
          block.querySelector("[data-tag-add]").addEventListener("click", add);
          input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); add(); } });
        });

        modal.querySelector("#about-form").addEventListener("submit", (e) => {
          e.preventDefault();
          const fd = new FormData(e.target);
          const payload = {
            occupation,
            occupationCustom: (fd.get("occupationCustom") || "").toString().trim(),
            lifeDescription: (fd.get("lifeDescription") || "").toString().trim(),
            skills: lists.skills.slice(),
            hobbies: lists.hobbies.slice(),
            challenges: (fd.get("challenges") || "").toString().trim(),
          };
          REBUILT.Modal.close();
          REBUILT.Actions.updateUserProfile(payload);
          REBUILT.Toast.show({ icon: "check", text: REBUILT.t("profile.your_details_were_saved"), tone: "default", duration: 1800 });
        });
      },
    });
  }

  return { render, afterRender };
})();
