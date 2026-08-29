// ---------- AIクレジットの残高表示・不足時の案内 ----------
// クレジットの判定・消費はすべてサーバー側（/api/chat, /api/credits）で行う。
// ここは「サーバーから返ってきた最新の残高を画面に反映する」表示専用の処理で、
// AI画面（js/screens/aiTabs.js）・本の詳細画面「AIに質問」タブ（js/screens/bookQuestion.js）の
// どちらからも共通で使う。

const aiCreditBadgeEl = document.getElementById("ai-credit-badge");
const aiCreditBadgePlanEl = document.getElementById("ai-credit-badge-plan");
const aiCreditBadgeAmountEl = document.getElementById("ai-credit-badge-amount");

// AI画面（チャット／おすすめ本／クイズ／要約／学習コーチ、5タブ共通）の残高不足バナー
const aiCreditInsufficientBannerEl = document.getElementById("ai-credit-insufficient-banner");

// サーバーから返ってきた残高（{ plan, remaining, monthlyLimit }）を、画面上部のバッジに反映する
function applyAiCreditStatus(status) {
  if (!status || !aiCreditBadgeEl) {
    return;
  }
  aiCreditBadgePlanEl.textContent = status.plan === "premium" ? "Premium" : "AIクレジット";
  aiCreditBadgeAmountEl.textContent = status.remaining + " / " + status.monthlyLimit;
  aiCreditBadgeEl.hidden = false;
}

// AI画面を開いたときなど、最新の残高を取りに行って表示する（消費はしない。/api/credits参照）
async function refreshAiCreditBadge() {
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
      applyAiCreditStatus(data.credits);
    } else {
      console.error("[aiCredits] 残高の取得に失敗しました:", data);
    }
  } catch (error) {
    console.error("[aiCredits] 残高の取得中にエラーが発生しました:", error);
  }
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

// ---------- プレミアムプランの案内モーダル ----------

const premiumInfoModal = document.getElementById("premium-info-modal");
const premiumInfoCloseButton = document.getElementById("premium-info-close-button");

function openPremiumInfoModal() {
  if (premiumInfoModal) {
    premiumInfoModal.hidden = false;
  }
}

function closePremiumInfoModal() {
  if (premiumInfoModal) {
    premiumInfoModal.hidden = true;
  }
}

// 残高不足バナー内の「プレミアムを見る」ボタンは、複数箇所に静的に置いてあるためまとめて拾う
document.querySelectorAll("[data-open-premium-info]").forEach(function (button) {
  button.addEventListener("click", openPremiumInfoModal);
});

if (premiumInfoCloseButton) {
  premiumInfoCloseButton.addEventListener("click", closePremiumInfoModal);
}

if (premiumInfoModal) {
  bindModalDismissal(premiumInfoModal, closePremiumInfoModal); // js/screens/modal.js
}
