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
    const name = firstName(state) || "بطل";
    const hour = new Date().getHours();
    let variants;
    if (hour < 12) {
      variants = [
        `صباح الفل يا ${name}`,
        `صباحك سكر يا ${name}`,
        `يلا يا ${name}، يوم جديد يستاهل نبدأه صح`,
      ];
    } else if (hour < 18) {
      variants = [
        `أهلاً يا ${name}`,
        `عامل إيه يا ${name}؟ النهارده لسه فيه وقت`,
        `يلا يا ${name}، النص التاني من اليوم بانتظارك`,
      ];
    } else {
      variants = [
        `مساء الخير يا ${name}`,
        `يلا يا ${name}، اقفل يومك بطريقة تليق بيك`,
        `باقي شوية على آخر اليوم يا ${name}`,
      ];
    }
    return pick(state, "greeting", variants);
  }

  function subGreeting(state) {
    const variants = [
      "مستعد نكسب اليوم ولا هنأجله لبكرة؟",
      "يلا نشوف هنعمل فيه إيه النهارده.",
      "كل يوم بتبني فيه نفسك أكتر شوية.",
      "خطوة صغيرة النهارده، فرق كبير بعد شهر.",
      "جاهز نكمل من وقفنا؟",
    ];
    return pick(state, "subGreeting", variants);
  }

  /** Sub-greeting driven by today's real completion %, per the 0/50/100 tiers. */
  function progressGreeting(state, pct) {
    if (pct <= 0) {
      const variants = [
        "لسه اليوم طويل.. نبدأ بحاجة واحدة؟",
        "يومك لسه في الأول، ابدأ بأي حاجة بسيطة.",
      ];
      return pick(state, "progress0", variants);
    }
    if (pct >= 100) {
      const variants = [
        "قفلت اليوم كله! كده إنت عملت اللي عليك.",
        "يوم كامل من غير ما تسيب حاجة.",
      ];
      return pick(state, "progress100", variants);
    }
    if (pct >= 50) {
      const variants = [
        "عاش، نص اليوم تقريبًا اتقفل.",
        "ماشي كويس، كمّل بنفس الروح.",
      ];
      return pick(state, "progress50", variants);
    }
    const variants = [
      "بداية تمام، فاضلك شوية.",
      "يلا كمّل، لسه قدامك وقت.",
    ];
    return pick(state, "progressLow", variants);
  }

  function welcomeFresh() {
    return "أهلاً بيك في REBUILT\n\nهنا مش بنحاول نعمل يوم مثالي... إحنا بنبني يوم أحسن كل مرة.";
  }

  function habitCompleted(state) {
    const variants = [
      "عاش، كده بدأت اليوم صح.",
      "تمام كده، خطوة كمان لقدام.",
      "عاش عليك، واحدة واحدة وإنت بتبني نفسك فعلًا.",
      "كده صح، كمّل بنفس الطاقة.",
      "حلو، استمر كده.",
    ];
    return pick(state, "habitCompleted", variants);
  }

  function habitUndone(state) {
    const variants = [
      "تمام، لسه قدامك وقت تخلصها تاني.",
      "ولا يهمك، ارجعلها لما تكون جاهز.",
    ];
    return pick(state, "habitUndone", variants);
  }

  function fewHabitsLeft(state, remaining) {
    if (remaining === 1) {
      const variants = [
        "فاضلك واحدة بس، خلّصها ونقفل اليوم على نضافة.",
        "عادة واحدة كمان وهتخلص يومك بالكامل.",
      ];
      return pick(state, "fewLeftOne", variants);
    }
    const variants = [
      `فاضلك ${remaining} بس، خلّصهم ونقفل اليوم على نضافة.`,
      `${remaining} حاجات بس وتخلص يومك.`,
    ];
    return pick(state, "fewLeftMany", variants);
  }

  function allHabitsDone(state) {
    const variants = [
      "يوم مقفول بالكامل، كده تمام.",
      "خلصت كل حاجة النهارده! فخور بيك.",
      "يوم نضيف من أوله لآخره.",
      "عاش! يوم كامل من غير ما تسيب حاجة.",
    ];
    return pick(state, "allHabitsDone", variants);
  }

  function taskCompleted(state) {
    const variants = [
      "مهمة خلصت، كمّل بنفس الروح.",
      "شطبناها، جاية التانية.",
      "تمام، مهمة أقل وضغط أقل.",
      "عاش، كده إنت بتتحكم في يومك مش العكس.",
    ];
    return pick(state, "taskCompleted", variants);
  }

  function streakSubtitle(state, streak) {
    if (streak === 0) {
      const variants = [
        "يلا نبدأ streak جديد من النهارده.",
        "أول يوم في السلسلة الجديدة يبدأ دلوقتي.",
      ];
      return pick(state, "streakZero", variants);
    }
    const nextMilestone = streak < 7 ? 7 : streak < 14 ? 14 : streak < 30 ? 30 : streak + (10 - (streak % 10 || 10));
    const remaining = nextMilestone - streak;
    const variants = [
      `متقطعهاش دلوقتي… فاضلك ${remaining} وتوصل ${nextMilestone}.`,
      `${streak} يوم ورا بعض. كمّل، الرقم بيبقى أحلى كل يوم.`,
      `سلسلة قوية يا صاحبي، متكسرهاش دلوقتي.`,
    ];
    return pick(state, "streakSubtitle", variants);
  }

  function streakBroken(state) {
    const variants = [
      "حصلت، متقفش عندها. المهم نرجع نبدأ من النهارده.",
      "السلسلة اتقطعت، بس مش نهاية الدنيا. يلا نبدأ تاني.",
      "معدية، اللي فات فات. النهارده يوم جديد.",
    ];
    return pick(state, "streakBroken", variants);
  }

  function levelUp(state, newLevel) {
    const variants = [
      `ياااه، Level Up! بقيت <bdi>Level ${newLevel}</bdi>… مكمل ولا إيه؟`,
      `مبروك، وصلت <bdi>Level ${newLevel}</bdi>. إنت بجد بتبني نفسك.`,
      `<bdi>Level ${newLevel}</bdi>، كل يوم بتحسّن نفسك أكتر.`,
    ];
    return pick(state, "levelUp", variants);
  }

  function achievementUnlocked(state, name) {
    const variants = [
      `إنجاز جديد "${name}"، استاهلتها.`,
      `فتحت إنجاز "${name}"، كمّل كده.`,
      `عاش، كسبت "${name}".`,
    ];
    return pick(state, "achievementUnlocked", variants);
  }

  function emptyHabits() {
    return "لسه مفيش عادات.\nابدأ بحاجة بسيطة، والباقي هييجي واحدة واحدة.";
  }

  function emptyTasks() {
    return "لسه مفيش مهام.\nضيف أول مهمة وابدأ تنظم يومك.";
  }

  function emptyAchievements() {
    return "الإنجازات لسه مقفولة.\nكمّل عاداتك ومهامك وهتفتحها واحدة واحدة.";
  }

  function genericError() {
    const variants = [
      "حصلت مشكلة صغيرة، جرّب تاني.",
      "معلش، حاجة مظبطتش. جرّب تاني كمان شوية.",
    ];
    return variants[Math.floor(Math.random() * variants.length)];
  }

  function confirmDelete(itemLabel) {
    return `متأكد إنك عايز تمسح "${itemLabel}"؟`;
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
