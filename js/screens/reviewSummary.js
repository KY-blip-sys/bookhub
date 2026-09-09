// ---------- 感想まとめ画面（小説専用） ----------
// 読んだ本を四角いブロックで並べ、押すと自分の書いたレビュー・読書中の感想がモーダルで見られる。

const reviewSummaryList = document.getElementById("review-summary-list");
const reviewSummaryEmptyMessage = document.getElementById("review-summary-empty-message");

// 今、編集中の「読書中の感想」のキー（bookId + "-" + recordIndex。編集していなければnull）
let editingImpressionKey = null;

// 感想まとめ画面を、今保存されている感想・レビューの内容で描画し直す
function renderReviewSummary() {
  const books = getBooksByCategory("novel");
  reviewSummaryList.innerHTML = "";

  const booksWithImpressions = books.filter(function (book) {
    return getReviewForBook(book.id) || bookHasImpressionRecord(book);
  });

  reviewSummaryEmptyMessage.hidden = booksWithImpressions.length > 0;

  booksWithImpressions.forEach(function (book) {
    reviewSummaryList.appendChild(buildReviewSummaryBookCard(book));
  });

  // 開いたままのモーダルがあれば、最新のデータで表示し直す
  if (openReviewSummaryBookId !== null) {
    renderReviewSummaryDetailModal();
  }
}

// この本の読書記録に、感想が1件でも書かれているか
function bookHasImpressionRecord(book) {
  return book.records.some(function (record) {
    return record.impression;
  });
}

// 本1冊ぶんの四角いブロック（タイトル・評価の要点だけを表示し、押すと詳細モーダルを開く）
function buildReviewSummaryBookCard(book) {
  const li = document.createElement("li");
  li.className = "review-summary-book-card";
  li.addEventListener("click", function () {
    openReviewSummaryDetail(book.id);
  });

  const titleEl = document.createElement("p");
  titleEl.className = "review-summary-book-card-title";
  titleEl.textContent = book.title;
  li.appendChild(titleEl);

  if (book.author) {
    const authorEl = document.createElement("p");
    authorEl.className = "review-summary-book-card-author";
    authorEl.textContent = book.author;
    li.appendChild(authorEl);
  }

  const review = getReviewForBook(book.id);
  if (review) {
    const ratingEl = document.createElement("p");
    ratingEl.className = "review-summary-book-card-rating";
    ratingEl.textContent = "★".repeat(review.rating) + "☆".repeat(5 - review.rating);
    ratingEl.setAttribute("aria-label", "評価5段階中" + review.rating);
    li.appendChild(ratingEl);
  }

  // 感想の最初の2行だけを、カードの上で読めるようにする（ネタバレを含むレビューは伏せておく）
  const previewText = getReviewSummaryPreviewText(book, review);
  if (previewText) {
    const previewEl = document.createElement("p");
    previewEl.className = "review-summary-book-card-preview";
    previewEl.textContent = previewText;
    li.appendChild(previewEl);
  }

  const hintEl = document.createElement("p");
  hintEl.className = "review-summary-book-card-hint";
  hintEl.textContent = "タップして感想を見る";
  li.appendChild(hintEl);

  return li;
}

// カードに載せるプレビュー文を選ぶ（レビュー本文を優先し、無ければ直近の「読書中の感想」を使う。
// ネタバレを含むレビューは、一覧でうっかり読めてしまわないよう伏せる）
function getReviewSummaryPreviewText(book, review) {
  if (review) {
    return review.containsSpoiler ? "" : review.body;
  }

  const impressionRecords = book.records.filter(function (record) {
    return record.impression;
  });
  if (impressionRecords.length === 0) {
    return "";
  }
  return impressionRecords[impressionRecords.length - 1].impression;
}

// ---------- 本ごとの感想の詳細モーダル ----------

const reviewSummaryDetailModal = document.getElementById("review-summary-detail-modal");
const reviewSummaryDetailTitle = document.getElementById("review-summary-detail-title");
const reviewSummaryDetailBody = document.getElementById("review-summary-detail-body");
const reviewSummaryDetailCloseButton = document.getElementById("review-summary-detail-close-button");

// 今、詳細モーダルで開いている本のid（開いていなければnull）
let openReviewSummaryBookId = null;

// 指定した本の感想の詳細モーダルを開く
function openReviewSummaryDetail(bookId) {
  openReviewSummaryBookId = bookId;
  renderReviewSummaryDetailModal();
}

function closeReviewSummaryDetail() {
  reviewSummaryDetailModal.hidden = true;
  openReviewSummaryBookId = null;
  editingImpressionKey = null;
}

reviewSummaryDetailCloseButton.addEventListener("click", closeReviewSummaryDetail);
bindModalDismissal(reviewSummaryDetailModal, closeReviewSummaryDetail);

// 開いている本のレビュー・感想を、今のデータでモーダルに描画し直す
function renderReviewSummaryDetailModal() {
  const books = getBooksByCategory("novel");
  const book = books.find(function (b) {
    return b.id === openReviewSummaryBookId;
  });
  if (!book) {
    closeReviewSummaryDetail();
    return;
  }

  reviewSummaryDetailModal.hidden = false;
  reviewSummaryDetailTitle.textContent = book.title;

  reviewSummaryDetailBody.innerHTML = "";
  fillReviewSummaryBody(reviewSummaryDetailBody, book);
}

// 展開した本の中身（読了レビュー＋読書中の感想）を組み立てる。
// レビューは「レビューを書く／編集」ボタンから、感想はそれぞれの「編集」「削除」からあとから修正できる。
function fillReviewSummaryBody(body, book) {
  const review = getReviewForBook(book.id);

  const reviewCard = document.createElement("div");
  reviewCard.className = "review-summary-review";

  if (review) {
    const ratingEl = document.createElement("p");
    ratingEl.className = "review-rating";
    ratingEl.textContent = "★".repeat(review.rating) + "☆".repeat(5 - review.rating);
    ratingEl.setAttribute("aria-label", "評価5段階中" + review.rating);
    reviewCard.appendChild(ratingEl);

    if (review.containsSpoiler) {
      // reviews.jsの関数（ネタバレ警告つきの本文表示）を再利用する
      reviewCard.appendChild(buildSpoilerGatedReviewBody(review));
    } else {
      const bodyEl = document.createElement("p");
      bodyEl.className = "review-body";
      bodyEl.textContent = review.body || "（本文はありません）";
      reviewCard.appendChild(bodyEl);
    }
  } else {
    const noReviewEl = document.createElement("p");
    noReviewEl.className = "review-body";
    noReviewEl.textContent = "まだレビューを書いていません。";
    reviewCard.appendChild(noReviewEl);
  }

  const reviewButtons = document.createElement("div");
  reviewButtons.className = "review-summary-review-buttons";

  const editReviewButton = document.createElement("button");
  editReviewButton.type = "button";
  editReviewButton.textContent = review ? "レビューを編集" : "レビューを書く";
  editReviewButton.addEventListener("click", function (event) {
    event.stopPropagation();
    closeReviewSummaryDetail(); // 感想の詳細モーダルを閉じてから、レビューの編集モーダルを開く
    openReviewModal(book.id); // reviews.js（既にレビューがあれば編集として開く）
  });
  reviewButtons.appendChild(editReviewButton);

  reviewCard.appendChild(reviewButtons);
  body.appendChild(reviewCard);

  // 記録のインデックス（recordIndex）を保ったまま、感想が書かれている記録だけを取り出す
  const impressionRecords = [];
  book.records.forEach(function (record, recordIndex) {
    if (record.impression) {
      impressionRecords.push({ record: record, recordIndex: recordIndex });
    }
  });

  if (impressionRecords.length > 0) {
    const heading = document.createElement("h4");
    heading.className = "review-summary-heading";
    heading.textContent = "読書中の感想";
    body.appendChild(heading);

    const list = document.createElement("ul");
    list.className = "review-summary-impression-list";
    impressionRecords.forEach(function (entry) {
      list.appendChild(buildImpressionItem(book, entry.record, entry.recordIndex));
    });
    body.appendChild(list);
  }
}

// 「読書中の感想」1件ぶんの表示（編集中は入力フォームを表示する）
function buildImpressionItem(book, record, recordIndex) {
  const li = document.createElement("li");
  const key = book.id + "-" + recordIndex;

  if (editingImpressionKey === key) {
    li.appendChild(buildImpressionEditForm(book, record, recordIndex));
    return li;
  }

  const textEl = document.createElement("p");
  textEl.className = "review-summary-impression-text";
  textEl.textContent = record.date + "：" + record.impression;
  li.appendChild(textEl);

  const buttonGroup = document.createElement("span");
  buttonGroup.className = "quote-card-button-group";

  const editButton = document.createElement("button");
  editButton.type = "button";
  editButton.className = "quote-card-edit-button";
  editButton.textContent = "編集";
  editButton.addEventListener("click", function () {
    editingImpressionKey = key;
    renderReviewSummary();
  });
  buttonGroup.appendChild(editButton);

  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.className = "danger-button";
  deleteButton.textContent = "削除";
  deleteButton.addEventListener("click", function () {
    deleteImpression(book.id, recordIndex);
  });
  buttonGroup.appendChild(deleteButton);

  li.appendChild(buttonGroup);

  return li;
}

// 「読書中の感想」を修正するフォームを組み立てる
function buildImpressionEditForm(book, record, recordIndex) {
  const form = document.createElement("form");
  form.className = "quote-edit-form";

  const textarea = document.createElement("textarea");
  textarea.rows = 3;
  textarea.value = record.impression;
  form.appendChild(textarea);

  const buttonsRow = document.createElement("div");
  buttonsRow.className = "action-form-buttons";

  const saveButton = document.createElement("button");
  saveButton.type = "submit";
  saveButton.textContent = "保存";
  buttonsRow.appendChild(saveButton);

  const cancelButton = document.createElement("button");
  cancelButton.type = "button";
  cancelButton.textContent = "キャンセル";
  cancelButton.addEventListener("click", function () {
    editingImpressionKey = null;
    renderReviewSummary();
  });
  buttonsRow.appendChild(cancelButton);

  form.appendChild(buttonsRow);

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    const newText = textarea.value.trim();
    if (!newText) {
      return; // 空にはできない（消したい場合は「削除」を使う）
    }
    saveImpressionEdit(book.id, recordIndex, newText);
  });

  textarea.focus();

  return form;
}

// 「読書中の感想」の文章を更新する
function saveImpressionEdit(bookId, recordIndex, newText) {
  const books = loadBooks();
  const book = books.find(function (b) {
    return b.id === bookId;
  });
  if (!book) {
    return;
  }

  const record = book.records[recordIndex];
  if (!record) {
    return;
  }

  record.impression = newText;
  saveBooks(books);

  editingImpressionKey = null;
  renderReviewSummary();

  if (currentBookId === bookId) {
    renderBookStats();
  }
}

// 「読書中の感想」を削除する（読書記録そのものは残し、感想の文章だけを消す）
function deleteImpression(bookId, recordIndex) {
  const confirmed = confirm("この感想を削除しますか？");
  if (!confirmed) {
    return;
  }

  const books = loadBooks();
  const book = books.find(function (b) {
    return b.id === bookId;
  });
  if (!book) {
    return;
  }

  const record = book.records[recordIndex];
  if (!record) {
    return;
  }

  record.impression = "";
  saveBooks(books);

  renderReviewSummary();

  if (currentBookId === bookId) {
    renderBookStats();
  }
}
