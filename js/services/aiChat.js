// ---------- AIチャット（/api/chat 経由でOpenAIと会話） ----------
// BookHubのAI機能（チャット・おすすめ本・クイズ・要約・学習コーチ）は、すべてこの関数だけを使って
// /api/chat（Vercel Function・共通のOpenAI呼び出しAPI）と通信する。機能ごとに通信処理を作り直さない。
//
// message（文字列）を渡すと、AIの返答を返す。
// options.instructions（文字列・任意）：AIへの役割・振る舞いの指示（システムプロンプトに相当）
// options.schema（{ name, schema }・任意）：指定すると、返答をこのJSON Schemaに沿った
//   オブジェクトとしてパースして返す（カード表示・クイズ表示など、構造が必要な機能で使う）
//
// 使い方の例：
//   const reply = await sendChatMessage("こんにちは"); // 文字列が返る
//   const data = await sendChatMessage(message, { instructions, schema }); // オブジェクトが返る

async function sendChatMessage(message, options) {
  options = options || {};
  console.log("[aiChat] リクエスト送信:", { message, hasSchema: !!options.schema });

  let response;
  try {
    response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: message,
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
  console.log("[aiChat] レスポンス受信:", { status: response.status, body: rawBody });

  let data = {};
  try {
    data = rawBody ? JSON.parse(rawBody) : {};
  } catch (parseError) {
    console.error("[aiChat] レスポンスをJSONとして解析できませんでした:", parseError);
  }

  if (!response.ok) {
    console.error("[aiChat] APIエラー:", { status: response.status, data });
    throw new Error(data.error || `AIとの通信に失敗しました。(status: ${response.status})`);
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
