// ---------- AI分析画面 ----------
// この画面のDOM操作・イベント処理だけを担当する（View）。
// 分析データの取得・AIとの通信の判断はAnalysisViewModel／AIServiceに任せる。

const aiAnalysisRunButton = document.getElementById("ai-analysis-run-button");
const aiAnalysisLoading = document.getElementById("ai-analysis-loading");
const aiAnalysisError = document.getElementById("ai-analysis-error");
const aiAnalysisResult = document.getElementById("ai-analysis-result");
const aiAnalysisTrendsList = document.getElementById("ai-analysis-trends");
const aiAnalysisStrengthsList = document.getElementById("ai-analysis-strengths");
const aiAnalysisGapsList = document.getElementById("ai-analysis-gaps");
const aiAnalysisNextTheme = document.getElementById("ai-analysis-next-theme");
const aiAnalysisRecommendationsList = document.getElementById("ai-analysis-recommendations");

// 文字列の配列を、そのままリスト表示する
function renderStringList(ulElement, items) {
  ulElement.innerHTML = "";
  items.forEach(function (text) {
    const li = document.createElement("li");
    li.textContent = text;
    ulElement.appendChild(li);
  });
}

// おすすめの本1冊ぶんのカードを組み立てる。
// 書影はGoogle Books検索（bookSearch.jsのsearchBooksByTitleを流用）で見つかったときだけ表示し、
// 見つからなくてもプレースホルダーのまま表示を続ける（あくまで「可能であれば」の付加情報のため）。
function buildRecommendationCard(recommendation) {
  const li = document.createElement("li");
  li.className = "ai-analysis-recommendation-card";

  const coverWrap = document.createElement("div");
  coverWrap.className = "ai-analysis-recommendation-cover-wrap";

  const coverImg = document.createElement("img");
  coverImg.className = "ai-analysis-recommendation-cover";
  coverImg.alt = recommendation.title;
  coverImg.hidden = true;
  coverWrap.appendChild(coverImg);

  const coverPlaceholder = document.createElement("span");
  coverPlaceholder.className = "ai-analysis-recommendation-cover-placeholder";
  coverPlaceholder.textContent = "📕";
  coverWrap.appendChild(coverPlaceholder);

  li.appendChild(coverWrap);

  const info = document.createElement("div");
  info.className = "ai-analysis-recommendation-info";

  const titleEl = document.createElement("p");
  titleEl.className = "ai-analysis-recommendation-title";
  titleEl.textContent = recommendation.title;
  info.appendChild(titleEl);

  if (recommendation.author) {
    const authorEl = document.createElement("p");
    authorEl.className = "ai-analysis-recommendation-author";
    authorEl.textContent = recommendation.author;
    info.appendChild(authorEl);
  }

  if (recommendation.reason) {
    const reasonEl = document.createElement("p");
    reasonEl.className = "ai-analysis-recommendation-reason";
    reasonEl.textContent = recommendation.reason;
    info.appendChild(reasonEl);
  }

  li.appendChild(info);

  searchBooksByTitle(
    recommendation.title,
    function (results) {
      if (results.length > 0 && results[0].coverImage) {
        coverImg.src = results[0].coverImage;
        coverImg.hidden = false;
        coverPlaceholder.hidden = true;
      }
    },
    function () {
      // 見つからなくてもエラーにはしない（書影は無くても分析結果自体は表示できるため）
    }
  );

  return li;
}

// 分析結果（AnalysisViewModel経由でAIServiceから返ってきたオブジェクト）を画面に表示する
function renderAnalysisResult(result) {
  renderStringList(aiAnalysisTrendsList, result.trends);
  renderStringList(aiAnalysisStrengthsList, result.strengths);
  renderStringList(aiAnalysisGapsList, result.gaps);
  aiAnalysisNextTheme.textContent = result.nextTheme || "特にありませんでした。";

  aiAnalysisRecommendationsList.innerHTML = "";
  result.recommendations.forEach(function (recommendation) {
    aiAnalysisRecommendationsList.appendChild(buildRecommendationCard(recommendation));
  });

  aiAnalysisResult.hidden = false;
}

const aiAnalysisCallbacks = {
  onStart: function () {
    aiAnalysisError.hidden = true;
    aiAnalysisResult.hidden = true;
    aiAnalysisLoading.hidden = false;
    aiAnalysisRunButton.disabled = true;
  },
  onSuccess: function (result) {
    aiAnalysisLoading.hidden = true;
    aiAnalysisRunButton.disabled = false;
    aiAnalysisRunButton.textContent = "🔄 読書履歴を再分析する";
    renderAnalysisResult(result);
  },
  onError: function (displayMessage) {
    aiAnalysisLoading.hidden = true;
    aiAnalysisRunButton.disabled = false;
    aiAnalysisError.textContent = displayMessage;
    aiAnalysisError.hidden = false;
  }
};

aiAnalysisRunButton.addEventListener("click", function () {
  AnalysisViewModel.runAnalysis(aiAnalysisCallbacks);
});

// AI分析画面を開くたびに呼ばれる。
// 前回の分析結果があれば再送信せずにそのまま表示し、無ければ最初の状態を表示する。
function renderAiAnalysisScreen() {
  aiAnalysisError.hidden = true;
  aiAnalysisLoading.hidden = true;

  if (AnalysisViewModel.lastResult) {
    aiAnalysisRunButton.textContent = "🔄 読書履歴を再分析する";
    renderAnalysisResult(AnalysisViewModel.lastResult);
  } else {
    aiAnalysisRunButton.textContent = "📊 読書履歴を分析する";
    aiAnalysisResult.hidden = true;
  }
}
