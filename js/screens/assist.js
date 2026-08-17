// ---------- AIアシストカード（Step5） ----------
// 各画面（books.js＝本を追加したとき、records.js＝記録を保存・読了したとき、
// app.js＝ダッシュボード）から呼び出される、共通のカード表示・非表示ロジックをまとめる。
// 「AIを呼んでよいか」「何をAIへ渡すか」の判断はAssistViewModelが行い、ここではその結果を描画するだけ。

// 見出し1つぶんの内容（文字列 or 文字列配列）を、カードの中に1ブロックとして追加する
function appendAssistBlock(container, label, content) {
  const block = document.createElement("div");
  block.className = "ai-assist-block";

  const labelEl = document.createElement("p");
  labelEl.className = "ai-assist-block-label";
  labelEl.textContent = label;
  block.appendChild(labelEl);

  if (Array.isArray(content)) {
    const ul = document.createElement("ul");
    ul.className = "ai-assist-block-list";
    content.forEach(function (text) {
      const li = document.createElement("li");
      li.textContent = text;
      ul.appendChild(li);
    });
    block.appendChild(ul);
  } else {
    const p = document.createElement("p");
    p.className = "ai-assist-block-text";
    p.textContent = content;
    block.appendChild(p);
  }

  container.appendChild(block);
}

// カードの中身を、ローディング表示（スピナー＋文言）に差し替える
function showAssistLoadingText(container, text) {
  container.innerHTML = "";

  const loading = document.createElement("div");
  loading.className = "ai-coach-loading";

  const spinner = document.createElement("span");
  spinner.className = "ai-coach-spinner";
  spinner.setAttribute("aria-hidden", "true");
  loading.appendChild(spinner);

  loading.appendChild(document.createTextNode(text));
  container.appendChild(loading);
}

// ---- 1. 読む目的カード（本一覧画面） ----

const purposeCard = document.getElementById("ai-assist-purpose-card");
const purposeCardBookTitle = document.getElementById("ai-assist-purpose-book-title");
const purposeCardOptions = document.getElementById("ai-assist-purpose-options");
const purposeCardCloseButton = document.getElementById("ai-assist-purpose-close-button");

purposeCardCloseButton.addEventListener("click", function () {
  purposeCard.hidden = true;
});

// 本を追加した直後に呼ばれる。読む目的の候補を取得し、選べるボタンとして表示する
function showPurposeCard(book) {
  purposeCard.hidden = true;
  purposeCardBookTitle.textContent = book.title;
  purposeCardOptions.innerHTML = "";

  AssistViewModel.suggestPurpose(book, {
    onStart: function () {
      purposeCard.hidden = false;
      const loadingItem = document.createElement("li");
      loadingItem.className = "ai-assist-loading-text";
      loadingItem.textContent = "候補を考えています…";
      purposeCardOptions.appendChild(loadingItem);
    },
    onSuccess: function (purposes) {
      purposeCardOptions.innerHTML = "";

      if (purposes.length === 0) {
        purposeCard.hidden = true;
        return;
      }

      purposes.forEach(function (purpose) {
        const li = document.createElement("li");
        const button = document.createElement("button");
        button.type = "button";
        button.className = "ai-assist-chip-button";
        button.textContent = purpose;
        button.addEventListener("click", function () {
          saveBookPurpose(book.id, purpose);
          purposeCard.hidden = true;
          if (currentBookId === book.id) {
            showDetailScreen(book.id); // 詳細画面を開いていれば、目的の表示もすぐ反映する
          }
        });
        li.appendChild(button);
        purposeCardOptions.appendChild(li);
      });
    },
    onError: function () {
      // おまけの提案のため、失敗してもエラーは表に出さず静かにカードを閉じる
      purposeCard.hidden = true;
    }
  });
}

// ---- 2・3・4. 記録後カード（本の詳細画面） ----
// 通常時は「今回の記録の振り返り」、読了時は「読了インサイト＋おすすめ本」を、同じカードに出し分けて表示する

const postRecordCard = document.getElementById("ai-assist-post-record-card");
const postRecordCardBody = document.getElementById("ai-assist-post-record-body");
const postRecordCardCloseButton = document.getElementById("ai-assist-post-record-close-button");

postRecordCardCloseButton.addEventListener("click", function () {
  postRecordCard.hidden = true;
});

// 本の詳細画面を開き直すときなど、前の本のAIカードが残らないようにする
function hidePostRecordCard() {
  postRecordCard.hidden = true;
  postRecordCardBody.innerHTML = "";
}

// 保存した記録に、振り返りようのメモが書かれているときだけ呼ばれる
function showRecordReflectionCard(book, noteText) {
  postRecordCard.hidden = true;
  postRecordCardBody.innerHTML = "";

  AssistViewModel.reflectOnRecord(
    { bookTitle: book.title, category: book.category, noteText: noteText },
    {
      onStart: function () {
        postRecordCard.hidden = false;
        showAssistLoadingText(postRecordCardBody, "AIが記録を振り返っています…");
      },
      onSuccess: function (result) {
        postRecordCardBody.innerHTML = "";
        if (result.summary) {
          appendAssistBlock(postRecordCardBody, "💡 学びの整理", result.summary);
        }
        if (result.keyPoints.length > 0) {
          appendAssistBlock(postRecordCardBody, "📌 要点", result.keyPoints);
        }
        if (result.actionIdeas.length > 0) {
          appendAssistBlock(postRecordCardBody, "✅ 実践アイデア", result.actionIdeas);
        }
        if (!postRecordCardBody.children.length) {
          postRecordCard.hidden = true;
        }
      },
      onError: function () {
        postRecordCard.hidden = true;
      }
    }
  );
}

// 今回の記録で、はじめて読了になったときに呼ばれる
function showFinishedBookCard(bookId) {
  postRecordCard.hidden = true;
  postRecordCardBody.innerHTML = "";

  AssistViewModel.generateFinishedInsights(bookId, {
    onStart: function () {
      postRecordCard.hidden = false;
      showAssistLoadingText(postRecordCardBody, "AIが読了のふりかえりを準備しています…");
    },
    onSuccess: function (result) {
      postRecordCardBody.innerHTML = "";

      if (result.mostImportant) {
        appendAssistBlock(postRecordCardBody, "🌟 この本で最も重要だったこと", result.mostImportant);
      }
      if (result.tomorrowAction) {
        appendAssistBlock(postRecordCardBody, "✅ 明日からできる行動", result.tomorrowAction);
      }
      if (result.reflectionQuestion) {
        appendAssistBlock(postRecordCardBody, "❓ 振り返りの質問", result.reflectionQuestion);
      }

      if (result.recommendations.length > 0) {
        const label = document.createElement("p");
        label.className = "ai-assist-block-label";
        label.textContent = "📚 次に読むならこちらがおすすめです";
        postRecordCardBody.appendChild(label);

        const list = document.createElement("ul");
        list.className = "ai-assist-recommendation-list";
        result.recommendations.forEach(function (recommendation) {
          // aiAnalysis.jsのbuildRecommendationCard（Google Books連携の書影取得込み）をそのまま再利用する
          list.appendChild(buildRecommendationCard(recommendation));
        });
        postRecordCardBody.appendChild(list);
      }

      if (!postRecordCardBody.children.length) {
        postRecordCard.hidden = true;
      }
    },
    onError: function () {
      postRecordCard.hidden = true;
    }
  });
}

// ---- 5. 読書目標サポートカード（ダッシュボード画面） ----

const goalCard = document.getElementById("ai-assist-goal-card");
const goalCardBody = document.getElementById("ai-assist-goal-body");
const goalCardCloseButton = document.getElementById("ai-assist-goal-close-button");

goalCardCloseButton.addEventListener("click", function () {
  goalCard.hidden = true;
});

// ダッシュボードを開くたびに呼ばれる。目標が未設定・APIキー未設定のときは何も起きない（カードは非表示のまま）
function showGoalEncouragementCard() {
  AssistViewModel.getGoalEncouragement({
    onStart: function () {
      goalCard.hidden = false;
      showAssistLoadingText(goalCardBody, "AIが今月の読書状況を確認しています…");
    },
    onSuccess: function (messages) {
      goalCardBody.innerHTML = "";

      if (messages.length === 0) {
        goalCard.hidden = true;
        return;
      }

      const ul = document.createElement("ul");
      ul.className = "ai-assist-block-list";
      messages.forEach(function (text) {
        const li = document.createElement("li");
        li.textContent = text;
        ul.appendChild(li);
      });
      goalCardBody.appendChild(ul);
    },
    onError: function () {
      goalCard.hidden = true;
    }
  });
}
