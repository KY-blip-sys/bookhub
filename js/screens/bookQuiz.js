// ---------- 本の詳細画面：「クイズ」タブ ----------
// 開いている本の学習内容（学んだこと・感想・メモ・ハイライト。js/services/aiContext.js）だけを材料に、
// その本の理解度クイズを作る。生成〜出題〜採点の共通処理はjs/screens/aiQuiz.jsのcreateAiQuizControllerに任せ、
// ここでは「今開いている本に絞り込む」ことと、本を切り替えたときのリセットだけを行う。

// 直前に「クイズ」タブを開いていた本のid（別の本に切り替わったらクイズをリセットするために覚えておく）
let bookQuizCurrentBookId = null;

const bookQuizErrorEl = document.getElementById("detail-quiz-error");

function getBookQuizContext() {
  const context = filterAiContextForQuiz(buildAiReadingContext()); // js/services/aiContext.js
  const book = context.find(function (b) {
    return b.id === bookQuizCurrentBookId;
  });

  if (!book) {
    bookQuizErrorEl.textContent =
      "この本の学んだこと・感想・ハイライトがまだありません。読書記録にメモや感想を書いてから、もう一度お試しください。";
    bookQuizErrorEl.hidden = false;
    return null;
  }

  return { contextText: formatAiLearningsContext(context, bookQuizCurrentBookId) }; // js/services/aiContext.js
}

const bookQuizController = createAiQuizController(
  {
    introEl: document.getElementById("detail-quiz-intro"),
    startButton: document.getElementById("detail-quiz-start-button"),
    loadingEl: document.getElementById("detail-quiz-loading"),
    errorEl: bookQuizErrorEl,
    questionSection: document.getElementById("detail-quiz-question-section"),
    progressEl: document.getElementById("detail-quiz-progress"),
    questionTextEl: document.getElementById("detail-quiz-question-text"),
    choicesEl: document.getElementById("detail-quiz-choices"),
    explanationEl: document.getElementById("detail-quiz-explanation"),
    nextButton: document.getElementById("detail-quiz-next-button"),
    resultSection: document.getElementById("detail-quiz-result-section"),
    scoreTextEl: document.getElementById("detail-quiz-score-text"),
    commentEl: document.getElementById("detail-quiz-comment"),
    retryButton: document.getElementById("detail-quiz-retry-button"),
    creditBannerEl: document.getElementById("detail-quiz-credit-banner")
  },
  getBookQuizContext
);

// 本の詳細画面で「クイズ」タブを開いたときの処理（js/screens/app.jsのshowDetailTabから呼ばれる）
function prepareBookQuizTab(bookId) {
  if (bookId !== bookQuizCurrentBookId) {
    // 別の本に切り替わったので、前の本のクイズ結果は残さずリセットする
    bookQuizCurrentBookId = bookId;
    bookQuizController.resetToIntro();
  }
  refreshAiAccessStatus(); // js/screens/aiCredits.js：AI利用可否・残高を最新化する
}
