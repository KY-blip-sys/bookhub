// BookHub: Stripe Webhookを受け取るサーバー関数（Vercelが自動で動かす）。
//
// Stripe側の「決済確定・サブスクリプション更新・解約」イベントを受け取り、
// Supabaseのsubscriptionsテーブルを更新する（そこからトリガーでprofiles.planにも自動反映される。
// supabase/stripe_subscriptions.sql参照）。プランが実際に切り替わったタイミングでは、
// 月替わりを待たずにAIクレジットもその場で付与する（supabase/stripe_subscriptions.sqlの
// grant_plan_credits関数参照）。
//
// 解約（期間終了時に解約する設定＝cancel_at_period_end=true）は、customer.subscription.updated
// イベントとしてstatus=activeのまま届く。statusがactive/trialingである限りprofiles.planは
// 維持される＝AI機能は契約終了日まで使える。実際にプランをfreeへ戻す・AI機能を無効化するのは、
// 期間終了時に届くcustomer.subscription.deletedイベントのみ（下のswitch文参照）。
//
// ここだけはログインユーザーのアクセストークンを持たない（Stripeサーバーからの直接呼び出しのため）ので、
// service role key（RLSを迂回できる鍵）を使って書き込む。この鍵はここ以外では使わない。
//
// 必要なVercelの環境変数：
//   STRIPE_SECRET_KEY … api/stripe/create-checkout-session.jsと共通
//   STRIPE_WEBHOOK_SECRET … Stripe Dashboardでこのエンドポイントを登録したときに発行される署名シークレット
//   STRIPE_PLUS_PRICE_ID / STRIPE_PRO_PRICE_ID / STRIPE_PREMIUM_PRICE_ID … api/_lib/stripePlans.js（Price ID→プラン判定）と共通
//   SUPABASE_URL … api/config.jsと共通
//   SUPABASE_SERVICE_ROLE_KEY … Supabaseプロジェクトのservice role key（絶対にブラウザへは渡さない）
//
// Stripe Dashboard → 開発者 → Webhook で、このエンドポイント（https://<ドメイン>/api/stripe/webhook）に
// 対して以下のイベントを送るよう設定する（1つでも選び忘れるとプラン・クレジットが反映されない）：
//   checkout.session.completed / customer.subscription.created /
//   customer.subscription.updated / customer.subscription.deleted
//
// 署名検証のため、Vercelの標準ボディパーサーを無効にし、生のリクエストボディをそのまま使う
// （JSON化・整形してしまうと署名が一致しなくなるため）。
//
// 診断のしかた：Vercelのダッシュボード → Functions（またはLogs）→ api/stripe/webhook で、
// ここから出しているconsole.log/console.errorがそのまま確認できる。
// [stripe-webhook] event received: が出ていなければ、そもそもStripeからこのエンドポイントに
// イベントが届いていない（Stripe Dashboard側のWebhook設定・URL・選択イベントを確認する）。

const { getStripeClient } = require("../_lib/stripeClient");
const { getSupabaseAdmin } = require("../_lib/supabaseAdmin");
const { getPlanKeyByPriceId } = require("../_lib/stripePlans");
const { MONTHLY_CREDITS } = require("../_lib/aiCredits");

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

// StripeのSubscriptionオブジェクトの現在の価格から、BookHubのプランキー（plus/pro/premium）を判定する
function resolvePlanKeyFromSubscription(subscription) {
  const item = subscription.items && subscription.items.data && subscription.items.data[0];
  const priceId = item && item.price ? item.price.id : null;
  return getPlanKeyByPriceId(priceId);
}

// 決済直後・プラン変更直後にAIクレジットを月替わりを待たずその場で付与する。
// 失敗してもsubscriptions自体の反映は既に終わっているため、ここでは投げ直さずログのみ残す
// （クレジット付与に失敗しても、次回の月替わりリセット・サポート対応でリカバリできるため）。
async function grantPlanCreditsIfNeeded(supabaseAdmin, userId, planKey) {
  const { data, error } = await supabaseAdmin.rpc("grant_plan_credits", {
    p_user_id: userId,
    p_monthly_credits: MONTHLY_CREDITS
  });

  if (error) {
    console.error("[stripe-webhook] AIクレジットの付与に失敗しました。user_id=" + userId + " plan=" + planKey, error);
    return;
  }

  console.log("[stripe-webhook] AIクレジットを付与しました。user_id=" + userId, data);
}

// subscriptionsテーブルへの反映（新規契約・プラン変更・更新のすべてで共通して使う）
async function upsertSubscription(supabaseAdmin, userId, subscription, planKeyHint) {
  const planKey = planKeyHint || resolvePlanKeyFromSubscription(subscription);
  if (!planKey) {
    console.error(
      "[stripe-webhook] StripeのPrice IDから対応するBookHubのプランを特定できませんでした。" +
        " user_id=" + userId + " subscription=" + subscription.id + " price=" +
        (subscription.items && subscription.items.data && subscription.items.data[0] &&
          subscription.items.data[0].price && subscription.items.data[0].price.id)
    );
    return;
  }

  // プランが実際に切り替わったかどうかを、上書きする「前」に見ておく
  // （切り替わっていないただの更新イベントで毎回クレジットを付与し直さないため）。
  const { data: existingRow, error: existingError } = await supabaseAdmin
    .from("subscriptions")
    .select("plan, status")
    .eq("user_id", userId)
    .maybeSingle();
  if (existingError) {
    console.error("[stripe-webhook] 既存のsubscriptions行の取得に失敗しました。user_id=" + userId, existingError);
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
      // trueの間は「期間終了時に解約予定」＝statusはactiveのままなので現在のプラン・AI機能は
      // 維持されるが、料金プラン画面・設定画面ではこれを見て「解約予約中」の案内を出す
      cancel_at_period_end: !!subscription.cancel_at_period_end,
      updated_at: new Date().toISOString()
    },
    { onConflict: "user_id" }
  );

  if (error) {
    // service role keyが正しく設定されていない・RLSでブロックされている・
    // supabase/stripe_subscriptions.sqlが未実行（テーブル自体が無い）等はすべてここに出る
    console.error(
      "[stripe-webhook] subscriptionsテーブルの更新に失敗しました。user_id=" + userId + " plan=" + planKey,
      error
    );
    return;
  }

  console.log(
    "[stripe-webhook] subscriptionsテーブルを更新しました。user_id=" + userId +
      " plan=" + planKey + " status=" + subscription.status
  );

  // 「新規に有効化された」「プランが変わった」「解約後に再契約した」のいずれかのときだけ、
  // 月替わりを待たずその場でクレジットを付与する（ただの更新イベントで毎回付与し直さないため）。
  // profiles.planへの反映自体はsupabase/stripe_subscriptions.sqlのトリガー（on_subscription_change）が
  // このupsertと同じトランザクション内で既に行っているため、ここでは待たずにそのままRPCを呼べる。
  const isActive = subscription.status === "active" || subscription.status === "trialing";
  const wasActive = existingRow && (existingRow.status === "active" || existingRow.status === "trialing");
  const planChanged = !existingRow || existingRow.plan !== planKey;
  if (isActive && (planChanged || !wasActive)) {
    await grantPlanCreditsIfNeeded(supabaseAdmin, userId, planKey);
  }
}

// customer.subscription.* イベントには、Checkout時にsubscription_data.metadataへ入れておいた
// supabase_user_idが載っているはずだが、念のため見つからない場合はstripe_subscription_idで引き当てる
async function findUserIdBySubscriptionId(supabaseAdmin, subscriptionId) {
  const { data, error } = await supabaseAdmin
    .from("subscriptions")
    .select("user_id")
    .eq("stripe_subscription_id", subscriptionId)
    .maybeSingle();
  if (error) {
    console.error("[stripe-webhook] stripe_subscription_idからのユーザー特定に失敗しました。subscription=" + subscriptionId, error);
  }
  return data ? data.user_id : null;
}

// customer.subscription.created / updated で共通の処理
// （created は初回契約時、updated はプラン変更・更新・支払い失敗などで発生する）
async function handleSubscriptionEvent(supabaseAdmin, subscription) {
  const userId =
    (subscription.metadata && subscription.metadata.supabase_user_id) ||
    (await findUserIdBySubscriptionId(supabaseAdmin, subscription.id));
  if (userId) {
    await upsertSubscription(supabaseAdmin, userId, subscription);
  } else {
    console.error(
      "[stripe-webhook] subscriptionイベントでユーザーを特定できませんでした" +
        "（metadata.supabase_user_id・subscriptionsテーブルのどちらからも見つからない）。subscription=" + subscription.id
    );
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "このAPIはPOSTメソッドのみ対応しています。" });
    return;
  }

  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) {
    console.error("[stripe-webhook] Stripeの環境変数（STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET）が未設定です。");
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
    // 署名が一致しない＝Stripe以外からのリクエストの可能性、またはSTRIPE_WEBHOOK_SECRETが
    // Stripe Dashboard側のこのエンドポイント用の値と一致していない可能性が高い
    console.error("[stripe-webhook] 署名検証に失敗しました:", error.message);
    res.status(400).json({ error: "署名の検証に失敗しました。" });
    return;
  }

  console.log("[stripe-webhook] event received: " + event.type + " (" + event.id + ")");

  let supabaseAdmin;
  try {
    supabaseAdmin = getSupabaseAdmin();
  } catch (error) {
    console.error("[stripe-webhook] " + error.message);
    res.status(500).json({ error: error.message });
    return;
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        if (session.mode === "subscription" && session.subscription) {
          const userId = session.client_reference_id || (session.metadata && session.metadata.supabase_user_id);
          const planKeyHint = session.metadata && session.metadata.plan;
          console.log(
            "[stripe-webhook] checkout.session.completed: user_id=" + userId +
              " plan_hint=" + planKeyHint + " subscription=" + session.subscription
          );
          if (userId) {
            const subscription = await stripe.subscriptions.retrieve(session.subscription);
            await upsertSubscription(supabaseAdmin, userId, subscription, planKeyHint);
          } else {
            console.error(
              "[stripe-webhook] checkout.session.completed: supabase_user_idを特定できませんでした" +
                "（client_reference_id・metadata.supabase_user_idのいずれも無い）。session=" + session.id
            );
          }
        } else {
          console.log(
            "[stripe-webhook] checkout.session.completed: サブスクリプション以外のセッションのため無視します。" +
              " mode=" + session.mode
          );
        }
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const subscription = event.data.object;
        await handleSubscriptionEvent(supabaseAdmin, subscription);
        break;
      }

      case "customer.subscription.deleted": {
        // 期間終了により契約が本当に終わったタイミング（cancel_at_period_end=trueで
        // 予約されていた解約が実行された瞬間、または即時解約）。ここで初めてstatusを
        // active/trialing以外にし、supabase/stripe_subscriptions.sqlの同期トリガーにより
        // profiles.planがfreeへ戻る＝AI機能が無効化される
        const subscription = event.data.object;
        const { error } = await supabaseAdmin
          .from("subscriptions")
          .update({ status: "canceled", cancel_at_period_end: false, updated_at: new Date().toISOString() })
          .eq("stripe_subscription_id", subscription.id);
        if (error) {
          console.error(
            "[stripe-webhook] subscriptionsテーブルの解約反映に失敗しました。subscription=" + subscription.id,
            error
          );
        } else {
          console.log("[stripe-webhook] 解約を反映しました（profiles.planはトリガー経由でfreeへ戻ります）。subscription=" + subscription.id);
        }
        break;
      }

      default:
        console.log("[stripe-webhook] 未対応のイベントのため無視します: " + event.type);
        break; // BookHubで扱わないイベントは何もしない（200を返してStripe側の再送を止める）
    }

    res.status(200).json({ received: true });
  } catch (error) {
    console.error("[stripe-webhook] Webhookの処理で例外が発生しました。event=" + event.type, error);
    res.status(500).json({ error: "Webhookの処理に失敗しました。" });
  }
};

// Vercelの標準ボディパーサーを無効にする（handler代入後に付けないと、代入時にconfigごと上書きされてしまう）
module.exports.config = { api: { bodyParser: false } };
