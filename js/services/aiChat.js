// ---------- AIチャット（/api/chat 経由でOpenAIと会話） ----------
// message（文字列）を渡すと、AIの返答（文字列）を返す。
// 使い方の例：
//   const reply = await sendChatMessage("こんにちは");

async function sendChatMessage(message) {
  console.log("[aiChat] リクエスト送信:", { message });

  let response;
  try {
    response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message })
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

  return data.reply;
}
