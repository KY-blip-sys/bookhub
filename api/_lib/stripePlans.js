// BookHub: BookHubのプランキー（plus/premium）と、StripeのPrice ID（環境変数）の対応表。
//
// Price ID自体はVercelの環境変数（STRIPE_PLUS_PRICE_ID / STRIPE_PREMIUM_PRICE_ID）に置き、
// コードには書かない（Price IDはStripe Dashboard上でいつでも差し替えられる値のため）。
// Checkoutセッション作成時（プランキー→Price ID）・Webhook受信時（Price ID→プランキー）の
// 両方でこの対応表を使う。
//
// ファイル名がアンダースコアで始まるディレクトリ（api/_lib）に置いているため、
// Vercelはこのファイルを独立したAPIエンドポイントとして扱わない。

const PLAN_PRICE_ENV = {
  plus: "STRIPE_PLUS_PRICE_ID",
  premium: "STRIPE_PREMIUM_PRICE_ID"
};

// プランキー（'plus' | 'premium'）からStripeのPrice IDを返す。未設定・未知のプランならnull
function getPriceId(planKey) {
  const envName = PLAN_PRICE_ENV[planKey];
  if (!envName) {
    return null;
  }
  return process.env[envName] || null;
}

// StripeのPrice IDからBookHubのプランキーを返す（Webhook受信時に使う）。一致しなければnull
function getPlanKeyByPriceId(priceId) {
  if (!priceId) {
    return null;
  }
  const planKeys = Object.keys(PLAN_PRICE_ENV);
  for (let i = 0; i < planKeys.length; i++) {
    const planKey = planKeys[i];
    if (process.env[PLAN_PRICE_ENV[planKey]] === priceId) {
      return planKey;
    }
  }
  return null;
}

module.exports = { PLAN_PRICE_ENV, getPriceId, getPlanKeyByPriceId };
