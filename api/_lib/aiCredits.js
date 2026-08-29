// BookHub: AIクレジット制の設定値（付与クレジット・消費クレジット）を1箇所にまとめる。
//
// ここを変更するだけで、全プラン・全AI機能のクレジット量を変更できる
// （api/chat.js側やSupabase側の関数を書き換える必要はない。値はRPC呼び出しの引数として渡す）。
//
// ファイル名がアンダースコアで始まるディレクトリ（api/_lib）に置いているため、
// Vercelはこのファイルを独立したAPIエンドポイントとして扱わない。

// プランごとに毎月付与されるAIクレジット
const MONTHLY_CREDITS = {
  free: 100,
  premium: 3000
};

// AI機能ごとの消費クレジット。
// 新しいAI機能を追加するときは、ここに1行足し、呼び出し側でそのキーをfeatureとして渡すだけでよい
// （api/chat.jsのクレジット判定・消費処理は機能によらず共通なので、書き増やす必要はない）。
const FEATURE_COSTS = {
  chat: 5, // AIチャット（1メッセージごと）
  recommend: 10, // AIによる本の推薦
  summary: 15, // AI要約
  bookQuestion: 8, // 本について質問
  quiz: 15, // AIクイズの作成
  quizComment: 3, // AIクイズの結果コメント
  coach: 10 // AI学習コーチ
};

function getFeatureCost(feature) {
  const cost = FEATURE_COSTS[feature];
  if (typeof cost !== "number") {
    throw new Error("未知のAI機能です: " + feature);
  }
  return cost;
}

module.exports = { MONTHLY_CREDITS, FEATURE_COSTS, getFeatureCost };
