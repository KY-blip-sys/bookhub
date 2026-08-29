// BookHub: 現在ログインしているユーザーのAIクレジット残高・プラン・AI利用可否を返すサーバー関数（Vercelが自動で動かす）。
//
// AI画面上部のAIクレジットカード（現在のプラン・残りクレジット・進捗バー・消費クレジット一覧）や、
// Free・Plusプランでの「AI機能はPremiumプラン以上で利用できます。」案内の出し分けのために使う。
// クレジットは消費しない（月替わりのリセットだけは反映される。Supabase側のget_ai_credit_status参照）。
//
// プラン自体（profiles.plan）は、Stripe Webhook（api/stripe/webhook.js）がsubscriptionsテーブルを
// 更新するたびに自動で同期されるため、ここでは読み取るだけでよい（Stripe側の状態には触れない）。
// 料金プラン画面（js/screens/pricing.js）で「次回更新日」「解約予定」を表示できるよう、
// subscriptionsテーブルのstatus・expires_atも合わせて返す。
//
// 必要なVercelの環境変数：api/chat.jsと共通（SUPABASE_URL / SUPABASE_ANON_KEY）
//
// 呼び出し方：
//   GET /api/credits を、Authorizationヘッダー（"Bearer " + Supabaseのアクセストークン）付きで送ると
//   {
//     "credits": { "plan": "premium", "remaining": 820, "monthlyLimit": 1000, "aiEnabled": true },
//     "featureCosts": [{ "feature": "chat", "label": "AIチャット", "cost": 5 }, ...],
//     "subscription": { "status": "active", "expiresAt": "2026-09-30T00:00:00.000Z" } // 未契約ならnull
//   } のような残高・消費クレジット一覧・契約状況が返る。

const { getAuthenticatedUser } = require("./_lib/supabaseUser");
const { MONTHLY_CREDITS, AI_ENABLED_PLANS, getPublicFeatureCosts } = require("./_lib/aiCredits");

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "GET") {
    res.status(405).json({ error: "このAPIはGETメソッドのみ対応しています。" });
    return;
  }

  const auth = await getAuthenticatedUser(req);
  if (!auth) {
    res.status(401).json({ error: "ログインが必要です。" });
    return;
  }

  const { data, error } = await auth.supabase.rpc("get_ai_credit_status", {
    p_monthly_credits: MONTHLY_CREDITS,
    p_ai_enabled_plans: AI_ENABLED_PLANS
  });

  if (error || !data || !data.ok) {
    console.error("AIクレジット残高の取得でエラーが発生しました:", error);
    res.status(500).json({ error: "AIクレジット残高の取得に失敗しました。" });
    return;
  }

  const { data: subscriptionRow } = await auth.supabase
    .from("subscriptions")
    .select("status, expires_at")
    .eq("user_id", auth.user.id)
    .maybeSingle();

  res.status(200).json({
    credits: {
      plan: data.plan,
      remaining: data.remaining,
      monthlyLimit: data.monthlyLimit,
      aiEnabled: data.aiEnabled
    },
    featureCosts: getPublicFeatureCosts(),
    subscription: subscriptionRow
      ? { status: subscriptionRow.status, expiresAt: subscriptionRow.expires_at }
      : null
  });
};
