// ---------- AIクイズ（Phase3） ----------
// 読書メモ・感想・ハイライト（js/services/aiContext.js）から、理解度を確認する4択クイズをAIに作らせる。
// 通信はjs/services/aiChat.jsのsendChatMessage()経由で、共通の/api/chatだけを使う。
//
// 本1冊につき「学んだこと」の記録があればそれだけを材料にし、感想・メモとは混ぜない
// （事実＝学んだことと、主観＝感想・メモが混ざると、意味の通らない設問になりやすいため。
//   「学んだこと」の記録がそもそも無い本（小説など）だけ、感想・メモを代わりに使う。
//   js/services/aiContext.jsのformatAiLearningsContext参照）。
//
// 生成〜出題〜採点の流れは、AI画面の「クイズ」タブ（全本まとめて／本を選んで）と、
// 本の詳細画面の「クイズ」タブ（js/screens/bookQuiz.js、開いている本だけに絞る）の両方で共通のため、
// createAiQuizController()にまとめ、画面ごとのDOM要素と出題材料の作り方（getContext）だけを渡し分ける。

const AI_QUIZ_SCHEMA = {
  name: "reading_quiz",
  schema: {
    type: "object",
    properties: {
      questions: {
        type: "array",
        // 材料が少ないときに無理やり水増しさせないため、下限は1問にしておく
        // （実際に何問作るかはAI_QUIZ_INSTRUCTIONSの指示に従う）
        minItems: 1,
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
  "あなたはBookHubという読書アプリの中で、ユーザー自身が読書中に書いた学習内容（学んだこと・感想・メモ・ハイライト）から" +
  "理解度クイズを作るアシスタントです。日本語で4択問題を作成してください。以下のルールを必ず守ってください。\n" +
  "・本のタイトルや著者名など、書誌情報そのものを問う問題は絶対に作らない。\n" +
  "・渡された学習内容だけを出題対象にする。本文全体や、その本についての一般知識から出題しない。\n" +
  "・渡された学習内容に書かれていない知識を、選択肢や解説に付け足さない（正解も誤り選択肢の紛らわしさも、渡された内容の範囲で作る）。\n" +
  "・「ユーザーがこの内容を理解できているか」を確認できる問題にする。単なる感想の言い回しや細かい言葉尻は問わない。\n" +
  "・一字一句の暗記を問う問題ばかりにせず、「なぜそうなるか」「具体例は何か」など理解を問う問題も混ぜる。\n" +
  "・渡された学習内容が少ない場合は、無理に3問や5問そろえようとせず、意味の通る問題だけを作る（1〜2問だけでもよい）。\n" +
  "選択肢は4つとも紛らわしく、もっともらしい内容にし、正解は1つだけにしてください。";

const AI_QUIZ_COMMENT_INSTRUCTIONS =
  "あなたはBookHubという読書アプリの中で、読書理解度クイズの結果に短いコメントを送るアシスタントです。" +
  "前向きで励みになる日本語のコメントを2〜3文で書いてください。";

// 出題材料の作り方（getContext）を渡すと、クイズの生成〜出題〜採点までを一通り操作できる
// コントローラーを作る。elementsは画面ごとに用意されたDOM要素一式（下の2つの呼び出し箇所を参照）。
// getContextは () => { contextText } を返す関数。材料が無いときはnullを返し、自分でエラー表示まで行う
function createAiQuizController(elements, getContext) {
  let questions = [];
  let currentIndex = 0;
  let correctCount = 0;

  function resetToIntro() {
    questions = [];
    currentIndex = 0;
    correctCount = 0;
    elements.errorEl.hidden = true;
    elements.questionSection.hidden = true;
    elements.resultSection.hidden = true;
    elements.introEl.hidden = false;
  }

  function renderQuestion() {
    const question = questions[currentIndex];

    elements.progressEl.textContent = "第" + (currentIndex + 1) + "問 / 全" + questions.length + "問";
    elements.questionTextEl.textContent = question.question;
    elements.explanationEl.hidden = true;
    elements.nextButton.hidden = true;

    elements.choicesEl.innerHTML = "";
    question.choices.forEach(function (choiceText, index) {
      const choiceButton = document.createElement("button");
      choiceButton.type = "button";
      choiceButton.className = "ai-quiz-choice-button";
      choiceButton.textContent = choiceText;
      choiceButton.addEventListener("click", function () {
        handleAnswer(index);
      });
      elements.choicesEl.appendChild(choiceButton);
    });
  }

  function handleAnswer(selectedIndex) {
    const question = questions[currentIndex];
    const choiceButtons = elements.choicesEl.querySelectorAll(".ai-quiz-choice-button");

    choiceButtons.forEach(function (button, index) {
      button.disabled = true;
      if (index === question.correctIndex) {
        button.classList.add("ai-quiz-choice-correct");
      } else if (index === selectedIndex) {
        button.classList.add("ai-quiz-choice-wrong");
      }
    });

    if (selectedIndex === question.correctIndex) {
      correctCount += 1;
    }

    elements.explanationEl.textContent = question.explanation;
    elements.explanationEl.hidden = false;

    elements.nextButton.hidden = false;
    elements.nextButton.textContent = currentIndex < questions.length - 1 ? "次の問題へ" : "結果を見る";
  }

  async function showResult() {
    const total = questions.length;
    const rate = Math.round((correctCount / total) * 100);

    elements.scoreTextEl.textContent = "正答数 " + correctCount + " / " + total + "（正答率 " + rate + "%）";
    elements.commentEl.textContent = "AIがコメントを考えています…";
    elements.resultSection.hidden = false;

    try {
      const comment = await sendChatMessage(
        "読書理解度クイズで、正答数 " + correctCount + " / " + total + "（正答率" + rate + "%）でした。この結果に対する短いコメントをください。",
        { feature: "quizComment", instructions: AI_QUIZ_COMMENT_INSTRUCTIONS }
      );
      elements.commentEl.textContent = comment || "";
    } catch (error) {
      // 結果コメントはおまけの演出のため、AIクレジット不足時もクイズ結果自体は表示済みなので、
      // コメント欄を静かに空にするだけで、バナー表示などはしない
      elements.commentEl.textContent = "";
    }
  }

  elements.nextButton.addEventListener("click", async function () {
    if (currentIndex < questions.length - 1) {
      currentIndex += 1;
      renderQuestion();
      return;
    }

    elements.questionSection.hidden = true;
    await showResult();
  });

  elements.startButton.addEventListener("click", async function () {
    elements.errorEl.hidden = true;

    const context = getContext();
    if (!context) {
      return;
    }

    elements.introEl.hidden = true;
    elements.loadingEl.hidden = false;
    elements.startButton.disabled = true;
    hideInsufficientCreditBanner(elements.creditBannerEl); // js/screens/aiCredits.js
    let lostAiAccess = false;

    try {
      const message =
        "以下はユーザーが読んだ本の学習内容（学んだこと・感想・メモ・ハイライト）です。\n\n" + context.contextText +
        "\n\n上記の内容だけから理解度クイズを作成してください。内容量に応じて1〜5問（無理に数をそろえなくてよい）。";

      const data = await sendChatMessage(message, {
        feature: "quiz",
        instructions: AI_QUIZ_INSTRUCTIONS,
        schema: AI_QUIZ_SCHEMA
      });

      questions = data.questions || [];
      if (questions.length === 0) {
        throw new Error("クイズを作成できませんでした。もう一度お試しください。");
      }

      currentIndex = 0;
      correctCount = 0;
      elements.questionSection.hidden = false;
      renderQuestion();
    } catch (error) {
      if (error.insufficientCredit) {
        showInsufficientCreditBanner(elements.creditBannerEl);
        elements.introEl.hidden = false;
      } else if (error.planNotEligible) {
        // ロック案内・ボタンの無効化はsendChatMessage内でapplyAiAccessStateがすでに反映済みなので、
        // このあとでボタンを再度有効化しないようにしておく
        lostAiAccess = true;
        elements.introEl.hidden = false;
      } else {
        elements.errorEl.textContent = error.message || "クイズの作成に失敗しました。";
        elements.errorEl.hidden = false;
        elements.introEl.hidden = false;
      }
    } finally {
      elements.loadingEl.hidden = true;
      elements.startButton.disabled = lostAiAccess;
    }
  });

  elements.retryButton.addEventListener("click", function () {
    resetToIntro();
  });

  return { resetToIntro: resetToIntro };
}

// ---------- AI画面「クイズ」タブ：全本まとめて、または本を選んでクイズを作る ----------

const aiQuizBookSelect = document.getElementById("ai-quiz-book-select");
const aiQuizErrorEl = document.getElementById("ai-quiz-error");

function getGlobalAiQuizContext() {
  const context = filterAiContextForQuiz(buildAiReadingContext()); // js/services/aiContext.js
  const selectedBookId = aiQuizBookSelect.value || null;

  if (context.length === 0) {
    aiQuizErrorEl.textContent =
      "クイズを作るための読書メモ・感想・ハイライトがまだありません。読書記録にメモや感想を書いてから、もう一度お試しください。";
    aiQuizErrorEl.hidden = false;
    return null;
  }

  const isSelectedBookEligible = context.some(function (book) {
    return book.id === selectedBookId;
  });
  if (selectedBookId && !isSelectedBookEligible) {
    aiQuizErrorEl.textContent = "選んだ本の学んだこと・感想・ハイライトがまだありません。別の本を選ぶか、メモや感想を書いてから、もう一度お試しください。";
    aiQuizErrorEl.hidden = false;
    return null;
  }

  return { contextText: formatAiLearningsContext(context, selectedBookId) }; // js/services/aiContext.js
}

createAiQuizController(
  {
    introEl: document.getElementById("ai-quiz-intro"),
    startButton: document.getElementById("ai-quiz-start-button"),
    loadingEl: document.getElementById("ai-quiz-loading"),
    errorEl: aiQuizErrorEl,
    questionSection: document.getElementById("ai-quiz-question-section"),
    progressEl: document.getElementById("ai-quiz-progress"),
    questionTextEl: document.getElementById("ai-quiz-question-text"),
    choicesEl: document.getElementById("ai-quiz-choices"),
    explanationEl: document.getElementById("ai-quiz-explanation"),
    nextButton: document.getElementById("ai-quiz-next-button"),
    resultSection: document.getElementById("ai-quiz-result-section"),
    scoreTextEl: document.getElementById("ai-quiz-score-text"),
    commentEl: document.getElementById("ai-quiz-comment"),
    retryButton: document.getElementById("ai-quiz-retry-button"),
    creditBannerEl: aiCreditInsufficientBannerEl // js/screens/aiCredits.js
  },
  getGlobalAiQuizContext
);

// AI画面の「クイズ」タブを開くたびに、本の選択肢を今の登録状況で作り直す（js/screens/aiTabs.jsから呼ばれる）
function prepareAiQuizTab() {
  const selectedValue = aiQuizBookSelect.value;
  const context = filterAiContextForQuiz(buildAiReadingContext()); // js/services/aiContext.js

  aiQuizBookSelect.innerHTML = "";

  const allOption = document.createElement("option");
  allOption.value = "";
  allOption.textContent = "すべての本の学びから";
  aiQuizBookSelect.appendChild(allOption);

  context.forEach(function (book) {
    const option = document.createElement("option");
    option.value = book.id;
    option.textContent = book.title;
    aiQuizBookSelect.appendChild(option);
  });

  aiQuizBookSelect.value = selectedValue; // 作り直したあとも、選んでいた本があれば復元する
}
