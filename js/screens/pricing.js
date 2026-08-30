// ---------- 料金プラン画面 ----------
// /api/plans（プラン一覧。api/_lib/aiCredits.jsのPLAN_CATALOGが唯一の情報源）と、
// /api/credits（今ログインしているユーザーの現在のプラン・契約状況）を取得してカードを描画する。
//
// 「Plusにアップグレード」「Premiumにアップグレード」ボタンは、api/stripe/create-checkout-session.js を
// 呼んでStripe Checkoutの決済ページURLを受け取り、そこへブラウザごと遷移させる
// （プランごとのStripe Price IDはサーバー側の環境変数にのみ置いてあり、ここでは扱わない）。
// 決済が成功したかどうかの反映（プランの更新）は、Stripe Webhook（api/stripe/webhook.js）が行うため、
// この画面に戻ってきた直後はまだ反映が終わっていないことがある
// （?checkout=success/cancel の案内文はjs/screens/auth.jsのhandleCheckoutRedirect参照）。

const pricingCardsEl = document.getElementById("pricing-cards");

let pricingPlansCache = null; // /api/plansの結果（価格・機能は毎回変わらないため、一度取れたら使い回す）
let currentSubscriptionCache = null; // /api/credits由来のsubscription（status・expiresAt）

function formatYen(priceYen) {
  return priceYen === 0 ? "¥0" : "¥" + priceYen.toLocaleString("ja-JP");
}

function formatDateJa(isoString) {
  if (!isoString) {
    return null;
  }
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric" });
}

function buildPricingCard(plan, currentPlanKey) {
  const card = document.createElement("div");
  card.className = "pricing-card" + (plan.highlight ? " pricing-card-highlight" : "");

  if (plan.highlight) {
    const badge = document.createElement("span");
    badge.className = "pricing-card-badge";
    badge.textContent = "おすすめ";
    card.appendChild(badge);
  }

  const title = document.createElement("h3");
  title.className = "pricing-card-title";
  title.textContent = plan.label;
  card.appendChild(title);

  const price = document.createElement("p");
  price.className = "pricing-card-price";
  price.textContent = formatYen(plan.priceYen) + " / 月";
  card.appendChild(price);

  if (plan.aiEnabled) {
    const credits = document.createElement("p");
    credits.className = "pricing-card-credits";
    credits.textContent = plan.monthlyCredits.toLocaleString("ja-JP") + "クレジット / 月";
    card.appendChild(credits);
  }

  const featureList = document.createElement("ul");
  featureList.className = "pricing-card-features";
  plan.features.forEach(function (feature) {
    const li = document.createElement("li");
    li.textContent = feature;
    featureList.appendChild(li);
  });
  card.appendChild(featureList);

  const adsLine = document.createElement("p");
  adsLine.className = "pricing-card-ads";
  adsLine.textContent = "広告：" + (plan.ads ? "あり" : "なし");
  card.appendChild(adsLine);

  if (plan.key === currentPlanKey && currentSubscriptionCache) {
    const statusNote = document.createElement("p");
    statusNote.className = "pricing-card-status";
    if (currentSubscriptionCache.status === "canceled") {
      const expiresAtJa = formatDateJa(currentSubscriptionCache.expiresAt);
      statusNote.textContent = expiresAtJa
        ? "解約手続き済み（" + expiresAtJa + "まで利用できます）"
        : "解約手続き済みです。";
      card.appendChild(statusNote);
    } else if (currentSubscriptionCache.status === "active") {
      const expiresAtJa = formatDateJa(currentSubscriptionCache.expiresAt);
      if (expiresAtJa) {
        statusNote.textContent = "次回更新日：" + expiresAtJa;
        card.appendChild(statusNote);
      }
    }
  }

  const button = document.createElement("button");
  button.type = "button";
  button.className = "pricing-card-button";

  if (plan.key === currentPlanKey) {
    button.textContent = "現在のプラン";
    button.disabled = true;
    button.classList.add("pricing-card-button-current");
  } else {
    button.textContent = plan.label;
    button.addEventListener("click", function () {
      handlePlanButtonClick(plan, button);
    });
  }
  card.appendChild(button);

  return card;
}

// Stripe Checkoutに接続済みのプラン（Plus・Premium）のキー一覧
const STRIPE_CHECKOUT_PLAN_KEYS = ["plus", "premium"];

// 各プランのボタンを押したときの処理。
// Plus・Premiumなら api/stripe/create-checkout-session.js を呼び、返ってきたStripe Checkoutの
// 決済ページへ遷移する。それ以外（Free・Pro）は決済処理が未対応のため案内のみ表示する
async function handlePlanButtonClick(plan, button) {
  if (STRIPE_CHECKOUT_PLAN_KEYS.indexOf(plan.key) === -1) {
    showToast(plan.label + "への変更は、現在準備中です。");
    return;
  }

  if (!window.sb) {
    showToast("ログインしてからお試しください。");
    return;
  }

  const { data: sessionData } = await window.sb.auth.getSession();
  const accessToken = sessionData.session ? sessionData.session.access_token : null;
  if (!accessToken) {
    showToast("ログインしてからお試しください。");
    return;
  }

  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = "決済ページを準備中…";

  try {
    const response = await fetch("/api/stripe/create-checkout-session", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + accessToken
      },
      body: JSON.stringify({ plan: plan.key })
    });
    const data = await response.json();

    if (!response.ok || !data.url) {
      showToast(data.error || "決済ページの作成に失敗しました。");
      button.disabled = false;
      button.textContent = originalText;
      return;
    }

    location.href = data.url; // Stripe Checkoutへ遷移する（戻りはjs/screens/auth.jsのhandleCheckoutRedirect参照）
  } catch (error) {
    console.error("[pricing] Checkoutセッションの作成に失敗しました:", error);
    showToast("通信エラーが発生しました。しばらくしてから再度お試しください。");
    button.disabled = false;
    button.textContent = originalText;
  }
}

// 今ログインしているユーザーの現在のプランを取得する（未取得・未ログイン時は"free"扱い）。
// 合わせてcurrentSubscriptionCache（次回更新日・解約予定の表示用）も更新する。
// 実際の取得はjs/services/planStatus.jsの共通窓口（fetchPlanStatus）に任せる
// （他の画面と同じく、ここで個別にfetch・トークン取得を行わない）
async function fetchCurrentPlanKey() {
  const status = await fetchPlanStatus();
  currentSubscriptionCache = status.subscription || null;
  return status.plan;
}

// 料金プラン画面を開いたときの処理（js/screens/app.jsのgoToNavPageから呼ばれる）
async function preparePricingScreen() {
  if (!pricingPlansCache) {
    try {
      const response = await fetch("/api/plans");
      const data = await response.json();
      pricingPlansCache = data.plans || [];
    } catch (error) {
      console.error("[pricing] プラン一覧の取得に失敗しました:", error);
      pricingCardsEl.textContent = "プラン一覧の取得に失敗しました。しばらくしてから再度お試しください。";
      return;
    }
  }

  const currentPlanKey = await fetchCurrentPlanKey();

  pricingCardsEl.innerHTML = "";
  pricingPlansCache.forEach(function (plan) {
    pricingCardsEl.appendChild(buildPricingCard(plan, currentPlanKey));
  });
}
