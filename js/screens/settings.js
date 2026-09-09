// ---------- 設定画面 ----------

// ---------- プラン・残りAIクレジットの表示 ----------
// 現在のプラン・AIクレジット残高の取得・判定はjs/services/planStatus.jsが一括して行う。
// ここは、その結果を設定画面に表示するだけの処理（formatPlanLabelはjs/screens/aiCredits.js参照。
// プラン名の表示ラベルもここで重複して定義しない）

const settingsPlanNameEl = document.getElementById("settings-plan-name");
const settingsPlanCreditsEl = document.getElementById("settings-plan-credits");
const settingsPlanNextCreditEl = document.getElementById("settings-plan-next-credit");
const settingsSubscriptionStatusEl = document.getElementById("settings-subscription-status");
const settingsSubscriptionButton = document.getElementById("settings-subscription-button");

// 契約終了日・次回更新日の表示用（js/screens/pricing.jsのformatDateJaと同じ整形。
// 読み込み順の都合でファイルをまたいで共有せず、ここでも同じ内容を持つ）
function formatSubscriptionDateJa(isoString) {
  if (!isoString) {
    return null;
  }
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric" });
}

// AIクレジットは「月が変わったとき」に付与し直す仕様（supabase/ai_credits.sqlのcredit_reset_date判定）。
// サーバーに問い合わせなくても分かる情報なので、ここでは単純に「来月1日」を計算して表示する
function formatNextCreditGrantDate() {
  const now = new Date();
  const nextMonthFirstDay = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return (nextMonthFirstDay.getMonth() + 1) + "月" + nextMonthFirstDay.getDate() + "日";
}

function renderSettingsPlanStatus(status) {
  if (!status || !settingsPlanNameEl) {
    return;
  }
  settingsPlanNameEl.textContent = "現在のプラン：" + formatPlanLabel(status.plan);
  if (settingsPlanCreditsEl) {
    settingsPlanCreditsEl.hidden = !status.aiEnabled;
    if (status.aiEnabled) {
      settingsPlanCreditsEl.textContent = "残りAIクレジット：" + status.remaining + " / " + status.monthlyLimit;
    }
  }
  if (settingsPlanNextCreditEl) {
    settingsPlanNextCreditEl.hidden = !status.aiEnabled;
    if (status.aiEnabled) {
      settingsPlanNextCreditEl.textContent = "次回のAIクレジット付与日：" + formatNextCreditGrantDate();
    }
  }
  // 契約が有効（active・trialing）な間だけ、解約予約中かどうかに応じて案内を出し分ける。
  // 解約予約中（cancelAtPeriodEnd=true）でもstatusはactive/trialingのまま＝プラン・AI機能は
  // 契約終了日まで維持されるため、ここでは「使えなくなる」ではなく「その日まで使える」と伝える
  if (settingsSubscriptionStatusEl) {
    const subscription = status.subscription;
    const isUsable = subscription && (subscription.status === "active" || subscription.status === "trialing");
    settingsSubscriptionStatusEl.hidden = !isUsable;
    if (isUsable) {
      const expiresAtJa = formatSubscriptionDateJa(subscription.expiresAt);
      if (subscription.cancelAtPeriodEnd) {
        settingsSubscriptionStatusEl.textContent = expiresAtJa
          ? "解約予約中（" + expiresAtJa + "まで利用できます）"
          : "解約予約中です。";
      } else if (expiresAtJa) {
        settingsSubscriptionStatusEl.textContent = "次回更新日：" + expiresAtJa;
      } else {
        settingsSubscriptionStatusEl.hidden = true;
      }
    }
  }
  // 一度も契約したことがないユーザーはStripe顧客情報を持たずポータルを開けないため、
  // 契約中（解約予約中で契約終了日を待っている状態を含む）のときだけボタンを出す
  if (settingsSubscriptionButton) {
    settingsSubscriptionButton.hidden = !status.subscription;
  }
}

// ---------- サブスクリプション管理（Stripe Customer Portal） ----------
// 押すとapi/stripe/create-portal-session.jsを呼び、返ってきたStripe Customer PortalのURLへ遷移する。
// そこで解約・支払い方法変更・プラン変更ができる（Stripe側の画面。戻り先はjs/screens/auth.jsの
// handlePortalRedirect参照）。トークン取得の流れはjs/screens/pricing.jsのhandlePlanButtonClickと揃える
if (settingsSubscriptionButton) {
  settingsSubscriptionButton.addEventListener("click", async function () {
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

    const originalText = settingsSubscriptionButton.textContent;
    settingsSubscriptionButton.disabled = true;
    settingsSubscriptionButton.textContent = "管理ページを準備中…";

    try {
      const response = await fetch("/api/stripe/create-portal-session", {
        method: "POST",
        headers: { Authorization: "Bearer " + accessToken }
      });
      const data = await response.json();

      if (!response.ok || !data.url) {
        showToast(data.error || "サブスクリプション管理ページの作成に失敗しました。");
        settingsSubscriptionButton.disabled = false;
        settingsSubscriptionButton.textContent = originalText;
        return;
      }

      location.href = data.url; // Stripe Customer Portalへ遷移する
    } catch (error) {
      console.error("[settings] サブスクリプション管理ページの作成に失敗しました:", error);
      showToast("通信エラーが発生しました。インターネット接続を確認して、もう一度お試しください。");
      settingsSubscriptionButton.disabled = false;
      settingsSubscriptionButton.textContent = originalText;
    }
  });
}

// アプリのどこでプラン・クレジットが更新されても、設定画面の表示は自動で最新化する
onPlanStatusChange(renderSettingsPlanStatus); // js/services/planStatus.js

// アプリのバージョン表示（更新のたびにpackage.jsonのversionと合わせて書き換える）
const APP_VERSION = "1.0.0";
const appVersionTextEl = document.getElementById("app-version-text");
if (appVersionTextEl) {
  appVersionTextEl.textContent = "バージョン " + APP_VERSION;
}

// 設定画面を開いたときの処理（js/screens/app.jsのgoToNavPageから呼ばれる）
async function prepareSettingsScreen() {
  const status = await fetchPlanStatus();
  renderSettingsPlanStatus(status);
}

