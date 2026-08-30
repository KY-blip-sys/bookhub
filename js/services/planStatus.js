// ---------- 現在のプラン・AIクレジット残高（アプリ全体で共有する状態） ----------
// プラン判定・AIクレジット判定はすべてサーバー側（/api/credits, /api/chat）が行う。
// このファイルは、その結果をアプリ全体で使い回すための唯一の取得窓口。
// 広告表示制御（js/services/ads.js）・AI利用可否表示（js/screens/aiCredits.js）・
// 設定画面のプラン表示（js/screens/settings.js）・料金プラン画面（js/screens/pricing.js）は、
// どれも個別に/api/creditsを呼ばず、必ずここのfetchPlanStatus/getPlanStatusを経由する
// （プラン・クレジットの取得ロジックを複数箇所に書かないため）。

let planStatusCache = null; // 直近の { plan, remaining, monthlyLimit, aiEnabled, ads, subscription, featureCosts }
let planStatusRequest = null; // 同時に複数箇所から呼ばれても、通信中のリクエストは1つにまとめる
const planStatusListeners = [];

// 未ログイン・取得失敗時のフォールバック（Freeプラン・広告ありとして扱う）
function freePlanFallback() {
  return {
    plan: "free",
    remaining: 0,
    monthlyLimit: 0,
    aiEnabled: false,
    ads: true,
    subscription: null,
    featureCosts: []
  };
}

// 直近取得した状態を同期的に返す（まだ一度も取得していなければnull）
function getPlanStatus() {
  return planStatusCache;
}

// 状態が更新されるたびに呼ばれるリスナーを登録する
function onPlanStatusChange(callback) {
  planStatusListeners.push(callback);
}

function notifyPlanStatusListeners() {
  planStatusListeners.forEach(function (callback) {
    try {
      callback(planStatusCache);
    } catch (error) {
      console.error("[planStatus] リスナーの実行でエラーが発生しました:", error);
    }
  });
}

// /api/chatの返答に含まれるcreditsなど、サーバーから断片的に返ってきた最新値を反映する
// （プラン自体は変わらないため、既存のキャッシュにマージするだけでよい）
function setPlanStatus(partialStatus) {
  if (!partialStatus) {
    return;
  }
  planStatusCache = Object.assign({}, planStatusCache, partialStatus);
  notifyPlanStatusListeners();
}

// サーバー（/api/credits）から最新の状態を取得する。ログイン直後・各画面を開いたときなど、
// 最新のプラン・クレジット残高が必要な場面ではこれを呼ぶ
async function fetchPlanStatus() {
  if (planStatusRequest) {
    return planStatusRequest;
  }

  planStatusRequest = (async function () {
    if (!window.sb) {
      planStatusCache = freePlanFallback();
      notifyPlanStatusListeners();
      return planStatusCache;
    }

    const { data: sessionData } = await window.sb.auth.getSession();
    const accessToken = sessionData.session ? sessionData.session.access_token : null;
    if (!accessToken) {
      planStatusCache = freePlanFallback();
      notifyPlanStatusListeners();
      return planStatusCache;
    }

    try {
      const response = await fetch("/api/credits", {
        headers: { Authorization: "Bearer " + accessToken }
      });
      const data = await response.json();
      if (response.ok && data.credits) {
        planStatusCache = Object.assign({}, data.credits, {
          featureCosts: data.featureCosts || [],
          subscription: data.subscription || null
        });
      } else {
        console.error("[planStatus] 現在のプランの取得に失敗しました:", data);
        planStatusCache = planStatusCache || freePlanFallback();
      }
    } catch (error) {
      console.error("[planStatus] 現在のプランの取得中にエラーが発生しました:", error);
      planStatusCache = planStatusCache || freePlanFallback();
    }

    notifyPlanStatusListeners();
    return planStatusCache;
  })();

  try {
    return await planStatusRequest;
  } finally {
    planStatusRequest = null;
  }
}
