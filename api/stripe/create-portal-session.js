// BookHub: Stripe Customer Portal（顧客ポータル）セッションを作成するサーバー関数（Vercelが自動で動かす）。
//
// 設定画面（js/screens/settings.js）で「サブスクリプション管理」を押すと、このAPIがログイン中の
// ユーザーのStripe顧客ポータルセッションを作り、そのURLを返す。ブラウザはそのURLへ遷移するだけで、
// 解約・支払い方法の変更・プラン変更をStripeのホスト画面上で行える（カード情報等はBookHub側を通らない）。
//
// 解約はStripeの既定動作（期間終了時に解約）に従う。解約してもStripeのsubscription.statusは
// 期間終了までactiveのままのため、api/stripe/webhook.jsが反映するsubscriptions.statusもactiveのまま
// →supabase/stripe_subscriptions.sqlの同期トリガーによりprofiles.planも有効のまま維持される
// （＝契約終了日まで現在のプランを使える。追加の状態管理は不要）。
//
// 必要なVercelの環境変数：api/stripe/create-checkout-session.jsと共通
//   STRIPE_SECRET_KEY / SUPABASE_URL / SUPABASE_ANON_KEY
//
// 事前準備：Stripeダッシュボード → 設定 → 課金 → Customer Portal で、顧客ポータルを
// 有効化しておく必要がある（商品・解約可否・支払い方法変更などの許可設定はStripe側で行う）。
//
// 呼び出し方：
//   POST /api/stripe/create-portal-session を、
//   Authorizationヘッダー（"Bearer " + Supabaseのアクセストークン）付きで送ると
//   { "url": "https://billing.stripe.com/..." } が返るので、ブラウザをそのURLへ遷移させる
//   （js/screens/settings.js参照）。

const { getAuthenticatedUser } = require("../_lib/supabaseUser");
const { getStripeClient } = require("../_lib/stripeClient");
const { resolveOrigin } = require("../_lib/requestOrigin"); // api/stripe/create-checkout-session.jsと共通

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.status(405).json({ error: "このAPIはPOSTメソッドのみ対応しています。" });
    return;
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    console.error("[create-portal-session] STRIPE_SECRET_KEYが未設定です。");
    res.status(500).json({ error: "Stripeの環境変数（STRIPE_SECRET_KEY）がVercelに設定されていません。" });
    return;
  }

  const auth = await getAuthenticatedUser(req);
  if (!auth) {
    res.status(401).json({ error: "ログインが必要です。" });
    return;
  }

  let origin;
  try {
    origin = resolveOrigin(req);
  } catch (error) {
    console.error("[create-portal-session] オリジンの解決に失敗しました:", error.message);
    res.status(500).json({ error: error.message });
    return;
  }

  // Checkout時にStripeの顧客として登録済みのはずなので、そのIDを取得する
  // （一度も契約したことがないユーザーはstripe_customer_idを持たないため、ポータルを開けない）
  let stripeCustomerId = null;
  try {
    const { data: existingSub, error: existingSubError } = await auth.supabase
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", auth.user.id)
      .maybeSingle();
    if (existingSubError) {
      console.error("[create-portal-session] subscriptionsテーブルの参照に失敗しました:", existingSubError);
    } else if (existingSub) {
      stripeCustomerId = existingSub.stripe_customer_id;
    }
  } catch (error) {
    console.error("[create-portal-session] subscriptionsテーブルの参照で例外が発生しました:", error);
  }

  if (!stripeCustomerId) {
    res.status(400).json({ error: "契約情報が見つかりませんでした。プランをご契約の上お試しください。" });
    return;
  }

  try {
    const stripe = getStripeClient();
    const session = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: origin + "/index.html?portal=return"
    });
    res.status(200).json({ url: session.url });
  } catch (error) {
    console.error("[create-portal-session] Stripe顧客ポータルセッションの作成に失敗しました:", {
      message: error && error.message,
      type: error && error.type,
      code: error && error.code,
      statusCode: error && error.statusCode,
      requestId: error && error.requestId
    });
    res.status(500).json({ error: "サブスクリプション管理ページの作成に失敗しました。しばらくしてから再度お試しください。" });
  }
};
