// ---------- AIクイズ（Phase3） ----------
// 読書メモ・感想（js/services/aiContext.js）から、理解度を確認する4択クイズをAIに作らせる。
// 通信はjs/services/aiChat.jsのsendChatMessage()経由で、共通の/api/chatだけを使う。

const AI_QUIZ_SCHEMA = {
  name: "reading_quiz",
  schema: {
    type: "object",
    properties: {
      questions: {
        type: "array",
        minItems: 3,
        maxItems: 5,
        items: {
          type: "object",
          properties: {
            question: { type: "string", description: "問題文" },
            choices: {
              type: "array",
              minItems: 4,
              maxItems: 4,
              items: { type: "string" },
              description: "選択肢（必ず4つ、正解は1つだけ含める）"
            },
            correctIndex: { type: "integer", enum: [0, 1, 2, 3], description: "choicesの中で正解の位置（0始まり）" },
            explanation: { type: "string", description: "なぜその答えが正解なのかの解説" }
          },
          required: ["question", "choices", "correctIndex", "explanation"],
          additionalProperties: false
        }
      }
    },
    required: ["questions"],
    additionalProperties: false
  }
};

const AI_QUIZ_INSTRUCTIONS =
  "あなたはBookHubという読書アプリの中で、ユーザー自身が書いた読書メモ・感想から理解度クイズを作るアシスタントです。" +
  "渡された内容の理解を確認できる4択問題を日本語で作成してください。選択肢は4つとも紛らわしく、もっともらしい内容にし、" +
  "正解は1つだけにしてください。";

const AI_QUIZ_COMMENT_INSTRUCTIONS =
  "あなたはBookHubという読書アプリの中で、読書理解度クイズの結果に短いコメントを送るアシスタントです。" +
  "前向きで励みになる日本語のコメントを2〜3文で書いてください。";

const aiQuizIntroEl = document.getElementById("ai-quiz-intro");
const aiQuizStartButton = document.getElementById("ai-quiz-start-button");
const aiQuizLoadingEl = document.getElementById("ai-quiz-loading");
const aiQuizErrorEl = document.getElementById("ai-quiz-error");
const aiQuizQuestionSection = document.getElementById("ai-quiz-question-section");
const aiQuizProgressEl = document.getElementById("ai-quiz-progress");
const aiQuizQuestionTextEl = document.getElementById("ai-quiz-question-text");
const aiQuizChoicesEl = document.getElementById("ai-quiz-choices");
const aiQuizExplanationEl = document.getElementById("ai-quiz-explanation");
const aiQuizNextButton = document.getElementById("ai-quiz-next-button");
const aiQuizResultSection = document.getElementById("ai-quiz-result-section");
const aiQuizScoreTextEl = document.getElementById("ai-quiz-score-text");
const aiQuizCommentEl = document.getElementById("ai-quiz-comment");
const aiQuizRetryButton = document.getElementById("ai-quiz-retry-button");

let aiQuizQuestions = [];
let aiQuizCurrentIndex = 0;
let aiQuizCorrectCount = 0;

function resetAiQuizToIntro() {
  aiQuizQuestions = [];
  aiQuizCurrentIndex = 0;
  aiQuizCorrectCount = 0;
  aiQuizErrorEl.hidden = true;
  aiQuizQuestionSection.hidden = true;
  aiQuizResultSection.hidden = true;
  aiQuizIntroEl.hidden = false;
}

function renderAiQuizQuestion() {
  const question = aiQuizQuestions[aiQuizCurrentIndex];

  aiQuizProgressEl.textContent = "第" + (aiQuizCurrentIndex + 1) + "問 / 全" + aiQuizQuestions.length + "問";
  aiQuizQuestionTextEl.textContent = question.question;
  aiQuizExplanationEl.hidden = true;
  aiQuizNextButton.hidden = true;

  aiQuizChoicesEl.innerHTML = "";
  question.choices.forEach(function (choiceText, index) {
    const choiceButton = document.createElement("button");
    choiceButton.type = "button";
    choiceButton.className = "ai-quiz-choice-button";
    choiceButton.textContent = choiceText;
    choiceButton.addEventListener("click", function () {
      handleAiQuizAnswer(index);
    });
    aiQuizChoicesEl.appendChild(choiceButton);
  });
}

function handleAiQuizAnswer(selectedIndex) {
  const question = aiQuizQuestions[aiQuizCurrentIndex];
  const choiceButtons = aiQuizChoicesEl.querySelectorAll(".ai-quiz-choice-button");

  choiceButtons.forEach(function (button, index) {
    button.disabled = true;
    if (index === question.correctIndex) {
      button.classList.add("ai-quiz-choice-correct");
    } else if (index === selectedIndex) {
      button.classList.add("ai-quiz-choice-wrong");
    }
  });

  if (selectedIndex === question.correctIndex) {
    aiQuizCorrectCount += 1;
  }

  aiQuizExplanationEl.textContent = question.explanation;
  aiQuizExplanationEl.hidden = false;

  aiQuizNextButton.hidden = false;
  aiQuizNextButton.textContent =
    aiQuizCurrentIndex < aiQuizQuestions.length - 1 ? "次の問題へ" : "結果を見る";
}

aiQuizNextButton.addEventListener("click", async function () {
  if (aiQuizCurrentIndex < aiQuizQuestions.length - 1) {
    aiQuizCurrentIndex += 1;
    renderAiQuizQuestion();
    return;
  }

  aiQuizQuestionSection.hidden = true;
  await showAiQuizResult();
});

async function showAiQuizResult() {
  const total = aiQuizQuestions.length;
  const rate = Math.round((aiQuizCorrectCount / total) * 100);

  aiQuizScoreTextEl.textContent = "正答数 " + aiQuizCorrectCount + " / " + total + "（正答率 " + rate + "%）";
  aiQuizCommentEl.textContent = "AIがコメントを考えています…";
  aiQuizResultSection.hidden = false;

  try {
    const comment = await sendChatMessage(
      "読書理解度クイズで、正答数 " + aiQuizCorrectCount + " / " + total + "（正答率" + rate + "%）でした。この結果に対する短いコメントをください。",
      { feature: "quizComment", instructions: AI_QUIZ_COMMENT_INSTRUCTIONS }
    );
    aiQuizCommentEl.textContent = comment || "";
  } catch (error) {
    // 結果コメントはおまけの演出のため、AIクレジット不足時もクイズ結果自体は表示済みなので、
    // コメント欄を静かに空にするだけで、バナー表示などはしない
    aiQuizCommentEl.textContent = "";
  }
}

aiQuizStartButton.addEventListener("click", async function () {
  aiQuizErrorEl.hidden = true;

  const notesContext = filterAiContextWithNotes(buildAiReadingContext());
  if (notesContext.length === 0) {
    aiQuizErrorEl.textContent = "クイズを作るための読書メモ・感想がまだありません。読書記録にメモや感想を書いてから、もう一度お試しください。";
    aiQuizErrorEl.hidden = false;
    return;
  }

  aiQuizIntroEl.hidden = true;
  aiQuizLoadingEl.hidden = false;
  aiQuizStartButton.disabled = true;
  hideInsufficientCreditBanner(aiCreditInsufficientBannerEl); // js/screens/aiCredits.js
  let lostAiAccess = false;

  try {
    const contextText = formatAiReadingContext(notesContext);
    const message =
      "以下はユーザーの読書メモ・感想です。\n\n" + contextText +
      "\n\n上記の内容から理解度クイズを3〜5問作成してください。";

    const data = await sendChatMessage(message, {
      feature: "quiz",
      instructions: AI_QUIZ_INSTRUCTIONS,
      schema: AI_QUIZ_SCHEMA
    });

    aiQuizQuestions = data.questions || [];
    if (aiQuizQuestions.length === 0) {
      throw new Error("クイズを作成できませんでした。もう一度お試しください。");
    }

    aiQuizCurrentIndex = 0;
    aiQuizCorrectCount = 0;
    aiQuizQuestionSection.hidden = false;
    renderAiQuizQuestion();
  } catch (error) {
    if (error.insufficientCredit) {
      showInsufficientCreditBanner(aiCreditInsufficientBannerEl);
      aiQuizIntroEl.hidden = false;
    } else if (error.planNotEligible) {
      // ロック案内・ボタンの無効化はsendChatMessage内でapplyAiAccessStateがすでに反映済みなので、
      // このあとでボタンを再度有効化しないようにしておく
      lostAiAccess = true;
      aiQuizIntroEl.hidden = false;
    } else {
      aiQuizErrorEl.textContent = error.message || "クイズの作成に失敗しました。";
      aiQuizErrorEl.hidden = false;
      aiQuizIntroEl.hidden = false;
    }
  } finally {
    aiQuizLoadingEl.hidden = true;
    aiQuizStartButton.disabled = lostAiAccess;
  }
});

aiQuizRetryButton.addEventListener("click", function () {
  resetAiQuizToIntro();
});
