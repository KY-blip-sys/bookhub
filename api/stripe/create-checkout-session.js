// BookHub: Stripe Checkoutセッションを作成するサーバー関数（Vercelが自動で動かす）。
//
// 料金プラン画面（js/screens/pricing.js）で「Plusにアップグレード」「Premiumにアップグレード」を押すと、
// ログイン中のユーザーの代わりにこのAPIがStripe Checkoutセッションを作り、その決済ページURLを返す。
// ブラウザはそのURLへ遷移するだけなので、カード情報がBookHub側のサーバーやブラウザを通ることは一切ない。
//
// 支払いが成功したかどうか（プランの反映）はここでは扱わない。実際の反映はapi/stripe/webhook.jsが
// StripeからのWebhookイベントを受けて行う（Checkoutページからの遷移だけでは「まだ確定していない」ため）。
//
// 必要なVercelの環境変数：
//   STRIPE_SECRET_KEY … Stripeのシークレットキー（絶対にブラウザへは渡さない）
//   STRIPE_PLUS_PRICE_ID / STRIPE_PREMIUM_PRICE_ID … 各プランのStripe Price ID
//   SUPABASE_URL / SUPABASE_ANON_KEY … api/config.jsと共通（ログイン確認・既存Stripe顧客IDの参照に使う）
//
// 呼び出し方：
//   POST /api/stripe/create-checkout-session に { "plan": "plus" | "premium" } を、
//   Authorizationヘッダー（"Bearer " + Supabaseのアクセストークン）付きで送ると
//   { "url": "https://checkout.stripe.com/..." } が返るので、ブラウザをそのURLへ遷移させる
//   （js/screens/pricing.jsのhandlePlanButtonClick参照）。

const { getAuthenticatedUser } = require("../_lib/supabaseUser");
const { getStripeClient } = require("../_lib/stripeClient");
const { getPriceId } = require("../_lib/stripePlans");

// リクエストが来たオリジン（https://example.com のような形）を組み立てる。
// success_url・cancel_url（決済後にBookHubへ戻ってくる先）に使う
function resolveOrigin(req) {
  const forwardedProto = req.headers["x-forwarded-proto"];
  const proto = (Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto) || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  return proto + "://" + host;
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.status(405).json({ error: "このAPIはPOSTメソッドのみ対応しています。" });
    return;
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    res.status(500).json({ error: "Stripeの環境変数（STRIPE_SECRET_KEY）がVercelに設定されていません。" });
    return;
  }

  const { plan } = req.body || {};
  const priceId = getPriceId(plan);
  if (!priceId) {
    res.status(400).json({ error: "planには'plus'または'premium'を指定してください。" });
    return;
  }

  const auth = await getAuthenticatedUser(req);
  if (!auth) {
    res.status(401).json({ error: "ログインが必要です。" });
    return;
  }

  // 既にStripeの顧客として登録済みなら使い回す（プラン変更のたびに別の顧客を作らないため）
  const { data: existingSub } = await auth.supabase
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("user_id", auth.user.id)
    .maybeSingle();

  const origin = resolveOrigin(req);

  try {
    const stripe = getStripeClient();

    const sessionParams = {
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      // Webhook（api/stripe/webhook.js）が「どのBookHubユーザーの決済か」を特定するために使う
      client_reference_id: auth.user.id,
      subscription_data: { metadata: { supabase_user_id: auth.user.id } },
      metadata: { supabase_user_id: auth.user.id, plan: plan },
      success_url: origin + "/index.html?checkout=success",
      cancel_url: origin + "/index.html?checkout=cancel"
    };

    if (existingSub && existingSub.stripe_customer_id) {
      sessionParams.customer = existingSub.stripe_customer_id;
    } else if (auth.user.email) {
      sessionParams.customer_email = auth.user.email;
    }

    const session = await stripe.checkout.sessions.create(sessionParams);
    res.status(200).json({ url: session.url });
  } catch (error) {
    console.error("Stripe Checkoutセッションの作成でエラーが発生しました:", error);
    res.status(500).json({ error: "決済ページの作成に失敗しました。しばらくしてから再度お試しください。" });
  }
};
