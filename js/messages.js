/* ============================================================
   REBUILT — messages.js
   The app's voice: friendly Egyptian Arabic, never robotic, never
   the same line twice in a row. Every getter below picks a random
   variant while avoiding whatever was shown last for that spot.
   (Plain text only — icons come from the icon system, not emoji.)
   ============================================================ */

window.REBUILT = window.REBUILT || {};

REBUILT.Messages = (function () {

  function pick(state, key, variants) {
    if (variants.length === 1) return variants[0];
    const lastIndex = state && state.lastMessageIndex ? state.lastMessageIndex[key] : undefined;
    let index = Math.floor(Math.random() * variants.length);
    if (variants.length > 1 && index === lastIndex) {
      index = (index + 1) % variants.length;
    }
    if (state && state.lastMessageIndex) state.lastMessageIndex[key] = index;
    return variants[index];
  }

  /** First name only, escaped — names are user input and these lines are rendered as HTML. */
  function firstName(state) {
    const full = ((state.user && state.user.name) || "").trim();
    const first = full.split(/\s+/)[0] || "";
    return REBUILT.Components ? REBUILT.Components.esc(first) : first;
  }

  function greeting(state) {
    const name = firstName(state) || REBUILT.t("messages.champ");
    const hour = new Date().getHours();
    let variants;
    if (hour < 12) {
      variants = [
        REBUILT.t("messages.good_morning", { name }),
        REBUILT.t("messages.rise_and_shine", { name }),
        REBUILT.t("messages.let_s_go_a_new", { name }),
      ];
    } else if (hour < 18) {
      variants = [
        REBUILT.t("messages.hey", { name }),
        REBUILT.t("messages.how_s_it_going_there", { name }),
        REBUILT.t("messages.come_on_the_second_half", { name }),
      ];
    } else {
      variants = [
        REBUILT.t("messages.good_evening", { name }),
        REBUILT.t("messages.come_on_close_out_your", { name }),
        REBUILT.t("messages.almost_the_end_of_the", { name }),
      ];
    }
    return pick(state, "greeting", variants);
  }

  function subGreeting(state) {
    const variants = [
      REBUILT.t("messages.ready_to_win_today_or"),
      REBUILT.t("messages.let_s_see_what_we"),
      REBUILT.t("messages.every_day_you_build_yourself"),
      REBUILT.t("messages.a_small_step_today_a"),
      REBUILT.t("messages.ready_to_pick_up_where"),
    ];
    return pick(state, "subGreeting", variants);
  }

  /** Sub-greeting driven by today's real completion %, per the 0/50/100 tiers. */
  function progressGreeting(state, pct) {
    if (pct <= 0) {
      const variants = [
        REBUILT.t("messages.the_day_is_still_young"),
        REBUILT.t("messages.your_day_has_barely_started"),
      ];
      return pick(state, "progress0", variants);
    }
    if (pct >= 100) {
      const variants = [
        REBUILT.t("messages.you_closed_out_the_whole"),
        REBUILT.t("messages.a_full_day_without_leaving"),
      ];
      return pick(state, "progress100", variants);
    }
    if (pct >= 50) {
      const variants = [
        REBUILT.t("messages.nice_about_half_the_day"),
        REBUILT.t("messages.going_well_keep_up_the"),
      ];
      return pick(state, "progress50", variants);
    }
    const variants = [
      REBUILT.t("messages.good_start_a_few_more"),
      REBUILT.t("messages.keep_going_you_still_have"),
    ];
    return pick(state, "progressLow", variants);
  }

  function welcomeFresh() {
    return REBUILT.t("messages.welcome_to_rebuilt_n_nwe");
  }

  function habitCompleted(state) {
    const variants = [
      REBUILT.t("messages.nice_you_started_the_day"),
      REBUILT.t("messages.all_good_one_more_step"),
      REBUILT.t("messages.well_done_one_by_one"),
      REBUILT.t("messages.that_s_it_keep_the"),
      REBUILT.t("messages.nice_keep_it_going"),
    ];
    return pick(state, "habitCompleted", variants);
  }

  function habitUndone(state) {
    const variants = [
      REBUILT.t("messages.all_good_you_still_have"),
      REBUILT.t("messages.no_worries_come_back_to"),
    ];
    return pick(state, "habitUndone", variants);
  }

  function fewHabitsLeft(state, remaining) {
    if (remaining === 1) {
      const variants = [
        REBUILT.t("messages.just_one_left_finish_it"),
        REBUILT.t("messages.one_more_habit_and_your"),
      ];
      return pick(state, "fewLeftOne", variants);
    }
    const variants = [
      REBUILT.t("messages.only_left_finish_them_and", { remaining }),
      REBUILT.t("messages.just_things_and_your_day", { remaining }),
    ];
    return pick(state, "fewLeftMany", variants);
  }

  function allHabitsDone(state) {
    const variants = [
      REBUILT.t("messages.day_fully_closed_nicely_done"),
      REBUILT.t("messages.you_finished_everything_today_proud"),
      REBUILT.t("messages.a_clean_day_from_start"),
      REBUILT.t("messages.nice_a_full_day_without"),
    ];
    return pick(state, "allHabitsDone", variants);
  }

  function taskCompleted(state) {
    const variants = [
      REBUILT.t("messages.task_done_keep_up_the"),
      REBUILT.t("messages.crossed_off_on_to_the"),
      REBUILT.t("messages.nice_one_less_task_and"),
      REBUILT.t("messages.well_done_you_re_in"),
    ];
    return pick(state, "taskCompleted", variants);
  }

  function streakSubtitle(state, streak) {
    if (streak === 0) {
      const variants = [
        REBUILT.t("messages.let_s_start_a_new"),
        REBUILT.t("messages.day_one_of_your_new"),
      ];
      return pick(state, "streakZero", variants);
    }
    const nextMilestone = streak < 7 ? 7 : streak < 14 ? 14 : streak < 30 ? 30 : streak + (10 - (streak % 10 || 10));
    const remaining = nextMilestone - streak;
    const variants = [
      REBUILT.t("messages.don_t_break_it_now", { remaining, nextMilestone }),
      REBUILT.t("messages.days_in_a_row_keep", { streak }),
      REBUILT.t("messages.strong_streak_my_friend_don"),
    ];
    return pick(state, "streakSubtitle", variants);
  }

  function streakBroken(state) {
    const variants = [
      REBUILT.t("messages.it_happens_don_t_stop"),
      REBUILT.t("messages.the_streak_broke_but_it"),
      REBUILT.t("messages.it_s_fine_what_s"),
    ];
    return pick(state, "streakBroken", variants);
  }

  function levelUp(state, newLevel) {
    const variants = [
      `${REBUILT.t("messages.whoa_level_up_you_re")} <bdi>Level ${newLevel}</bdi>${REBUILT.t("messages.still_going")}`,
      `${REBUILT.t("messages.congrats_you_reached")} <bdi>Level ${newLevel}</bdi>${REBUILT.t("messages.you_re_really_building_yourself")}`,
      `<bdi>Level ${newLevel}</bdi>${REBUILT.t("messages.you_get_a_little_better")}`,
    ];
    return pick(state, "levelUp", variants);
  }

  function achievementUnlocked(state, name) {
    const variants = [
      REBUILT.t("messages.new_achievement_you_earned_it", { name }),
      REBUILT.t("messages.you_unlocked_keep_it_up", { name }),
      REBUILT.t("messages.nice_you_earned", { name }),
    ];
    return pick(state, "achievementUnlocked", variants);
  }

  function emptyHabits() {
    return REBUILT.t("messages.no_habits_yet_nstart_with");
  }

  function emptyTasks() {
    return REBUILT.t("messages.no_tasks_yet_nadd_your");
  }

  function emptyAchievements() {
    return REBUILT.t("messages.achievements_are_still_locked_nkeep");
  }

  function genericError() {
    const variants = [
      REBUILT.t("messages.something_small_went_wrong_try"),
      REBUILT.t("messages.sorry_something_didn_t_work"),
    ];
    return variants[Math.floor(Math.random() * variants.length)];
  }

  function confirmDelete(itemLabel) {
    return REBUILT.t("messages.are_you_sure_you_want", { itemLabel });
  }

  return {
    greeting,
    subGreeting,
    progressGreeting,
    welcomeFresh,
    habitCompleted,
    habitUndone,
    fewHabitsLeft,
    allHabitsDone,
    taskCompleted,
    streakSubtitle,
    streakBroken,
    levelUp,
    achievementUnlocked,
    emptyHabits,
    emptyTasks,
    emptyAchievements,
    genericError,
    confirmDelete,
  };
})();
