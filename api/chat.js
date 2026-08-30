// BookHub: OpenAI APIとチャットするためのサーバー関数（Vercelが自動で動かす）。
//
// AIチャット・AIによる本の推薦・AIクイズ・AI要約・AI学習コーチ・本についての質問など、AIを使うすべての機能は
// このエンドポイント1つだけを共通で利用する（機能ごとに通信処理を作り直さない）。
//
// AIクレジット制：どのAI機能も「無料・プレミアムともにAIクレジットを消費する」ため、呼び出しごとに
//   ① ログインユーザー取得 → ② 月替わりのクレジットリセット → ③ 必要クレジットの決定 →
//   ④ 残高判定（不足ならOpenAIを呼ばずに終了） → ⑤ OpenAI実行 → 成功したらクレジットを減算
// という共通処理を、機能名（feature）によらず1つの流れで行う。
// クレジットの実際の判定・増減はSupabase側のSECURITY DEFINER関数（supabase/ai_credits.sql）が担い、
// このファイルは「どの機能がいくら消費するか」（api/_lib/aiCredits.js）を渡して呼び出すだけにする。
//
// APIキーはGitHubに公開しているコードには書かず、Vercelの環境変数として保存し、
// この関数経由（サーバー側）でのみ読み込む。ブラウザには一切渡さない。
//
// 必要なVercelの環境変数：
//   OPENAI_API_KEY … OpenAIのAPIキー（https://platform.openai.com/api-keys で発行）
//   SUPABASE_URL / SUPABASE_ANON_KEY … api/config.jsと共通（クレジット判定にも使う）
//
// 呼び出し方：
//   POST /api/chat に
//   { "message": "...", "feature": "chat" }
//   を、Authorizationヘッダー（"Bearer " + Supabaseのアクセストークン）付きで送ると
//   { "reply": "...", "credits": { "plan": "premium", "remaining": 995, "monthlyLimit": 1000, "aiEnabled": true, "ads": false } }
//   のようにOpenAIの返答と最新のクレジット残高が返る。
//   Free・PlusプランなどAIが使えないプランの場合は403、クレジット残高不足の場合は402が返る
//   （どちらもOpenAI APIは呼ばれない）。
//
//   機能ごとの役割（instructions）を伝えたい場合や、カード表示・クイズ表示のためにAIの返答を
//   JSONの形で受け取りたい場合は、
//   { "message": "...", "feature": "...", "instructions": "...", "schema": { "name": "...", "schema": {...} } }
//   のように追加のフィールドを渡す（js/services/aiChat.jsのsendChatMessage参照）。
//   schemaを渡すと、replyには文字列として整形済みのJSON文字列が入って返る。
//
//   featureに指定できる機能名・消費クレジットはapi/_lib/aiCredits.jsのFEATURE_COSTS参照。

const OpenAI = require("openai");
const { getAuthenticatedUser } = require("./_lib/supabaseUser");
const { MONTHLY_CREDITS, AI_ENABLED_PLANS, getFeatureCost, getPlanAds } = require("./_lib/aiCredits");

let client = null;
function getClient() {
  if (!client) {
    client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return client;
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.status(405).json({ error: "このAPIはPOSTメソッドのみ対応しています。" });
    return;
  }

  if (!process.env.OPENAI_API_KEY) {
    console.error("OPENAI_API_KEYが設定されていません。");
    res.status(500).json({
      error: "AI機能を利用できませんでした。しばらくしてから再度お試しください。"
    });
    return;
  }

  const { message, instructions, schema, feature } = req.body || {};
  if (!message || typeof message !== "string") {
    res.status(400).json({ error: "リクエストの内容が正しくありません。" });
    return;
  }

  let cost;
  try {
    cost = getFeatureCost(feature);
  } catch (error) {
    res.status(400).json({ error: error.message });
    return;
  }

  // ① ログインユーザー取得
  const auth = await getAuthenticatedUser(req);
  if (!auth) {
    res.status(401).json({ error: "ログインが必要です。" });
    return;
  }

  // ②③④ 月替わりのクレジットリセット・プランのAI利用可否・必要クレジットの判定・残高判定
  // （Supabase側で原子的に処理する）
  const { data: checkResult, error: checkError } = await auth.supabase.rpc("check_ai_credit", {
    p_cost: cost,
    p_monthly_credits: MONTHLY_CREDITS,
    p_ai_enabled_plans: AI_ENABLED_PLANS
  });

  if (checkError) {
    console.error("AIクレジットの判定処理でエラーが発生しました:", checkError);
    res.status(500).json({ error: "AIクレジットの確認中にエラーが発生しました。" });
    return;
  }

  if (!checkResult || !checkResult.ok) {
    if (checkResult && checkResult.error === "plan_not_eligible") {
      // Free・PlusプランなどAIが使えないプラン：OpenAI APIは呼ばない
      res.status(403).json({
        error: "AI機能はPremiumプラン以上で利用できます。",
        credits: {
          plan: checkResult.plan,
          remaining: checkResult.remaining,
          monthlyLimit: checkResult.monthlyLimit,
          aiEnabled: false,
          ads: getPlanAds(checkResult.plan)
        }
      });
      return;
    }
    if (checkResult && checkResult.error === "insufficient_credit") {
      // 残高不足：OpenAI APIは呼ばない
      res.status(402).json({
        error: "AIクレジットが不足しています。",
        credits: {
          plan: checkResult.plan,
          remaining: checkResult.remaining,
          monthlyLimit: checkResult.monthlyLimit,
          aiEnabled: true,
          ads: getPlanAds(checkResult.plan)
        }
      });
      return;
    }
    res.status(401).json({ error: "ログインが必要です。" });
    return;
  }

  // ⑤ AI実行
  try {
    const openai = getClient();

    const request = {
      model: "gpt-5-mini",
      input: message
    };

    if (instructions && typeof instructions === "string") {
      request.instructions = instructions;
    }

    // schema（{ name, schema }）が指定されたときだけ、AIの返答をJSON構造で受け取る
    // （おすすめ本のカード・クイズの問題・要約・学習コーチなど、表示側で組み立てが必要な機能で使う）
    if (schema && typeof schema === "object" && schema.name && schema.schema) {
      request.text = {
        format: {
          type: "json_schema",
          name: schema.name,
          schema: schema.schema,
          strict: true
        }
      };
    }

    const response = await openai.responses.create(request);
    const reply = response.output_text ?? "";

    // 成功したのでクレジットを減算する
    const { data: deductResult, error: deductError } = await auth.supabase.rpc("deduct_ai_credit", {
      p_cost: cost
    });
    if (deductError) {
      console.error("AIクレジットの減算に失敗しました:", deductError);
    }

    res.status(200).json({
      reply,
      credits: {
        plan: checkResult.plan,
        remaining: deductResult && deductResult.ok ? deductResult.remaining : checkResult.remaining,
        monthlyLimit: checkResult.monthlyLimit,
        aiEnabled: true,
        ads: getPlanAds(checkResult.plan)
      }
    });
  } catch (error) {
    console.error("OpenAI API呼び出しエラー:", error);
    res.status(500).json({
      error: "OpenAIとの通信中にエラーが発生しました。しばらくしてから再試行してください。"
    });
  }
};
