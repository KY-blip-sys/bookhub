// ---------- 読書の進捗（総ページ数に対する現在のページ） ----------
// ページ数の計算（getRecordPagesSum/getPageAdjustment/getComputedCurrentPage）は
// js/models/booksModel.js にまとめてあり、ここでは画面表示だけを行う。

// 進捗表示に使う要素を取得しておく
const progressSection = document.getElementById("progress-section");
const progressPercentEl = document.getElementById("progress-percent");
const progressRemainingEl = document.getElementById("progress-remaining");
const progressRingFill = document.getElementById("progress-ring-fill");

// SVGのcircleの半径（index.htmlのr属性と合わせる）から、リング1周ぶんの長さを求めておく
const PROGRESS_RING_RADIUS = 42;
const PROGRESS_RING_CIRCUMFERENCE = 2 * Math.PI * PROGRESS_RING_RADIUS;
progressRingFill.style.strokeDasharray = PROGRESS_RING_CIRCUMFERENCE;

// 読み終えた瞬間だけ、進捗リングをふわっと弾ませて達成感を演出する（records.jsから呼ばれる）
function celebrateBookFinished() {
  const ring = progressSection.querySelector(".progress-ring");
  ring.classList.remove("progress-ring-celebrate");
  void ring.offsetWidth; // 同じアニメーションを続けて再生できるように、一度リフローを挟む
  ring.classList.add("progress-ring-celebrate");
}

// 現在のページの「表示」と「編集」の切り替えに使う要素を取得しておく
const currentPageDisplayRow = document.getElementById("current-page-display-row");
const currentPageDisplayEl = document.getElementById("current-page-display");
const progressPageCountDisplayEl = document.getElementById("progress-page-count-display");
const editCurrentPageButton = document.getElementById("edit-current-page-button");
const currentPageEditForm = document.getElementById("current-page-edit-form");
const currentPageInput = document.getElementById("current-page-input");
const totalPageCountInput = document.getElementById("total-page-count-input");
const cancelCurrentPageEditButton = document.getElementById("cancel-current-page-edit-button");
enableFlexibleDigitInput(currentPageInput); // 全角数字で入力しても半角として扱う
enableFlexibleDigitInput(totalPageCountInput); // 全角数字で入力しても半角として扱う

// 総ページ数が未登録のときに表示する、手動入力欄の要素を取得しておく
const pageCountMissingSection = document.getElementById("page-count-missing-section");
const manualPageCountInput = document.getElementById("manual-page-count-input");
const savePageCountButton = document.getElementById("save-page-count-button");
enableFlexibleDigitInput(manualPageCountInput); // 全角数字で入力しても半角として扱う

// 今開いている本の読書進捗を、画面に反映する
function renderReadingProgress() {
  const books = loadBooks();
  const book = books.find(function (b) {
    return b.id === currentBookId;
  });
  if (!book) {
    // 表示する本が無いときは、「0 / 0ページ」のような値が本があるかのように残らないよう、進捗表示ごと隠しておく
    progressSection.hidden = true;
    pageCountMissingSection.hidden = true;
    return;
  }

  if (!book.pageCount) {
    // 総ページ数が分からない本は、進捗を計算できないので手動入力欄だけ見せる
    progressSection.hidden = true;
    pageCountMissingSection.hidden = false;
    return;
  }

  pageCountMissingSection.hidden = true;
  progressSection.hidden = false;

  // 現在のページは、読書記録のページ数を合計して基本的に自動計算する
  const currentPage = getComputedCurrentPage(book);
  currentPageInput.max = book.pageCount;
  currentPageInput.value = currentPage;
  totalPageCountInput.value = book.pageCount;

  currentPageDisplayEl.textContent = currentPage;
  progressPageCountDisplayEl.textContent = book.pageCount;
  hideCurrentPageEditForm(); // 開くたびに、まずは表示モードにしておく

  updateProgressDisplay(book);
}

// 現在のページを、表示モードにする（編集フォームを隠す）
function hideCurrentPageEditForm() {
  currentPageDisplayRow.hidden = false;
  currentPageEditForm.hidden = true;
}

// 現在のページを、編集モードにする（数値入力フォームを表示する）
function showCurrentPageEditForm() {
  currentPageDisplayRow.hidden = true;
  currentPageEditForm.hidden = false;
  currentPageInput.focus();
}

// 本の現在のページ数・総ページ数から、進捗率・残りページ・進捗リングの表示を更新する
function updateProgressDisplay(book) {
  const percent = getBookProgressPercent(book);
  const remaining = Math.max(0, book.pageCount - getComputedCurrentPage(book));

  progressPercentEl.textContent = percent;
  progressRemainingEl.textContent = remaining;
  // 読書完了までの割合を、リングの塗り具合で表す
  progressRingFill.style.strokeDashoffset = PROGRESS_RING_CIRCUMFERENCE * (1 - percent / 100);
}

// 「編集」ボタンが押されたら、編集モードに切り替える
editCurrentPageButton.addEventListener("click", showCurrentPageEditForm);

// 「キャンセル」ボタンが押されたら、入力を破棄して表示モードに戻す
cancelCurrentPageEditButton.addEventListener("click", function () {
  renderReadingProgress(); // 保存済みの値に戻しつつ、表示モードに戻す
});

// 編集フォームが保存されたら、補正値として保存して表示モードに戻す
currentPageEditForm.addEventListener("submit", function (event) {
  event.preventDefault();

  const books = loadBooks();
  const book = books.find(function (b) {
    return b.id === currentBookId;
  });
  if (!book || !book.pageCount) {
    return;
  }

  const wasFinishedBefore = getComputedCurrentPage(book) >= book.pageCount;

  // 総ページ数：正しい数値が入力されていれば更新し、そうでなければ今の値のままにする
  const newPageCount = Number(totalPageCountInput.value);
  if (newPageCount > 0) {
    book.pageCount = newPageCount;
  }

  // 入力値を 0〜総ページ数 の範囲に収める
  let currentPage = Number(currentPageInput.value) || 0;
  currentPage = Math.max(0, Math.min(currentPage, book.pageCount));

  // 記録の合計ページ数と、入力された値との差分を「補正値」として保存する。
  // こうしておくと、次に読書記録を追加したときも記録の合計を基準にしつつ、
  // 今回の手動修正分がずれずに引き継がれる。
  book.pageAdjustment = currentPage - getRecordPagesSum(book);
  saveBooks(books);

  renderReadingProgress(); // 最新の値を反映しつつ、表示モードに戻す

  // ページ数の手動修正で読了状態が変わることがあるため、記録保存時と同じくヘッダー表示も最新化する
  const statusInfo = getBookStatusInfo(book);
  detailStatusBadge.textContent = statusInfo.label;
  detailStatusBadge.className = "status-badge detail-status-badge status-" + statusInfo.key;
  updateShareSectionVisibility(book);

  // ページ数の手動修正で今回はじめて読了扱いになったときも、
  // 読書記録の保存時と同じお祝い演出・レビューへの導線を出す（records.jsと同じ処理を利用するだけ）
  const isFinishedNow = getComputedCurrentPage(book) >= book.pageCount;
  if (isFinishedNow && !wasFinishedBefore) {
    showToast("🎉 読了しました！お疲れさまでした");
    celebrateBookFinished();
    if (!getReviewForBook(book.id)) {
      setTimeout(function () {
        openReviewModal(book.id, { celebratory: true });
      }, 700);
    }
  }
});

// 総ページ数の手動登録（保存）ボタンの処理
savePageCountButton.addEventListener("click", function () {
  const pageCount = Number(manualPageCountInput.value);
  if (!pageCount || pageCount <= 0) {
    return; // 正しい数値が入力されていなければ何もしない
  }

  const books = loadBooks();
  const book = books.find(function (b) {
    return b.id === currentBookId;
  });
  if (!book) {
    return;
  }

  book.pageCount = pageCount;
  saveBooks(books);

  manualPageCountInput.value = "";
  renderReadingProgress(); // 総ページ数が登録されたので、通常の進捗表示に切り替える

  // 総ページ数の登録によって読了状態が変わることがあるため、ヘッダー表示も最新化する
  const statusInfo = getBookStatusInfo(book);
  detailStatusBadge.textContent = statusInfo.label;
  detailStatusBadge.className = "status-badge detail-status-badge status-" + statusInfo.key;
  updateShareSectionVisibility(book);
});
