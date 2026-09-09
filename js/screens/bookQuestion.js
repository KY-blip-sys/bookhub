// ---------- 本の詳細画面：「AIに質問」タブ ----------
// 開いている本のタイトル・著者・学んだこと／感想（js/services/aiContext.jsのcollectAiNotesForBook）を
// AIへの指示（instructions）として渡し、その本について自由に質問できるようにする。
// 通信はjs/services/aiChat.jsのsendChatMessage()経由で、共通の/api/chatだけを使う（feature: "bookQuestion"）。

const bookQuestionMessagesEl = document.getElementById("book-question-messages");
const bookQuestionEmptyMessageEl = document.getElementById("book-question-empty-message");
const bookQuestionForm = document.getElementById("book-question-form");
const bookQuestionInput = document.getElementById("book-question-input");
const bookQuestionSendButton = document.getElementById("book-question-send-button");
const bookQuestionCreditBannerEl = document.getElementById("book-question-credit-banner");

// 直前に「AIに質問」タブを開いていた本のid（別の本に切り替わったら会話をリセットするために覚えておく）
let bookQuestionCurrentBookId = null;

function scrollBookQuestionToBottom() {
  bookQuestionMessagesEl.scrollTop = bookQuestionMessagesEl.scrollHeight;
}

function appendBookQuestionBubble(text, className) {
  bookQuestionEmptyMessageEl.hidden = true;

  const bubble = document.createElement("div");
  bubble.className = "ai-chat-message " + className;
  bubble.textContent = text;
  bookQuestionMessagesEl.appendChild(bubble);
  scrollBookQuestionToBottom();
  return bubble;
}

// 本の詳細画面で「AIに質問」タブを開いたときの処理（js/screens/app.jsのshowDetailTabから呼ばれる）
function prepareBookQuestionTab(bookId) {
  if (bookId !== bookQuestionCurrentBookId) {
    // 別の本に切り替わったので、前の本についてのやり取りは残さずリセットする
    bookQuestionCurrentBookId = bookId;
    bookQuestionMessagesEl.querySelectorAll(".ai-chat-message").forEach(function (bubble) {
      bubble.remove();
    });
    bookQuestionEmptyMessageEl.hidden = false;
    hideInsufficientCreditBanner(bookQuestionCreditBannerEl); // js/screens/aiCredits.js
  }
  scrollBookQuestionToBottom();
  refreshAiAccessStatus(); // js/screens/aiCredits.js：AI利用可否・残高を最新化する
}

// この本についての質問に答えるための指示文（学んだこと・感想があれば参考情報として添える）
function buildBookQuestionInstructions(book) {
  const notes = collectAiNotesForBook(book); // js/services/aiContext.js

  const lines = [
    "あなたはBookHubという読書アプリの中で、ユーザーが登録した1冊の本について質問に答えるアシスタントです。",
    "対象の本：『" + book.title + "』" + (book.author ? " / " + book.author : "")
  ];
  if (notes.learnings.length > 0) {
    lines.push("この本についてユーザーが書いた「学んだこと」：" + notes.learnings.join(" ／ "));
  }
  if (notes.impressions.length > 0) {
    lines.push("この本についてユーザーが書いた「感想」：" + notes.impressions.join(" ／ "));
  }
  lines.push(
    "上記のメモを参考にしつつ、一般的な書籍の知識も使って、日本語で簡潔に答えてください。" +
    "わからないことは、それらしく作り話をせず「わからない」と正直に答えてください。"
  );
  return lines.join("\n");
}

bookQuestionForm.addEventListener("submit", async function (event) {
  event.preventDefault();

  const message = bookQuestionInput.value.trim();
  if (!message || !bookQuestionCurrentBookId) {
    return;
  }

  const book = loadBooks().find(function (b) {
    return b.id === bookQuestionCurrentBookId;
  });
  if (!book) {
    return;
  }

  hideInsufficientCreditBanner(bookQuestionCreditBannerEl); // js/screens/aiCredits.js
  appendBookQuestionBubble(message, "ai-chat-message-user");
  bookQuestionInput.value = "";

  bookQuestionSendButton.disabled = true;
  bookQuestionInput.disabled = true;
  const loadingBubble = appendBookQuestionBubble("考え中…", "ai-chat-message-ai ai-chat-message-loading");
  let lostAiAccess = false;

  try {
    const reply = await sendChatMessage(message, {
      feature: "bookQuestion",
      instructions: buildBookQuestionInstructions(book)
    });
    loadingBubble.textContent = reply || "（空の返答が返ってきました）";
    loadingBubble.className = "ai-chat-message ai-chat-message-ai";
  } catch (error) {
    if (error.insufficientCredit) {
      loadingBubble.remove();
      showInsufficientCreditBanner(bookQuestionCreditBannerEl);
    } else if (error.planNotEligible) {
      // ロック案内・入力欄の無効化はsendChatMessage内でapplyAiAccessStateがすでに反映済みなので、
      // このあとのfinallyで入力欄を再度有効化しないようにしておく
      loadingBubble.remove();
      lostAiAccess = true;
    } else {
      loadingBubble.textContent = error.message || "AIとの通信に失敗しました。";
      loadingBubble.className = "ai-chat-message ai-chat-message-error";
    }
  } finally {
    bookQuestionSendButton.disabled = lostAiAccess;
    bookQuestionInput.disabled = lostAiAccess;
    scrollBookQuestionToBottom();
    if (!lostAiAccess) {
      bookQuestionInput.focus();
    }
  }
});
