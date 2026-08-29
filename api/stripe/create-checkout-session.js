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
const { getPriceId, PLAN_PRICE_ENV } = require("../_lib/stripePlans");

// カンマ区切りで複数の値が入ることがあるヘッダー（プロキシを経由すると付与されうる）から、
// 一番手前（＝実際のリクエスト元に一番近い値）だけを取り出す
function firstHeaderValue(headerValue) {
  const raw = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  return raw ? raw.split(",")[0].trim() : null;
}

// リクエストが来たオリジン（https://example.com のような形）を組み立てる。
// success_url・cancel_url（決済後にBookHubへ戻ってくる先）に使う。
// NEXT_PUBLIC_APP_URLのような固定の環境変数は使わず、Vercelが付与するリクエストヘッダーから
// その場で組み立てる（プレビューデプロイごとにドメインが変わっても環境変数の設定し直しが不要なため）。
function resolveOrigin(req) {
  const proto = firstHeaderValue(req.headers["x-forwarded-proto"]) || "https";
  const host = firstHeaderValue(req.headers["x-forwarded-host"]) || firstHeaderValue(req.headers.host);
  if (!host) {
    throw new Error("リクエストのHostヘッダーが取得できず、success_url/cancel_urlを組み立てられませんでした。");
  }
  return proto + "://" + host;
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.status(405).json({ error: "このAPIはPOSTメソッドのみ対応しています。" });
    return;
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    console.error("[create-checkout-session] STRIPE_SECRET_KEYが未設定です。");
    res.status(500).json({ error: "Stripeの環境変数（STRIPE_SECRET_KEY）がVercelに設定されていません。" });
    return;
  }

  const { plan } = req.body || {};
  const priceEnvName = PLAN_PRICE_ENV[plan];
  if (!priceEnvName) {
    res.status(400).json({ error: "planには'plus'または'premium'を指定してください。" });
    return;
  }

  const priceId = getPriceId(plan);
  if (!priceId) {
    // planの値自体は正しいが、対応するPrice IDがVercelに設定されていない
    console.error("[create-checkout-session] " + priceEnvName + "が未設定です。plan=" + plan);
    res.status(500).json({
      error: "Stripeの環境変数（" + priceEnvName + "）がVercelに設定されていません。"
    });
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
    console.error("[create-checkout-session] オリジンの解決に失敗しました:", error.message);
    res.status(500).json({ error: error.message });
    return;
  }

  // 既にStripeの顧客として登録済みなら使い回す（プラン変更のたびに別の顧客を作らないため）。
  // subscriptionsテーブル自体が未作成（supabase/stripe_subscriptions.sql未実行）などで失敗しても、
  // 新規顧客としてCheckoutを続行できるよう、ここでは処理を止めない
  let existingCustomerId = null;
  try {
    const { data: existingSub, error: existingSubError } = await auth.supabase
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", auth.user.id)
      .maybeSingle();
    if (existingSubError) {
      console.error("[create-checkout-session] subscriptionsテーブルの参照に失敗しました:", existingSubError);
    } else if (existingSub) {
      existingCustomerId = existingSub.stripe_customer_id;
    }
  } catch (error) {
    console.error("[create-checkout-session] subscriptionsテーブルの参照で例外が発生しました:", error);
  }

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

    if (existingCustomerId) {
      sessionParams.customer = existingCustomerId;
    } else if (auth.user.email) {
      sessionParams.customer_email = auth.user.email;
    }

    const session = await stripe.checkout.sessions.create(sessionParams);
    res.status(200).json({ url: session.url });
  } catch (error) {
    // Stripeが返すエラー（StripeErrorのサブクラス）は message・type・code・statusCode に
    // 具体的な原因（APIキーの間違い、Price IDがそのモード/アカウントに存在しない等）が入っている
    console.error("[create-checkout-session] Stripe Checkoutセッションの作成に失敗しました:", {
      message: error && error.message,
      type: error && error.type,
      code: error && error.code,
      statusCode: error && error.statusCode,
      param: error && error.param,
      requestId: error && error.requestId,
      stack: error && error.stack
    });
    res.status(500).json({ error: "決済ページの作成に失敗しました。しばらくしてから再度お試しください。" });
  }
};
