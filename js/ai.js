/* ============================================================
   REBUILT — ai.js
   The AI integration seam, kept out of the UI layer on purpose.

   Two modes behind one stable interface:
   • Connected (real Supabase session) — Service.sendMessage() calls
     the `ai-chat` Edge Function, which is the ONLY place that holds
     the model API key and the ONLY writer to ai_conversations in
     this mode (it saves both the user's message and its own reply
     server-side). This file must NOT also sync the user's message —
     that would duplicate every row.
   • Local-only (no real session) — a clearly labeled placeholder
     that explains the gap instead of pretending to understand.

   ContextBuilder assembles the exact structured, summarized context
   (profile + AI profile + today + habits + tasks + today's schedule +
   achievements) the backend needs — never raw IDs or full row dumps.
   ConversationManager keeps a real local message log so the UI always
   has something true to render, in either mode.
   ============================================================ */

window.REBUILT = window.REBUILT || {};

REBUILT.AI = (function () {
  function buildContext(state) {
    const today = REBUILT.Helpers.getToday();
    return {
      user: { name: state.user.name, createdAt: state.user.createdAt },
      userProfile: state.userProfile,
      aiProfile: state.aiProfile,
      today: {
        date: today,
        // Local day-of-week name, matching user_weekly_schedule.day_of_week's
        // format ("Sunday".."Saturday") — the Edge Function's get_today_planner
        // tool reads this instead of computing "today" itself server-side,
        // which avoids re-introducing the UTC-offset date-shift bug.
        dayOfWeek: new Date().toLocaleDateString("en-US", { weekday: "long" }),
        progress: REBUILT.Helpers.calculateDailyProgress(state),
        streak: state.streak,
      },
      activeHabits: state.habits.map((h) => ({
        title: h.title,
        frequency: h.frequency,
        targetDays: h.targetDays,
        currentStreak: h.currentStreak,
      })),
      openTasks: state.tasks
        .filter((t) => !t.completed)
        .map((t) => ({ title: t.title, priority: t.priority, date: t.date, time: t.time })),
      todaySchedule: (state.scheduleItems || [])
        .filter((s) => s.date === today)
        .slice()
        .sort((a, b) => (a.startTime || "").localeCompare(b.startTime || ""))
        .map((s) => ({ time: s.startTime, title: s.title })),
      recentAchievements: REBUILT.Achievements.getEnriched(state)
        .filter((a) => a.unlocked)
        .slice(-5)
        .map((a) => a.name),
      totalXP: REBUILT.Helpers.calculateTotalXP(state),
    };
  }

  /* ---------------- Conversation Manager: a real local message log ---------------- */

  function getMessages(state) {
    return state.aiConversation || [];
  }

  function pushMessage(state, role, text) {
    if (!state.aiConversation) state.aiConversation = [];
    state.aiConversation.push({ role, text, at: new Date().toISOString() });
  }

  /**
   * supabase-js wraps a non-2xx Edge Function response in a
   * FunctionsHttpError whose `.context` is the raw Response — read it for
   * the server's own Arabic reply (rate-limited / not-configured / etc.)
   * instead of showing a generic line for every kind of failure.
   */
  async function extractServerReply(error) {
    try {
      if (error && error.context && typeof error.context.json === "function") {
        const body = await error.context.json();
        if (body && typeof body.reply === "string") return body.reply;
      }
    } catch (err) {
      // Body wasn't JSON, or was already consumed — fall through.
    }
    return null;
  }

  /* ---------------- AIService: the integration seam ---------------- */

  const Service = {
    isConnected() {
      return REBUILT.Auth.isRealAuth();
    },

    async sendMessage(state, userText) {
      if (!Service.isConnected()) {
        pushMessage(state, "user", userText);
        const reply =
          "REBUILT AI محتاج حساب متصل بالسيرفر عشان يشتغل فعليًا. " +
          "سجّل دخول بحساب حقيقي، ولحد ما تعمل كده أنا بس بحفظ كلامك هنا.";
        pushMessage(state, "assistant", reply);
        return { role: "assistant", text: reply, connected: false };
      }

      // Connected mode: append the user's message locally for instant UI
      // feedback only — do NOT sync it to ai_conversations here. The Edge
      // Function already persists both the user's message and its reply
      // server-side; syncing it again from here would duplicate every row.
      pushMessage(state, "user", userText);

      try {
        const sb = REBUILT.SupabaseClient.get();
        const { data, error } = await sb.functions.invoke("ai-chat", {
          body: { message: userText, context: buildContext(state) },
        });

        if (error) {
          const serverReply = await extractServerReply(error);
          const reply = serverReply || "حصلت مشكلة في الاتصال بـ REBUILT AI. جرّب تاني.";
          pushMessage(state, "assistant", reply);
          return { role: "assistant", text: reply, connected: true, error: true };
        }

        const reply = (data && data.reply) || "معرفتش أرد دلوقتي، جرّب تصيغ كلامك بطريقة تانية.";
        pushMessage(state, "assistant", reply);
        return { role: "assistant", text: reply, connected: true };
      } catch (err) {
        console.warn("REBUILT: ai-chat call failed", err);
        const reply = "حصلت مشكلة في الاتصال. جرّب تاني.";
        pushMessage(state, "assistant", reply);
        return { role: "assistant", text: reply, connected: true, error: true };
      }
    },
  };

  return { buildContext, getMessages, pushMessage, Service };
})();
