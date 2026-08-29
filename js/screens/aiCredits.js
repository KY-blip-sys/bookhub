// ---------- AIクレジット・AI利用可否の表示 ----------
// AI利用可否・クレジットの判定はすべてサーバー側（/api/chat, /api/credits）で行う。
// ここは「サーバーから返ってきた最新の状態を画面に反映する」表示専用の処理で、
// AI画面（js/screens/aiTabs.js）・本の詳細画面「AIに質問」タブ（js/screens/bookQuestion.js）の
// どちらからも共通で使う。

// ---------- AI画面：AIクレジットカード（Premium/Proのとき）／ロック案内（Free/Plusのとき） ----------

const aiLockedNoticeEl = document.getElementById("ai-locked-notice");
const aiCreditCardEl = document.getElementById("ai-credit-card");
const aiCreditCardPlanEl = document.getElementById("ai-credit-card-plan");
const aiCreditCardAmountEl = document.getElementById("ai-credit-card-amount");
const aiCreditProgressBarEl = document.getElementById("ai-credit-progress-bar");
const aiCreditUsageListEl = document.getElementById("ai-credit-usage-list");
const aiCreditExplainToggle = document.getElementById("ai-credit-explain-toggle");
const aiCreditExplainText = document.getElementById("ai-credit-explain-text");

// AI画面（チャット／おすすめ本／クイズ／要約／学習コーチ、5タブ共通）の残高不足バナー
const aiCreditInsufficientBannerEl = document.getElementById("ai-credit-insufficient-banner");

// 本の詳細画面「AIに質問」タブ
const bookQuestionLockedNoticeEl = document.getElementById("book-question-locked-notice");

const PLAN_DISPLAY_LABELS = { free: "Free", plus: "Plus", premium: "Premium", pro: "Pro" };

function formatPlanLabel(planKey) {
  return PLAN_DISPLAY_LABELS[planKey] || planKey;
}

// AI機能の入力欄・送信ボタンをまとめてロック／解除する。
// 各画面ファイル（aiChat.js等）より先に読み込まれるため、要素は都度取得する
function setAiControlsLocked(isLocked) {
  [
    "ai-chat-input",
    "ai-chat-send-button",
    "ai-recommend-generate-button",
    "ai-quiz-start-button",
    "ai-summary-generate-button",
    "ai-coach-generate-button",
    "book-question-input",
    "book-question-send-button"
  ].forEach(function (id) {
    const el = document.getElementById(id);
    if (el) {
      el.disabled = isLocked;
    }
  });
}

function renderAiCreditCard(status) {
  if (aiCreditCardPlanEl) {
    aiCreditCardPlanEl.textContent = formatPlanLabel(status.plan);
  }
  if (aiCreditCardAmountEl) {
    aiCreditCardAmountEl.textContent = status.remaining + " / " + status.monthlyLimit;
  }
  if (aiCreditProgressBarEl) {
    const percent = status.monthlyLimit > 0
      ? Math.max(0, Math.min(100, Math.round((status.remaining / status.monthlyLimit) * 100)))
      : 0;
    aiCreditProgressBarEl.style.width = percent + "%";
  }
}

function renderAiCreditUsageList(featureCosts) {
  if (!aiCreditUsageListEl || !featureCosts) {
    return;
  }
  aiCreditUsageListEl.innerHTML = "";
  featureCosts.forEach(function (item) {
    const li = document.createElement("li");
    const label = document.createElement("span");
    label.textContent = item.label;
    const cost = document.createElement("span");
    cost.textContent = item.cost + "クレジット";
    li.appendChild(label);
    li.appendChild(cost);
    aiCreditUsageListEl.appendChild(li);
  });
}

// サーバーから返ってきた最新の状態（{ plan, remaining, monthlyLimit, aiEnabled }）を、
// AI画面・本についての質問タブの両方に反映する
function applyAiAccessState(status) {
  if (!status) {
    return;
  }

  setAiControlsLocked(!status.aiEnabled);

  if (aiLockedNoticeEl) {
    aiLockedNoticeEl.hidden = !!status.aiEnabled;
  }
  if (aiCreditCardEl) {
    aiCreditCardEl.hidden = !status.aiEnabled;
  }
  if (bookQuestionLockedNoticeEl) {
    bookQuestionLockedNoticeEl.hidden = !!status.aiEnabled;
  }

  const bookQuestionBannerEl = document.getElementById("book-question-credit-banner");

  if (status.aiEnabled) {
    renderAiCreditCard(status);
    // 残高を使い切っている場合は、AI機能を使おうとして初めて気づく前に案内しておく
    if (status.remaining <= 0) {
      showInsufficientCreditBanner(aiCreditInsufficientBannerEl);
      showInsufficientCreditBanner(bookQuestionBannerEl);
    } else {
      hideInsufficientCreditBanner(aiCreditInsufficientBannerEl);
      hideInsufficientCreditBanner(bookQuestionBannerEl);
    }
  } else {
    // AI自体が使えないプランのときは、残高不足バナーの出番はない
    hideInsufficientCreditBanner(aiCreditInsufficientBannerEl);
    hideInsufficientCreditBanner(bookQuestionBannerEl);
  }
}

// AI画面・本についての質問タブを開いたときなど、最新の状態を取りに行って表示する
// （消費はしない。/api/credits参照。月替わりのリセットはここで反映される）
async function refreshAiAccessStatus() {
  if (!window.sb) {
    return;
  }
  const { data: sessionData } = await window.sb.auth.getSession();
  const accessToken = sessionData.session ? sessionData.session.access_token : null;
  if (!accessToken) {
    return;
  }

  try {
    const response = await fetch("/api/credits", {
      headers: { Authorization: "Bearer " + accessToken }
    });
    const data = await response.json();
    if (response.ok && data.credits) {
      applyAiAccessState(data.credits);
      renderAiCreditUsageList(data.featureCosts);
    } else {
      console.error("[aiCredits] 残高の取得に失敗しました:", data);
    }
  } catch (error) {
    console.error("[aiCredits] 残高の取得中にエラーが発生しました:", error);
  }
}

// 「AIクレジットとは？」の開閉
if (aiCreditExplainToggle && aiCreditExplainText) {
  aiCreditExplainToggle.addEventListener("click", function () {
    const willShow = aiCreditExplainText.hidden;
    aiCreditExplainText.hidden = !willShow;
    aiCreditExplainToggle.setAttribute("aria-expanded", String(willShow));
  });
}

// ---------- 残高不足バナー（AI画面・本についての質問タブに、それぞれ1つずつ静的に置いてある） ----------

function showInsufficientCreditBanner(bannerEl) {
  if (bannerEl) {
    bannerEl.hidden = false;
  }
}

function hideInsufficientCreditBanner(bannerEl) {
  if (bannerEl) {
    bannerEl.hidden = true;
  }
}

document.querySelectorAll(".ai-credit-insufficient-banner").forEach(function (banner) {
  const closeButton = banner.querySelector(".ai-credit-insufficient-close-button");
  if (closeButton) {
    closeButton.addEventListener("click", function () {
      hideInsufficientCreditBanner(banner);
    });
  }
});
