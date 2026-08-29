// ---------- AI要約（Phase4） ----------
// 読書メモ・感想（js/services/aiContext.js）から、3行要約・学んだこと・明日から実践できることを作る。
// 通信はjs/services/aiChat.jsのsendChatMessage()経由で、共通の/api/chatだけを使う。

const AI_SUMMARY_SCHEMA = {
  name: "reading_summary",
  schema: {
    type: "object",
    properties: {
      summaryLines: {
        type: "array",
        minItems: 3,
        maxItems: 3,
        items: { type: "string" },
        description: "3行要約（1行ずつ）"
      },
      learnings: {
        type: "array",
        minItems: 3,
        maxItems: 3,
        items: { type: "string" },
        description: "学んだことを3つ"
      },
      actions: {
        type: "array",
        minItems: 3,
        maxItems: 3,
        items: { type: "string" },
        description: "明日から実践できることを3つ"
      }
    },
    required: ["summaryLines", "learnings", "actions"],
    additionalProperties: false
  }
};

const AI_SUMMARY_INSTRUCTIONS =
  "あなたはBookHubという読書アプリの中で、ユーザー自身が書いた読書メモ・感想を整理するアシスタントです。" +
  "日本語で、簡潔かつ具体的にまとめてください。ユーザーが実際に書いた内容に基づき、一般論に逃げないでください。";

const aiSummaryEmptyEl = document.getElementById("ai-summary-empty");
const aiSummaryGenerateButton = document.getElementById("ai-summary-generate-button");
const aiSummaryLoadingEl = document.getElementById("ai-summary-loading");
const aiSummaryErrorEl = document.getElementById("ai-summary-error");
const aiSummaryResultEl = document.getElementById("ai-summary-result");
const aiSummaryLinesEl = document.getElementById("ai-summary-lines");
const aiSummaryLearningsEl = document.getElementById("ai-summary-learnings");
const aiSummaryActionsEl = document.getElementById("ai-summary-actions");

function fillAiSummaryList(listEl, items) {
  listEl.innerHTML = "";
  items.forEach(function (text) {
    const item = document.createElement("li");
    item.textContent = text;
    listEl.appendChild(item);
  });
}

aiSummaryGenerateButton.addEventListener("click", async function () {
  aiSummaryErrorEl.hidden = true;

  const notesContext = filterAiContextWithNotes(buildAiReadingContext());
  if (notesContext.length === 0) {
    aiSummaryErrorEl.textContent = "要約を作るための読書メモ・感想がまだありません。読書記録にメモや感想を書いてから、もう一度お試しください。";
    aiSummaryErrorEl.hidden = false;
    return;
  }

  aiSummaryEmptyEl.hidden = true;
  aiSummaryResultEl.hidden = true;
  aiSummaryLoadingEl.hidden = false;
  aiSummaryGenerateButton.disabled = true;
  hideInsufficientCreditBanner(aiCreditInsufficientBannerEl); // js/screens/aiCredits.js

  try {
    const contextText = formatAiReadingContext(notesContext);
    const message =
      "以下はユーザーの読書メモ・感想です。\n\n" + contextText +
      "\n\n上記から、（1）3行要約、（2）学んだことを3つ、（3）明日から実践できることを3つ、それぞれ作成してください。";

    const data = await sendChatMessage(message, {
      feature: "summary",
      instructions: AI_SUMMARY_INSTRUCTIONS,
      schema: AI_SUMMARY_SCHEMA
    });

    fillAiSummaryList(aiSummaryLinesEl, data.summaryLines || []);
    fillAiSummaryList(aiSummaryLearningsEl, data.learnings || []);
    fillAiSummaryList(aiSummaryActionsEl, data.actions || []);
    aiSummaryResultEl.hidden = false;
  } catch (error) {
    if (error.insufficientCredit) {
      showInsufficientCreditBanner(aiCreditInsufficientBannerEl);
    } else {
      aiSummaryErrorEl.textContent = error.message || "要約の作成に失敗しました。";
      aiSummaryErrorEl.hidden = false;
    }
  } finally {
    aiSummaryLoadingEl.hidden = true;
    aiSummaryGenerateButton.disabled = false;
  }
});
