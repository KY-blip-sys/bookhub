// ---------- AIおすすめ本（Phase2） ----------
// これまでの読書記録（js/services/aiContext.js）をAIに渡し、次に読む本をカード形式で提案する。
// 通信はjs/services/aiChat.jsのsendChatMessage()経由で、共通の/api/chatだけを使う。

const AI_RECOMMEND_SCHEMA = {
  name: "book_recommendations",
  schema: {
    type: "object",
    properties: {
      recommendations: {
        type: "array",
        minItems: 3,
        maxItems: 5,
        items: {
          type: "object",
          properties: {
            title: { type: "string", description: "おすすめする本のタイトル" },
            author: { type: "string", description: "著者名（不明な場合は空文字）" },
            reason: { type: "string", description: "この本をおすすめする理由" },
            newLearning: { type: "string", description: "この本で新しく学べること" },
            difficulty: { type: "integer", enum: [1, 2, 3, 4, 5], description: "読みやすさの難易度（1が易しい、5が難しい）" },
            recommendLevel: { type: "integer", enum: [1, 2, 3, 4, 5], description: "おすすめ度（5が最もおすすめ）" }
          },
          required: ["title", "author", "reason", "newLearning", "difficulty", "recommendLevel"],
          additionalProperties: false
        }
      }
    },
    required: ["recommendations"],
    additionalProperties: false
  }
};

const AI_RECOMMEND_INSTRUCTIONS =
  "あなたはBookHubという読書アプリの中で、ユーザーの読書履歴から次に読む本を提案するアシスタントです。" +
  "できるだけ実在する書籍を、渡された読書履歴（読んだ本・ジャンル・学んだこと・感想・読書時間）を踏まえて具体的に提案してください。" +
  "理由・新しく学べることは、ユーザーの過去の記録の内容に触れながら、日本語で簡潔に書いてください。";

const aiRecommendEmptyEl = document.getElementById("ai-recommend-empty");
const aiRecommendGenerateButton = document.getElementById("ai-recommend-generate-button");
const aiRecommendLoadingEl = document.getElementById("ai-recommend-loading");
const aiRecommendErrorEl = document.getElementById("ai-recommend-error");
const aiRecommendListEl = document.getElementById("ai-recommend-list");

// AIの返答（自由記述のテキストを含む）はinnerHTMLで組み立てず、要素ごとにtextContentで差し込む
// （他の画面の一覧描画と同じ考え方。HTMLとして解釈されるのを防ぐ）
function buildAiRecommendStatLine(label, starCount) {
  const line = document.createElement("span");
  line.append(label + " ");
  const stars = document.createElement("span");
  stars.className = "ai-recommend-stars";
  stars.textContent = renderAiStars(starCount);
  line.appendChild(stars);
  return line;
}

function renderAiRecommendCards(recommendations) {
  aiRecommendListEl.innerHTML = "";
  recommendations.forEach(function (item) {
    const card = document.createElement("li");
    card.className = "ai-recommend-card";

    const title = document.createElement("h3");
    title.className = "ai-recommend-title";
    title.textContent = item.title;
    card.appendChild(title);

    if (item.author) {
      const author = document.createElement("p");
      author.className = "ai-recommend-author";
      author.textContent = item.author;
      card.appendChild(author);
    }

    const reason = document.createElement("p");
    reason.className = "ai-recommend-line";
    reason.innerHTML = "<strong>おすすめ理由</strong>";
    reason.append(item.reason);
    card.appendChild(reason);

    const newLearning = document.createElement("p");
    newLearning.className = "ai-recommend-line";
    newLearning.innerHTML = "<strong>新しく学べること</strong>";
    newLearning.append(item.newLearning);
    card.appendChild(newLearning);

    const stats = document.createElement("div");
    stats.className = "ai-recommend-stats";
    stats.appendChild(buildAiRecommendStatLine("難易度", item.difficulty));
    stats.appendChild(buildAiRecommendStatLine("おすすめ度", item.recommendLevel));
    card.appendChild(stats);

    aiRecommendListEl.appendChild(card);
  });
}

aiRecommendGenerateButton.addEventListener("click", async function () {
  aiRecommendErrorEl.hidden = true;
  aiRecommendEmptyEl.hidden = true;
  aiRecommendLoadingEl.hidden = false;
  aiRecommendGenerateButton.disabled = true;
  aiRecommendListEl.innerHTML = "";
  hideInsufficientCreditBanner(aiCreditInsufficientBannerEl); // js/screens/aiCredits.js
  let lostAiAccess = false;

  try {
    const contextText = formatAiReadingContext(buildAiReadingContext());
    const message =
      "以下はユーザーのこれまでの読書記録です。\n\n" + contextText +
      "\n\n上記を踏まえて、次に読むのにおすすめの本を3〜5冊、提案してください。";

    const data = await sendChatMessage(message, {
      feature: "recommend",
      instructions: AI_RECOMMEND_INSTRUCTIONS,
      schema: AI_RECOMMEND_SCHEMA
    });

    renderAiRecommendCards(data.recommendations || []);
  } catch (error) {
    if (error.insufficientCredit) {
      showInsufficientCreditBanner(aiCreditInsufficientBannerEl);
    } else if (error.planNotEligible) {
      // ロック案内・ボタンの無効化はsendChatMessage内でapplyAiAccessStateがすでに反映済みなので、
      // このあとでボタンを再度有効化しないようにしておく
      lostAiAccess = true;
    } else {
      aiRecommendErrorEl.textContent = error.message || "おすすめ本の取得に失敗しました。";
      aiRecommendErrorEl.hidden = false;
    }
  } finally {
    aiRecommendLoadingEl.hidden = true;
    aiRecommendGenerateButton.disabled = lostAiAccess;
  }
});
