// ---------- 読了レビュー ----------

// レビューモーダルに使う要素を取得しておく
const reviewModal = document.getElementById("review-modal");
const reviewModalTitle = document.getElementById("review-modal-title");
const reviewStarPicker = document.getElementById("review-star-picker");
const reviewForm = document.getElementById("review-form");
const reviewBodyInput = document.getElementById("review-body");
const reviewFavoriteQuoteInput = document.getElementById("review-favorite-quote");
const reviewSpoilerField = document.getElementById("review-spoiler-field");
const reviewSpoilerCheckbox = document.getElementById("review-spoiler-checkbox");
const reviewCancelButton = document.getElementById("review-cancel-button");

// 読み終えた直後だけ表示する、達成感を伝えるヘッダーの要素
const reviewCelebrationHeader = document.getElementById("review-celebration-header");
const reviewCelebrationCover = document.getElementById("review-celebration-cover");
const reviewCelebrationStat = document.getElementById("review-celebration-stat");
const reviewCelebrationStatSecondary = document.getElementById("review-celebration-stat-secondary");

// 本の詳細画面に表示する、レビュー欄の要素を取得しておく
const reviewDisplay = document.getElementById("review-display");
const writeReviewButton = document.getElementById("write-review-button");

// 今、レビューモーダルで開いている本のid（開いていなければnull）
let reviewModalBookId = null;

// レビューモーダルの★評価（未選択なら0）
let selectedReviewRating = 0;

// 「読み終えた直後」の文脈で開いているかどうか（true のときだけ、達成感ヘッダーを出し、
// 感想を保存したあとに読了カードを続けて見せる。あとから編集で開いたときはfalseのまま）
let reviewModalIsCelebratory = false;

// レビューモーダルの★ボタンを組み立てる（共通部品はjs/screens/starPicker.js）
function buildReviewStarButtons() {
  buildStarPicker(reviewStarPicker, selectedReviewRating, function (rating) {
    selectedReviewRating = rating;
  });
}

// 指定した本のレビューモーダルを開く（既にレビューがあれば編集として開く）。
// options.celebratory を true にすると、読み終えた直後の文脈として、表紙つきの達成感ヘッダーを出す
// （すでにレビュー済みの本を、あとから見直して開いた場合は celebratory を渡しても表示しない）
function openReviewModal(bookId, options) {
  const opts = options || {};

  const books = loadBooks();
  const book = books.find(function (b) {
    return b.id === bookId;
  });
  if (!book) {
    return;
  }

  reviewModalBookId = bookId;
  const existingReview = getReviewForBook(bookId);
  reviewModalIsCelebratory = !!opts.celebratory && !existingReview;

  if (reviewModalIsCelebratory) {
    reviewCelebrationCover.innerHTML = "";
    reviewCelebrationCover.appendChild(buildBookCoverContent(book, "review-celebration-cover-initial"));

    reviewCelebrationStat.textContent = book.pageCount ? book.pageCount + "ページ読み終えました" : "読み終えました";

    // 「何を得たか」を振り返れるよう、すでに保存されている学び・実践の件数もあわせて見せる
    const learningCount = loadFavoriteLearnings().filter(function (learning) {
      return learning.bookId === book.id;
    }).length;
    const secondaryParts = [];
    if (learningCount > 0) {
      secondaryParts.push("学んだこと" + learningCount + "件");
    }
    const doneActionCount = loadActions().filter(function (action) {
      return action.bookId === book.id && action.status === "done";
    }).length;
    if (doneActionCount > 0) {
      secondaryParts.push("実践" + doneActionCount + "件");
    }
    reviewCelebrationStatSecondary.textContent = secondaryParts.join("・");

    reviewCelebrationHeader.hidden = false;
  } else {
    reviewCelebrationHeader.hidden = true;
  }

  reviewModalTitle.textContent = existingReview ? "感想を編集する" : "この本はどうでしたか？";
  selectedReviewRating = existingReview ? existingReview.rating : 0;
  reviewBodyInput.value = existingReview ? existingReview.body : "";
  reviewFavoriteQuoteInput.value = existingReview ? (existingReview.favoriteQuote || "") : "";
  reviewSpoilerCheckbox.checked = existingReview ? existingReview.containsSpoiler : false;

  buildReviewStarButtons();
  reviewModal.hidden = false;
}

// レビューモーダルを閉じる
function closeReviewModal() {
  reviewModal.hidden = true;
  reviewModalBookId = null;
  reviewModalIsCelebratory = false;
  reviewCelebrationHeader.hidden = true;
  reviewForm.reset();
}

reviewCancelButton.addEventListener("click", closeReviewModal);

bindModalDismissal(reviewModal, closeReviewModal);

// レビューフォームが送信されたら保存する
reviewForm.addEventListener("submit", function (event) {
  event.preventDefault();

  if (selectedReviewRating === 0 || reviewModalBookId === null) {
    return; // 星が選ばれていなければ何もしない
  }

  const books = loadBooks();
  const book = books.find(function (b) {
    return b.id === reviewModalBookId;
  });
  if (!book) {
    return;
  }

  const wasCelebratory = reviewModalIsCelebratory; // closeReviewModal()でリセットされる前に覚えておく

  saveReview(book.id, book.category, {
    rating: selectedReviewRating,
    body: reviewBodyInput.value.trim(),
    favoriteQuote: reviewFavoriteQuoteInput.value.trim(),
    containsSpoiler: reviewSpoilerCheckbox.checked
  });

  closeReviewModal();
  showToast("感想を保存しました");
  renderBookReview(book.id);

  // 読み終えた直後の感想だけ、そのままの流れで読了カード（表紙・評価・共有ボタン）を見せる。
  // あとから編集で開いたときは、感想を直すだけで完結させ、毎回カードを出さない。
  if (wasCelebratory) {
    setTimeout(openShareCardModal, 400);
  }
});

// 「感想を書く」ボタンが押されたら、今開いている本のレビューモーダルを開く
writeReviewButton.addEventListener("click", function () {
  openReviewModal(currentBookId);
});

// 本の詳細画面に、保存済みの感想を表示する（無ければボタンだけ見せる）
function renderBookReview(bookId) {
  const review = getReviewForBook(bookId);
  reviewDisplay.innerHTML = "";

  if (!review) {
    writeReviewButton.textContent = "感想を書く";
    return;
  }

  writeReviewButton.textContent = "感想を編集する";

  const card = document.createElement("div");
  card.className = "review-card";

  const ratingEl = document.createElement("p");
  ratingEl.className = "review-rating";
  ratingEl.textContent = "★".repeat(review.rating) + "☆".repeat(5 - review.rating);
  ratingEl.setAttribute("aria-label", "評価5段階中" + review.rating);
  card.appendChild(ratingEl);

  if (review.containsSpoiler) {
    card.appendChild(buildSpoilerGatedReviewBody(review));
  } else {
    const bodyEl = document.createElement("p");
    bodyEl.className = "review-body";
    bodyEl.textContent = review.body || "（本文はありません）";
    card.appendChild(bodyEl);
  }

  if (review.favoriteQuote && !review.containsSpoiler) {
    const quoteEl = document.createElement("p");
    quoteEl.className = "review-favorite-quote";
    quoteEl.textContent = "「" + review.favoriteQuote + "」";
    card.appendChild(quoteEl);
  }

  const dateEl = document.createElement("p");
  dateEl.className = "review-date";
  dateEl.textContent = "投稿日：" + new Date(review.createdAt).toLocaleDateString("ja-JP");
  card.appendChild(dateEl);

  reviewDisplay.appendChild(card);
}

// ネタバレありのレビューを、警告＋「表示する」ボタンでガードして組み立てる
function buildSpoilerGatedReviewBody(review) {
  const wrapper = document.createElement("div");
  wrapper.className = "review-spoiler-wrapper";

  const warning = document.createElement("div");
  warning.className = "review-spoiler-warning";

  const warningText = document.createElement("p");
  warningText.textContent = "⚠ このレビューにはネタバレが含まれています";
  warning.appendChild(warningText);

  const revealButton = document.createElement("button");
  revealButton.type = "button";
  revealButton.textContent = "表示する";
  revealButton.addEventListener("click", function () {
    const bodyEl = document.createElement("p");
    bodyEl.className = "review-body";
    bodyEl.textContent = review.body || "（本文はありません）";
    wrapper.replaceChildren(bodyEl);
  });
  warning.appendChild(revealButton);

  wrapper.appendChild(warning);
  return wrapper;
}

// ---------- 読了カード（将来のSNS共有機能の土台） ----------
// 読み終えた本だけ、表紙・タイトル・評価をまとめたカードを見られるようにする。
// 今はカードを見る／テキストを共有・コピーするだけで、画像化やSNS投稿は今後の拡張として残している。

const shareSection = document.getElementById("share-section");
const openShareCardButton = document.getElementById("open-share-card-button");
const shareCardModal = document.getElementById("share-card-modal");
const shareCardCloseButton = document.getElementById("share-card-close-button");
const shareCardCover = document.getElementById("share-card-cover");
const shareCardTitle = document.getElementById("share-card-title");
const shareCardAuthor = document.getElementById("share-card-author");
const shareCardRating = document.getElementById("share-card-rating");
const shareCardQuote = document.getElementById("share-card-quote");
const shareCardFooterLine = document.getElementById("share-card-footer-line");
const shareCardShareButton = document.getElementById("share-card-share-button");
const shareCardCopiedNote = document.getElementById("share-card-copied-note");

// 本の詳細画面を開くたびに呼ばれる。読み終えた本のときだけ「読了カードを見る」ボタンを出す
function updateShareSectionVisibility(book) {
  const isFinished = !!(book.pageCount && getComputedCurrentPage(book) >= book.pageCount);
  shareSection.hidden = !isFinished;
}

// 読了カードの中身を、今開いている本の情報で組み立てて表示する
function openShareCardModal() {
  const books = loadBooks();
  const book = books.find(function (b) {
    return b.id === currentBookId;
  });
  if (!book) {
    return;
  }

  shareCardCover.innerHTML = "";
  shareCardCover.appendChild(buildBookCoverContent(book, "share-card-cover-initial"));

  shareCardTitle.textContent = book.title;
  shareCardAuthor.textContent = book.author || "";

  const review = getReviewForBook(book.id);
  shareCardRating.textContent = review ? "★".repeat(review.rating) + "☆".repeat(5 - review.rating) : "";
  if (review) {
    shareCardRating.setAttribute("aria-label", "評価5段階中" + review.rating);
  } else {
    shareCardRating.removeAttribute("aria-label");
  }

  // カードの引用：好きだった文章があればそれを、無ければ感想本文を短く区切って使う。
  // ネタバレ付きの感想は共有カードに出さない
  if (review && !review.containsSpoiler && (review.favoriteQuote || review.body)) {
    const quoteLimit = 42;
    const sourceText = review.favoriteQuote || review.body;
    const quoteText = sourceText.length > quoteLimit ? sourceText.slice(0, quoteLimit) + "…" : sourceText;
    shareCardQuote.textContent = "「" + quoteText + "」";
    shareCardQuote.hidden = false;
  } else {
    shareCardQuote.hidden = true;
  }

  // 読了日：感想を書いていればその投稿日を目安にする
  const finishedDateLabel = review ? new Date(review.createdAt).toLocaleDateString("ja-JP") : "";

  const footerParts = [];
  if (finishedDateLabel) {
    footerParts.push(finishedDateLabel + " 読了");
  }
  if (book.pageCount) {
    footerParts.push(book.pageCount + "ページ");
  }
  shareCardFooterLine.textContent = footerParts.join(" ・ ");

  shareCardModal.hidden = false;
}

function closeShareCardModal() {
  shareCardModal.hidden = true;
  shareCardCopiedNote.hidden = true;
}

openShareCardButton.addEventListener("click", openShareCardModal);
shareCardCloseButton.addEventListener("click", closeShareCardModal);

bindModalDismissal(shareCardModal, closeShareCardModal);

// このブラウザが対応していれば「共有する」ボタンを出す（対応していない場合は、カードを見て
// 自分でスクリーンショットしてもらう形になる。将来的にはここでカード画像を生成して共有する想定）
if (navigator.share) {
  shareCardShareButton.hidden = false;
  shareCardShareButton.addEventListener("click", function () {
    navigator.share({
      title: shareCardTitle.textContent,
      text: "「" + shareCardTitle.textContent + "」を読了しました！" + shareCardFooterLine.textContent
    }).catch(function () {
      // ユーザーが共有をキャンセルしただけの場合も含まれるため、エラー表示はしない
    });
  });
} else if (navigator.clipboard) {
  // Web Share API が無いブラウザでは、テキストのコピーで代用する
  shareCardShareButton.hidden = false;
  shareCardShareButton.textContent = "この記録をコピーする";
  shareCardShareButton.addEventListener("click", function () {
    const text = "「" + shareCardTitle.textContent + "」を読了しました！" + shareCardFooterLine.textContent;
    navigator.clipboard.writeText(text).then(function () {
      shareCardCopiedNote.hidden = false;
    });
  });
}
