// ---------- AIチャット画面 ----------
// js/services/aiChat.jsのsendChatMessage()を使って、共通の/api/chat（Vercel Function）と会話する。
// /api/chatは1メッセージずつしか受け取らない単純なAPIなので、これまでのやり取りは
// この画面の中に表示として積み上げているだけで、サーバー側には会話履歴として送っていない
// （AIは毎回、直前のやり取りを覚えていない状態で返答する）。

const aiChatMessagesEl = document.getElementById("ai-chat-messages");
const aiChatEmptyMessageEl = document.getElementById("ai-chat-empty-message");
const aiChatForm = document.getElementById("ai-chat-form");
const aiChatInput = document.getElementById("ai-chat-input");
const aiChatSendButton = document.getElementById("ai-chat-send-button");

// メッセージ欄をいちばん下までスクロールする（新しい発言・返答が来るたびに呼ぶ）
function scrollAiChatToBottom() {
  aiChatMessagesEl.scrollTop = aiChatMessagesEl.scrollHeight;
}

// 吹き出しを1つ追加して、その要素を返す（返答待ち表示をあとから書き換えるときに使う）
function appendAiChatBubble(text, className) {
  aiChatEmptyMessageEl.hidden = true;

  const bubble = document.createElement("div");
  bubble.className = "ai-chat-message " + className;
  bubble.textContent = text;
  aiChatMessagesEl.appendChild(bubble);
  scrollAiChatToBottom();
  return bubble;
}

// AIチャット画面を開いたときの処理（js/screens/app.jsのgoToNavPageから呼ばれる）。
// 会話履歴はそのまま保持し、最後に見ていた位置までスクロールし直すだけでよい
function prepareAiChatScreen() {
  scrollAiChatToBottom();
}

aiChatForm.addEventListener("submit", async function (event) {
  event.preventDefault();

  const message = aiChatInput.value.trim();
  if (!message) {
    return;
  }

  appendAiChatBubble(message, "ai-chat-message-user");
  aiChatInput.value = "";

  aiChatSendButton.disabled = true;
  aiChatInput.disabled = true;
  const loadingBubble = appendAiChatBubble("考え中…", "ai-chat-message-ai ai-chat-message-loading");

  try {
    const reply = await sendChatMessage(message); // js/services/aiChat.js（内部でPOST /api/chatを呼ぶ）
    loadingBubble.textContent = reply || "（空の返答が返ってきました）";
    loadingBubble.className = "ai-chat-message ai-chat-message-ai";
  } catch (error) {
    loadingBubble.textContent = error.message || "AIとの通信に失敗しました。";
    loadingBubble.className = "ai-chat-message ai-chat-message-error";
  } finally {
    aiChatSendButton.disabled = false;
    aiChatInput.disabled = false;
    scrollAiChatToBottom();
    aiChatInput.focus();
  }
});
