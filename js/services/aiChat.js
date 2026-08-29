// ---------- AIチャット（/api/chat 経由でOpenAIと会話） ----------
// BookHubのAI機能（チャット・おすすめ本・クイズ・要約・学習コーチ・本についての質問）は、
// すべてこの関数だけを使って/api/chat（Vercel Function・共通のOpenAI呼び出しAPI）と通信する。
// 機能ごとに通信処理を作り直さない。
//
// message（文字列）を渡すと、AIの返答を返す。
// options.feature（文字列・必須）：呼び出すAI機能名（api/_lib/aiCredits.jsのFEATURE_COSTS参照）。
//   AIクレジットの消費量はサーバー側でこのfeatureから決まる。
// options.instructions（文字列・任意）：AIへの役割・振る舞いの指示（システムプロンプトに相当）
// options.schema（{ name, schema }・任意）：指定すると、返答をこのJSON Schemaに沿った
//   オブジェクトとしてパースして返す（カード表示・クイズ表示など、構造が必要な機能で使う）
//
// 使い方の例：
//   const reply = await sendChatMessage("こんにちは", { feature: "chat" }); // 文字列が返る
//   const data = await sendChatMessage(message, { feature: "recommend", instructions, schema }); // オブジェクトが返る
//
// AIクレジットが不足している場合、投げるエラーのerror.insufficientCreditがtrueになる
// （呼び出し側は、これを見て「AIクレジットが不足しています」の案内を出す）。
// Free・PlusプランなどAI機能自体が使えないプランの場合、error.planNotEligibleがtrueになる
// （画面側の対応はjs/screens/aiCredits.jsのapplyAiAccessStateがまとめて行うため、
//   呼び出し側で個別に案内を出す必要は基本的にない）。

async function sendChatMessage(message, options) {
  options = options || {};

  // ログイン中のSupabaseセッションからアクセストークンを取り出し、Authorizationヘッダーで送る
  // （/api/chatはこのトークンで「誰の呼び出しか」を確認し、その人のAIクレジットを判定・消費する）
  let accessToken = null;
  if (window.sb) {
    const { data: sessionData } = await window.sb.auth.getSession();
    accessToken = sessionData.session ? sessionData.session.access_token : null;
  }

  const headers = { "Content-Type": "application/json" };
  if (accessToken) {
    headers.Authorization = "Bearer " + accessToken;
  }

  let response;
  try {
    response = await fetch("/api/chat", {
      method: "POST",
      headers: headers,
      body: JSON.stringify({
        message: message,
        feature: options.feature,
        instructions: options.instructions,
        schema: options.schema
      })
    });
  } catch (networkError) {
    // fetch自体が失敗する場合（オフライン、CORS、URLが間違っている等）
    console.error("[aiChat] fetchが失敗しました（ネットワークエラー）:", networkError);
    throw new Error("サーバーに接続できませんでした。通信環境を確認してください。");
  }

  // レスポンスをまず生テキストで受け取る（JSONでない場合＝サーバー側でクラッシュしている等も見えるように）
  const rawBody = await response.text();

  let data = {};
  try {
    data = rawBody ? JSON.parse(rawBody) : {};
  } catch (parseError) {
    console.error("[aiChat] レスポンスをJSONとして解析できませんでした:", parseError);
  }

  // 最新のAIクレジット残高・AI利用可否が返ってきていれば（成功時・エラー時のどちらでも）、画面の表示を更新する
  // （js/screens/aiCredits.js。読み込まれていない画面から呼ばれる可能性もあるため存在確認する）
  if (data.credits && typeof applyAiAccessState === "function") {
    applyAiAccessState(data.credits);
  }

  if (!response.ok) {
    console.error("[aiChat] APIエラー:", { status: response.status, data });
    const error = new Error(data.error || `AIとの通信に失敗しました。(status: ${response.status})`);
    if (response.status === 402) {
      error.insufficientCredit = true;
    }
    if (response.status === 403) {
      error.planNotEligible = true;
    }
    error.credits = data.credits || null;
    throw error;
  }

  if (options.schema) {
    try {
      return JSON.parse(data.reply);
    } catch (parseError) {
      console.error("[aiChat] AIの返答をJSONとして解析できませんでした:", parseError, data.reply);
      throw new Error("AIの返答をうまく読み取れませんでした。もう一度お試しください。");
    }
  }

  return data.reply;
}
