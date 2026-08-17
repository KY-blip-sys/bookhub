// ---------- AI読書コーチ画面 ----------
// この画面のDOM操作・イベント処理だけを担当する（View）。
// 実際の判断や通信はAiCoachViewModel／ReadingCoachViewModelに任せる。

const aiCoachForm = document.getElementById("ai-coach-form");
const aiCoachInput = document.getElementById("ai-coach-input");
const aiCoachSendButton = document.getElementById("ai-coach-send-button");
const aiCoachError = document.getElementById("ai-coach-error");
const aiCoachLoading = document.getElementById("ai-coach-loading");
const aiCoachResponseCard = document.getElementById("ai-coach-response-card");
const aiCoachResponseText = document.getElementById("ai-coach-response-text");

// 本の文脈つきで開いたときのパネルまわり
const aiCoachBookPanel = document.getElementById("ai-coach-book-panel");
const aiCoachBookTitle = document.getElementById("ai-coach-book-title");
const aiCoachBookMeta = document.getElementById("ai-coach-book-meta");
const aiCoachGenericQuickActions = document.getElementById("ai-coach-generic-quick-actions");
const aiCoachClearBookContextButton = document.getElementById("ai-coach-clear-book-context-button");

// クイックアクション扱いのボタン（本専用・汎用のどちらも、通信中はまとめて無効化する）
function getAllQuickActionButtons() {
  return document.querySelectorAll(".ai-coach-quick-action-button");
}

// 汎用のクイックアクション：押すと定型文を入力欄にセットするだけ（送信はしない。ユーザーが内容を確認してから送信する）
document.querySelectorAll("#ai-coach-generic-quick-actions .ai-coach-quick-action-button").forEach(function (button) {
  button.addEventListener("click", function () {
    aiCoachInput.value = button.dataset.prompt;
    aiCoachInput.focus();
  });
});

// 本専用のクイックアクション：押すと読書データ入りのプロンプトをAIへ自動送信する（ユーザーの入力は不要）
document.querySelectorAll("[data-reading-action]").forEach(function (button) {
  button.addEventListener("click", function () {
    ReadingCoachViewModel.runAction(button.dataset.readingAction, aiCoachCallbacks);
  });
});

// 「本の文脈を解除して、自由に質問する」ボタン
aiCoachClearBookContextButton.addEventListener("click", function () {
  ReadingCoachViewModel.clearBookContext();
  renderAiCoachScreen();
});

// 本の読書データを、画面に表示する短いテキストにまとめる（AIへ渡す文章はReadingCoachViewModel側で組み立てる）
function buildBookMetaText(context) {
  const parts = [];
  if (context.author) {
    parts.push(context.author);
  }
  parts.push(context.isFinished ? "読了" : "読書中");
  if (context.pageCount) {
    parts.push(context.currentPage + " / " + context.pageCount + "ページ");
  }
  parts.push("記録" + context.recordCount + "件");
  return parts.join(" ・ ");
}

// AI読書コーチ画面を開くたびに呼ばれる。本の文脈があるかどうかで表示を出し分ける。
function renderAiCoachScreen() {
  aiCoachError.hidden = true;
  aiCoachLoading.hidden = true;
  aiCoachResponseCard.hidden = true;
  aiCoachInput.value = "";

  const context = ReadingCoachViewModel.bookContext;
  if (context) {
    aiCoachBookPanel.hidden = false;
    aiCoachGenericQuickActions.hidden = true;
    aiCoachBookTitle.textContent = context.title;
    aiCoachBookMeta.textContent = buildBookMetaText(context);
  } else {
    aiCoachBookPanel.hidden = true;
    aiCoachGenericQuickActions.hidden = false;
  }
}

// AIの返答を読みやすく表示する。
// 「- 」「・」「1. 」などで始まる行はまとめてリストにし、それ以外は段落として、改行を保ったまま表示する。
function renderAiCoachResponse(container, text) {
  container.innerHTML = "";

  const bulletPattern = /^\s*[-・*]\s+/;
  const numberedPattern = /^\s*\d+[.)]\s+/;
  let currentList = null;
  let currentListType = null;

  function getLineListType(line) {
    if (bulletPattern.test(line)) {
      return "ul";
    }
    if (numberedPattern.test(line)) {
      return "ol";
    }
    return null;
  }

  function stripListMarker(line, listType) {
    return line.replace(listType === "ul" ? bulletPattern : numberedPattern, "");
  }

  text.split(/\r?\n/).forEach(function (line) {
    if (!line.trim()) {
      currentList = null;
      currentListType = null;
      return;
    }

    const listType = getLineListType(line);
    if (listType) {
      if (currentListType !== listType) {
        currentList = document.createElement(listType);
        currentList.className = "ai-coach-response-" + (listType === "ul" ? "bullet-list" : "numbered-list");
        container.appendChild(currentList);
        currentListType = listType;
      }
      const li = document.createElement("li");
      li.textContent = stripListMarker(line, listType);
      currentList.appendChild(li);
    } else {
      currentList = null;
      currentListType = null;
      const p = document.createElement("p");
      p.textContent = line;
      container.appendChild(p);
    }
  });

  if (!container.children.length) {
    const p = document.createElement("p");
    p.textContent = text;
    container.appendChild(p);
  }
}

// フォーム送信・クイックアクションのどちらからでも使う、共通のコールバック
// （通信中はローディング表示を出し、送信系のボタンをまとめて無効化する）
const aiCoachCallbacks = {
  onStart: function () {
    aiCoachError.hidden = true;
    aiCoachResponseCard.hidden = true;
    aiCoachLoading.hidden = false;
    aiCoachSendButton.disabled = true;
    getAllQuickActionButtons().forEach(function (button) {
      button.disabled = true;
    });
  },
  onSuccess: function (replyText) {
    aiCoachLoading.hidden = true;
    renderAiCoachResponse(aiCoachResponseText, replyText);
    aiCoachResponseCard.hidden = false;
    aiCoachSendButton.disabled = false;
    getAllQuickActionButtons().forEach(function (button) {
      button.disabled = false;
    });
  },
  onError: function (displayMessage) {
    aiCoachLoading.hidden = true;
    aiCoachError.textContent = displayMessage;
    aiCoachError.hidden = false;
    aiCoachSendButton.disabled = false;
    getAllQuickActionButtons().forEach(function (button) {
      button.disabled = false;
    });
  }
};

aiCoachForm.addEventListener("submit", function (event) {
  event.preventDefault();
  AiCoachViewModel.sendUserMessage(aiCoachInput.value, aiCoachCallbacks);
});

// ---------- 「コーチに相談」「読書を分析」タブの切り替え ----------

const aiTabButtons = document.querySelectorAll(".ai-tab-button");
const aiCoachPanel = document.getElementById("ai-coach-panel");
const aiAnalysisPanel = document.getElementById("ai-analysis-panel");

// 指定したタブ（"coach" | "analysis"）を表示し、その中身を最新の状態にする
function showAiTab(tabName) {
  aiTabButtons.forEach(function (button) {
    button.classList.toggle("active", button.dataset.aiTab === tabName);
  });
  aiCoachPanel.hidden = tabName !== "coach";
  aiAnalysisPanel.hidden = tabName !== "analysis";

  if (tabName === "coach") {
    renderAiCoachScreen();
  } else {
    renderAiAnalysisScreen(); // aiAnalysis.js
  }
}

aiTabButtons.forEach(function (button) {
  button.addEventListener("click", function () {
    showAiTab(button.dataset.aiTab);
  });
});
