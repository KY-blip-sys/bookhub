// BookHub: 料金プラン・AIクレジット制の設定値を1箇所にまとめる。
//
// ここ（PLAN_CATALOG・FEATURE_COSTS）を変更するだけで、料金プラン画面の表示・
// 各プランの月間AIクレジット・AI利用可否・AI機能ごとの消費クレジットのすべてが変わる
// （api/chat.js・api/credits.js・api/plans.js・Supabase側の関数は書き換える必要はない。
//   値はAPIレスポンスやRPC呼び出しの引数として渡すだけ）。
//
// StripeのPrice ID（プランごとの実際の決済先）は、ここではなくVercelの環境変数
// （STRIPE_PLUS_PRICE_ID / STRIPE_PREMIUM_PRICE_ID）に置き、api/_lib/stripePlans.jsが読む
// （Price IDはコードに書かず、Stripe Dashboard側でいつでも差し替えられるようにするため）。
//
// ファイル名がアンダースコアで始まるディレクトリ（api/_lib）に置いているため、
// Vercelはこのファイルを独立したAPIエンドポイントとして扱わない。

// 料金プランの一覧（表示順そのまま）。price・featuresは料金プラン画面の表示用の情報。
const PLAN_CATALOG = [
  {
    key: "free",
    label: "Free",
    priceYen: 0,
    monthlyCredits: 0,
    aiEnabled: false,
    ads: true,
    features: ["読書記録", "Google Books検索", "本棚", "読書タイマー", "読書統計", "読書目標"],
    // 実際に「現在のプラン」かどうかはjs/screens/pricing.jsが表示時に動的に判定して上書きする
    // （新規登録直後のユーザーは必ずplan=freeのため、通常はこのカードが「現在のプラン」になる）。
    highlight: false
  },
  {
    key: "plus",
    label: "Plus",
    priceYen: 580,
    monthlyCredits: 0,
    aiEnabled: false,
    ads: false,
    features: ["Freeの全機能"],
    highlight: false
  },
  {
    key: "premium",
    label: "Premium",
    priceYen: 980,
    monthlyCredits: 1000,
    aiEnabled: true,
    ads: false,
    features: ["AIチャット", "AI本推薦", "AI要約", "AIへの質問", "Plusの全機能（広告なし）"],
    highlight: true
  },
  {
    key: "pro",
    label: "Pro",
    priceYen: 1980,
    monthlyCredits: 3000,
    aiEnabled: true,
    ads: false,
    features: ["Premiumの全機能", "AIクレジット増量"],
    highlight: false
  }
];

// プランごとに毎月付与されるAIクレジット（PLAN_CATALOGから自動で組み立てる。二重管理しない）
const MONTHLY_CREDITS = PLAN_CATALOG.reduce(function (map, plan) {
  map[plan.key] = plan.monthlyCredits;
  return map;
}, {});

// AI機能を利用できるプランのキー一覧（PLAN_CATALOGから自動で組み立てる）
const AI_ENABLED_PLANS = PLAN_CATALOG.filter(function (plan) {
  return plan.aiEnabled;
}).map(function (plan) {
  return plan.key;
});

// AI機能ごとの消費クレジット。
// 新しいAI機能を追加するときは、ここに1行足し、呼び出し側でそのキーをfeatureとして渡すだけでよい
// （api/chat.jsのクレジット判定・消費処理は機能によらず共通なので、書き増やす必要はない）。
const FEATURE_COSTS = {
  chat: 5, // AIチャット（1メッセージごと）
  bookQuestion: 5, // 本について質問
  recommend: 10, // AI本推薦
  summary: 20, // AI要約
  quiz: 15, // AIクイズの作成（料金プラン画面には掲載していない付随機能）
  quizComment: 3, // AIクイズの結果コメント
  coach: 10 // AI学習コーチ（料金プラン画面には掲載していない付随機能）
};

// AI画面・料金プラン画面の「消費クレジット一覧」に表示する機能（表示順そのまま）
const PUBLIC_FEATURE_LIST = [
  { feature: "chat", label: "AIチャット" },
  { feature: "bookQuestion", label: "本について質問" },
  { feature: "recommend", label: "AI本推薦" },
  { feature: "summary", label: "AI要約" }
];

function getFeatureCost(feature) {
  const cost = FEATURE_COSTS[feature];
  if (typeof cost !== "number") {
    throw new Error("未知のAI機能です: " + feature);
  }
  return cost;
}

function getPublicFeatureCosts() {
  return PUBLIC_FEATURE_LIST.map(function (item) {
    return { feature: item.feature, label: item.label, cost: FEATURE_COSTS[item.feature] };
  });
}

// プランキーから広告表示の要否を返す（Freeプランのみtrue）。
// 広告表示制御（js/services/ads.js）・料金プラン画面（js/screens/pricing.js）の両方が、
// このPLAN_CATALOGのadsフィールドを唯一の情報源として使う
function getPlanAds(planKey) {
  const plan = PLAN_CATALOG.find(function (p) {
    return p.key === planKey;
  });
  return plan ? plan.ads : true;
}

module.exports = {
  PLAN_CATALOG,
  MONTHLY_CREDITS,
  AI_ENABLED_PLANS,
  FEATURE_COSTS,
  getFeatureCost,
  getPublicFeatureCosts,
  getPlanAds
};
