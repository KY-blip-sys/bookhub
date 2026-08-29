// ---------- AIチャット（/api/chat 経由でOpenAIと会話） ----------
// message（文字列）を渡すと、AIの返答（文字列）を返す。
// 使い方の例：
//   const reply = await sendChatMessage("こんにちは");

async function sendChatMessage(message) {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message })
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || "AIとの通信に失敗しました。");
  }

  return data.reply;
}
