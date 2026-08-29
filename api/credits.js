// BookHub: 現在ログインしているユーザーのAIクレジット残高・プランを返すサーバー関数（Vercelが自動で動かす）。
//
// AI画面を開いたときの残高表示（例：「AIクレジット 82 / 100」）のために使う。
// クレジットは消費しない（月替わりのリセットだけは反映される。Supabase側のget_ai_credit_status参照）。
//
// 必要なVercelの環境変数：api/chat.jsと共通（SUPABASE_URL / SUPABASE_ANON_KEY）
//
// 呼び出し方：
//   GET /api/credits を、Authorizationヘッダー（"Bearer " + Supabaseのアクセストークン）付きで送ると
//   { "credits": { "plan": "free", "remaining": 82, "monthlyLimit": 100 } } のような残高が返る。

const { getAuthenticatedUser } = require("./_lib/supabaseUser");
const { MONTHLY_CREDITS } = require("./_lib/aiCredits");

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
    p_free_monthly: MONTHLY_CREDITS.free,
    p_premium_monthly: MONTHLY_CREDITS.premium
  });

  if (error || !data || !data.ok) {
    console.error("AIクレジット残高の取得でエラーが発生しました:", error);
    res.status(500).json({ error: "AIクレジット残高の取得に失敗しました。" });
    return;
  }

  res.status(200).json({
    credits: { plan: data.plan, remaining: data.remaining, monthlyLimit: data.monthlyLimit }
  });
};
