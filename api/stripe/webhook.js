// BookHub: Stripe Webhookを受け取るサーバー関数（Vercelが自動で動かす）。
//
// Stripe側の「決済確定・サブスクリプション更新・解約」イベントを受け取り、
// Supabaseのsubscriptionsテーブルを更新する（そこからトリガーでprofiles.planにも自動反映される。
// supabase/stripe_subscriptions.sql参照）。
//
// ここだけはログインユーザーのアクセストークンを持たない（Stripeサーバーからの直接呼び出しのため）ので、
// service role key（RLSを迂回できる鍵）を使って書き込む。この鍵はここ以外では使わない。
//
// 必要なVercelの環境変数：
//   STRIPE_SECRET_KEY … api/stripe/create-checkout-session.jsと共通
//   STRIPE_WEBHOOK_SECRET … Stripe Dashboardでこのエンドポイントを登録したときに発行される署名シークレット
//   STRIPE_PLUS_PRICE_ID / STRIPE_PREMIUM_PRICE_ID … api/_lib/stripePlans.js（Price ID→プラン判定）と共通
//   SUPABASE_URL … api/config.jsと共通
//   SUPABASE_SERVICE_ROLE_KEY … Supabaseプロジェクトのservice role key（絶対にブラウザへは渡さない）
//
// Stripe Dashboard → 開発者 → Webhook で、このエンドポイント（https://<ドメイン>/api/stripe/webhook）に
// 対して以下のイベントを送るよう設定する：
//   checkout.session.completed / customer.subscription.updated / customer.subscription.deleted
//
// 署名検証のため、Vercelの標準ボディパーサーを無効にし、生のリクエストボディをそのまま使う
// （JSON化・整形してしまうと署名が一致しなくなるため）。

const { getStripeClient } = require("../_lib/stripeClient");
const { getSupabaseAdmin } = require("../_lib/supabaseAdmin");
const { getPlanKeyByPriceId } = require("../_lib/stripePlans");

function readRawBody(req) {
  return new Promise(function (resolve, reject) {
    const chunks = [];
    req.on("data", function (chunk) {
      chunks.push(chunk);
    });
    req.on("end", function () {
      resolve(Buffer.concat(chunks));
    });
    req.on("error", reject);
  });
}

function toTimestamptz(unixSeconds) {
  return typeof unixSeconds === "number" ? new Date(unixSeconds * 1000).toISOString() : null;
}

// StripeのSubscriptionオブジェクトの現在の価格から、BookHubのプランキー（plus/premium）を判定する
function resolvePlanKeyFromSubscription(subscription) {
  const item = subscription.items && subscription.items.data && subscription.items.data[0];
  const priceId = item && item.price ? item.price.id : null;
  return getPlanKeyByPriceId(priceId);
}

// subscriptionsテーブルへの反映（新規契約・プラン変更・更新のすべてで共通して使う）
async function upsertSubscription(supabaseAdmin, userId, subscription, planKeyHint) {
  const planKey = planKeyHint || resolvePlanKeyFromSubscription(subscription);
  if (!planKey) {
    console.error(
      "StripeのPrice IDから対応するBookHubのプランを特定できませんでした。subscription:",
      subscription.id
    );
    return;
  }

  const { error } = await supabaseAdmin.from("subscriptions").upsert(
    {
      user_id: userId,
      plan: planKey,
      status: subscription.status,
      stripe_customer_id:
        typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id,
      stripe_subscription_id: subscription.id,
      started_at: toTimestamptz(subscription.start_date),
      expires_at: toTimestamptz(subscription.current_period_end),
      updated_at: new Date().toISOString()
    },
    { onConflict: "user_id" }
  );

  if (error) {
    console.error("subscriptionsテーブルの更新に失敗しました:", error);
  }
}

// customer.subscription.* イベントには、Checkout時にsubscription_data.metadataへ入れておいた
// supabase_user_idが載っているはずだが、念のため見つからない場合はstripe_subscription_idで引き当てる
async function findUserIdBySubscriptionId(supabaseAdmin, subscriptionId) {
  const { data } = await supabaseAdmin
    .from("subscriptions")
    .select("user_id")
    .eq("stripe_subscription_id", subscriptionId)
    .maybeSingle();
  return data ? data.user_id : null;
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "このAPIはPOSTメソッドのみ対応しています。" });
    return;
  }

  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) {
    res.status(500).json({
      error: "Stripeの環境変数（STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET）がVercelに設定されていません。"
    });
    return;
  }

  const stripe = getStripeClient();
  const signature = req.headers["stripe-signature"];

  let event;
  try {
    const rawBody = await readRawBody(req);
    event = stripe.webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (error) {
    // 署名が一致しない＝Stripe以外からのリクエストの可能性があるため、中身は処理せず拒否する
    console.error("Stripe Webhookの署名検証に失敗しました:", error.message);
    res.status(400).json({ error: "署名の検証に失敗しました。" });
    return;
  }

  let supabaseAdmin;
  try {
    supabaseAdmin = getSupabaseAdmin();
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ error: error.message });
    return;
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        if (session.mode === "subscription" && session.subscription) {
          const userId = session.client_reference_id || (session.metadata && session.metadata.supabase_user_id);
          if (userId) {
            const subscription = await stripe.subscriptions.retrieve(session.subscription);
            const planKeyHint = session.metadata && session.metadata.plan;
            await upsertSubscription(supabaseAdmin, userId, subscription, planKeyHint);
          } else {
            console.error("checkout.session.completed: supabase_user_idを特定できませんでした。session:", session.id);
          }
        }
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object;
        const userId =
          (subscription.metadata && subscription.metadata.supabase_user_id) ||
          (await findUserIdBySubscriptionId(supabaseAdmin, subscription.id));
        if (userId) {
          await upsertSubscription(supabaseAdmin, userId, subscription);
        } else {
          console.error("customer.subscription.updated: ユーザーを特定できませんでした。subscription:", subscription.id);
        }
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object;
        const { error } = await supabaseAdmin
          .from("subscriptions")
          .update({ status: "canceled", updated_at: new Date().toISOString() })
          .eq("stripe_subscription_id", subscription.id);
        if (error) {
          console.error("subscriptionsテーブルの解約反映に失敗しました:", error);
        }
        break;
      }

      default:
        break; // BookHubで扱わないイベントは何もしない（200を返してStripe側の再送を止める）
    }

    res.status(200).json({ received: true });
  } catch (error) {
    console.error("Stripe Webhookの処理でエラーが発生しました:", error);
    res.status(500).json({ error: "Webhookの処理に失敗しました。" });
  }
};

// Vercelの標準ボディパーサーを無効にする（handler代入後に付けないと、代入時にconfigごと上書きされてしまう）
module.exports.config = { api: { bodyParser: false } };
