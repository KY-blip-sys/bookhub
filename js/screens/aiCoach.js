// ---------- AI学習コーチ（Phase5） ----------
// 読書履歴全体（js/services/aiContext.js）をAIに分析させ、最近読んでいるジャンル・偏り・
// おすすめジャンル・学習アドバイスを表示する。通信は共通の/api/chatだけを使う。

const AI_COACH_SCHEMA = {
  name: "reading_coach_analysis",
  schema: {
    type: "object",
    properties: {
      recentGenres: { type: "string", description: "最近読んでいるジャンル・テーマの傾向" },
      bias: { type: "string", description: "ジャンルの偏りについての指摘" },
      recommendedGenres: { type: "string", description: "今後読むとよいジャンル・テーマの提案" },
      advice: { type: "string", description: "今後の学習に向けた、具体的で前向きなアドバイス" }
    },
    required: ["recentGenres", "bias", "recommendedGenres", "advice"],
    additionalProperties: false
  }
};

const AI_COACH_INSTRUCTIONS =
  "あなたはBookHubという読書アプリの中で、ユーザーの読書履歴を分析する学習コーチです。" +
  "渡された読書履歴（ジャンル・学んだこと・感想・読書時間）をもとに、日本語で、優しく前向きな言葉でアドバイスしてください。" +
  "決めつけすぎず、データから読み取れる範囲で具体的に書いてください。";

const aiCoachEmptyEl = document.getElementById("ai-coach-empty");
const aiCoachGenerateButton = document.getElementById("ai-coach-generate-button");
const aiCoachLoadingEl = document.getElementById("ai-coach-loading");
const aiCoachErrorEl = document.getElementById("ai-coach-error");
const aiCoachResultEl = document.getElementById("ai-coach-result");
const aiCoachRecentGenresEl = document.getElementById("ai-coach-recent-genres");
const aiCoachBiasEl = document.getElementById("ai-coach-bias");
const aiCoachRecommendedGenresEl = document.getElementById("ai-coach-recommended-genres");
const aiCoachAdviceEl = document.getElementById("ai-coach-advice");

aiCoachGenerateButton.addEventListener("click", async function () {
  aiCoachErrorEl.hidden = true;

  const context = buildAiReadingContext();
  if (context.length === 0) {
    aiCoachErrorEl.textContent = "分析のもとになる読書記録がまだありません。本を登録して読書記録を付けてから、もう一度お試しください。";
    aiCoachErrorEl.hidden = false;
    return;
  }

  aiCoachEmptyEl.hidden = true;
  aiCoachResultEl.hidden = true;
  aiCoachLoadingEl.hidden = false;
  aiCoachGenerateButton.disabled = true;
  hideInsufficientCreditBanner(aiCreditInsufficientBannerEl); // js/screens/aiCredits.js

  try {
    const contextText = formatAiReadingContext(context);
    const message =
      contextText +
      "\n\n上記の読書履歴を分析し、（1）最近読んでいるジャンルの傾向、（2）ジャンルの偏り、" +
      "（3）おすすめのジャンル、（4）今後の学習アドバイス、をまとめてください。";

    const data = await sendChatMessage(message, {
      feature: "coach",
      instructions: AI_COACH_INSTRUCTIONS,
      schema: AI_COACH_SCHEMA
    });

    aiCoachRecentGenresEl.textContent = data.recentGenres || "";
    aiCoachBiasEl.textContent = data.bias || "";
    aiCoachRecommendedGenresEl.textContent = data.recommendedGenres || "";
    aiCoachAdviceEl.textContent = data.advice || "";
    aiCoachResultEl.hidden = false;
  } catch (error) {
    if (error.insufficientCredit) {
      showInsufficientCreditBanner(aiCreditInsufficientBannerEl);
    } else {
      aiCoachErrorEl.textContent = error.message || "分析に失敗しました。";
      aiCoachErrorEl.hidden = false;
    }
  } finally {
    aiCoachLoadingEl.hidden = true;
    aiCoachGenerateButton.disabled = false;
  }
});
