// ---------- 料金プラン画面 ----------
// /api/plans（プラン一覧。api/_lib/aiCredits.jsのPLAN_CATALOGが唯一の情報源）と、
// /api/credits（今ログインしているユーザーの現在のプラン）を取得してカードを描画する。
//
// 各プランのボタンは、現時点では決済処理を実装していないダミーボタン（handlePlanButtonClick参照）。
// 将来Stripeを接続するときは、そこを実際の決済ページ（Stripe Checkout等）へのリダイレクトに
// 差し替えるだけでよい（プランごとのstripePriceIdは、api/_lib/aiCredits.jsのPLAN_CATALOGに
// あらかじめ用意してある）。

const pricingCardsEl = document.getElementById("pricing-cards");

let pricingPlansCache = null; // /api/plansの結果（価格・機能は毎回変わらないため、一度取れたら使い回す）

function formatYen(priceYen) {
  return priceYen === 0 ? "¥0" : "¥" + priceYen.toLocaleString("ja-JP");
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
    credits.textContent = plan.monthlyCredits.toLocaleString("ja-JP") + "クレジット / 月（仮）";
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

  const button = document.createElement("button");
  button.type = "button";
  button.className = "pricing-card-button";

  if (plan.key === currentPlanKey) {
    button.textContent = "現在のプラン";
    button.disabled = true;
    button.classList.add("pricing-card-button-current");
  } else {
    button.textContent = plan.buttonLabel;
    button.addEventListener("click", function () {
      handlePlanButtonClick(plan);
    });
  }
  card.appendChild(button);

  return card;
}

// 各プランのボタンを押したときの処理（現時点ではダミー）。
// 将来Stripeを接続するときは、ここをStripe Checkoutなどへのリダイレクトに差し替える
function handlePlanButtonClick(plan) {
  showToast(plan.label + "への変更は、現在準備中です。"); // js/screens/app.js
}

// 今ログインしているユーザーの現在のプランを取得する（未取得・未ログイン時は"free"扱い）
async function fetchCurrentPlanKey() {
  if (!window.sb) {
    return "free";
  }
  const { data: sessionData } = await window.sb.auth.getSession();
  const accessToken = sessionData.session ? sessionData.session.access_token : null;
  if (!accessToken) {
    return "free";
  }

  try {
    const response = await fetch("/api/credits", {
      headers: { Authorization: "Bearer " + accessToken }
    });
    const data = await response.json();
    return response.ok && data.credits ? data.credits.plan : "free";
  } catch (error) {
    console.error("[pricing] 現在のプランの取得に失敗しました:", error);
    return "free";
  }
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
