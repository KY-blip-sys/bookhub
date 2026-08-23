// フォームと一覧の要素を取得しておく
const bookForm = document.getElementById("book-form");
const bookFormPanel = document.getElementById("book-form-panel");
const bookTitleInput = document.getElementById("book-title");
const bookAuthorInput = document.getElementById("book-author");
const bookWantToReadInput = document.getElementById("book-want-to-read");
const bookCoverInput = document.getElementById("book-cover-input");
const coverUploadPlaceholder = document.getElementById("cover-upload-placeholder");
const coverUploadPreview = document.getElementById("cover-upload-preview");
const bookList = document.getElementById("book-list");
const booksCountSubtitle = document.getElementById("books-count-subtitle");
const pageCountInput = document.getElementById("book-page-count");

// タイトル・著者・総ページ数を書いている途中でEnterキー（変換確定を含む）を押しても、
// 他の欄を書き終える前にフォームが送信されないようにする
preventEnterSubmit(bookTitleInput);
preventEnterSubmit(bookAuthorInput);
preventEnterSubmit(pageCountInput);
enableFlexibleDigitInput(pageCountInput); // 全角数字で入力しても半角として扱う

// 今フォームで選択されている表紙画像（base64のURL文字列。未選択ならnull）
let selectedCoverDataUrl = null;

// ---------- 読書ステータスの切り替え（「今から読む」／「あとで読む」） ----------
// 見た目はピル型のボタン2つだが、実体は隠したチェックボックス（book-want-to-read）のままにして、
// 保存まわりの既存ロジック（bookWantToReadInput.checked を見る部分）に手を入れずに済むようにしている。
const readingStatusToggle = document.getElementById("reading-status-toggle");
const readingStatusOptions = readingStatusToggle.querySelectorAll(".reading-status-option");

readingStatusOptions.forEach(function (button) {
  button.addEventListener("click", function () {
    readingStatusOptions.forEach(function (b) {
      b.classList.remove("active");
    });
    button.classList.add("active");
    bookWantToReadInput.checked = button.dataset.wantToRead === "true";
  });
});

// 見た目・実体（チェックボックス）を両方とも「今から読む」に戻す
function resetReadingStatusToggle() {
  readingStatusOptions.forEach(function (button) {
    button.classList.toggle("active", button.dataset.wantToRead === "false");
  });
  bookWantToReadInput.checked = false;
}

// ダッシュボードの表示に使う要素を取得しておく
const dashboardGrid = document.getElementById("dashboard");
const dashboardTotalMinutes = document.getElementById("dashboard-total-minutes");
const dashboardBookCount = document.getElementById("dashboard-book-count");
const dashboardSessionCount = document.getElementById("dashboard-session-count");
const dashboardLearningIcon = document.getElementById("dashboard-learning-icon");
const dashboardLearningCount = document.getElementById("dashboard-learning-count");
const dashboardLearningLabel = document.getElementById("dashboard-learning-label");
const dashboardInProgressCount = document.getElementById("dashboard-in-progress-count");
const dashboardDoneCount = document.getElementById("dashboard-done-count");
const dashboardSubtitle = document.getElementById("dashboard-subtitle");

// 初めて開いたときの案内（本が1冊も無いときだけ表示する）に使う要素
const firstBookNudge = document.getElementById("first-book-nudge");
const firstBookNudgeButton = document.getElementById("first-book-nudge-button");
const currentlyReadingSection = document.getElementById("currently-reading-section");

// 案内の「＋ 1冊目を登録する」ボタンは、本一覧画面の「新しい本を追加」モーダル（表紙・ページ数まで入力できる方）を開く。
// ダッシュボードの簡易フォーム（タイトル・著者のみ）だと総ページ数を入力できず、
// 最初の1冊で読書の進捗（進捗リングなど）が使えなくなってしまうため、最初の登録はこちらに統一する。
firstBookNudgeButton.addEventListener("click", function () {
  goToNavPage("books");
  openBookFormPanel();
});

// カテゴリごとのダッシュボード副題
const DASHBOARD_SUBTITLES = {
  practical: "今日も一冊未来のために",
  novel: "今日も一冊心を動かす旅へ"
};

// 本の表紙（画像があればそれを、なければタイトルの頭文字を表示する）を組み立てる。
// 本棚のカード・「今読んでいる本」のカードなど、表紙を使う場所ならどこでも使う。
// initialClassName: 画像が無いときに表示する頭文字に付けるクラス名（サイズなどは呼び出し側のCSSで決める）
function buildBookCoverContent(book, initialClassName) {
  if (book.coverImage) {
    const coverImg = document.createElement("img");
    coverImg.src = book.coverImage;
    coverImg.alt = book.title;
    return coverImg;
  }

  const initial = document.createElement("span");
  initial.className = initialClassName;
  initial.textContent = book.title.charAt(0);
  return initial;
}

// 本の一覧（本棚）を画面に表示する（アクティブなカテゴリの本だけを対象にする）
function renderBookList() {
  // 読了した本は後ろへ送る（Array.sortは安定ソートなので、読了同士・未読了同士の順番はそのまま保たれる）
  const books = getBooksByCategory(loadActiveCategory()).slice().sort(function (a, b) {
    const aDone = getBookStatusInfo(a).key === "done" ? 1 : 0;
    const bDone = getBookStatusInfo(b).key === "done" ? 1 : 0;
    return aDone - bDone;
  });
  const actions = loadActions(); // 「実践中」の表示に使う（実用書のみ紐づくが、本の種類は問わず調べてよい）

  booksCountSubtitle.hidden = books.length === 0;
  booksCountSubtitle.textContent = books.length + "冊の本棚";

  // 一覧を一度空にしてから、最新の内容で作り直す
  bookList.innerHTML = "";
  void bookList.offsetHeight; // 直後にカードを追加してもフェードインが確実に再生されるよう、一度リフローを挟む

  // 「＋ 新しい本を追加」カードは常に先頭に表示する
  bookList.appendChild(buildAddBookTriggerCard());

  // 直前に追加した本のカード（見つかれば、あとでふわっと目立たせてスクロールする）
  let celebratedCardEl = null;

  books.forEach(function (book) {
    const statusInfo = getBookStatusInfo(book);
    const hasInProgressAction = actions.some(function (action) {
      return action.bookId === book.id && action.status === "in-progress";
    });

    const li = document.createElement("li");
    li.className = "book-card";
    li.addEventListener("click", function () {
      showDetailScreen(book.id);
    });

    if (book.id === bookIdToCelebrate) {
      li.classList.add("book-card-just-added");
      celebratedCardEl = li;
    }

    // 表紙（画像があればそれを、なければタイトルの頭文字を表示する）
    const cover = document.createElement("div");
    cover.className = "book-cover";
    cover.appendChild(buildBookCoverContent(book, "book-cover-initial"));

    // 表紙の右上に、読書ステータス（読みたい・読書中・読了）のバッジを重ねる
    const statusBadge = document.createElement("span");
    statusBadge.className = "book-status-badge book-status-" + statusInfo.key;
    statusBadge.textContent = statusInfo.label;
    cover.appendChild(statusBadge);

    // 総ページ数がわかっていて、読書中の本だけ、表紙の左下に進捗リングを重ねる
    if (book.pageCount && statusInfo.key === "reading") {
      const percent = getBookProgressPercent(book);
      cover.appendChild(buildMiniProgressRing(percent, "book-cover-progress-ring"));
    }

    li.appendChild(cover);

    // タイトルと、その横の三点メニュー（編集・削除）をまとめた行
    const titleRow = document.createElement("div");
    titleRow.className = "book-card-title-row";

    const titleEl = document.createElement("p");
    titleEl.className = "book-card-title";
    titleEl.textContent = book.title;
    titleRow.appendChild(titleEl);

    titleRow.appendChild(buildBookCardMenu(book));

    li.appendChild(titleRow);

    if (book.author) {
      const authorEl = document.createElement("p");
      authorEl.className = "book-card-author";
      authorEl.textContent = book.author;
      li.appendChild(authorEl);
    }

    // 実践中のものがあるときだけ、控えめなチップで知らせる（無ければ何も表示せず余白のままにする）
    if (hasInProgressAction) {
      const actionChip = document.createElement("span");
      actionChip.className = "book-card-action-chip";
      actionChip.textContent = "🎯 実践中";
      li.appendChild(actionChip);
    }

    bookList.appendChild(li);
  });

  renderDashboard(books);
  renderCurrentlyReading(books);
  renderMotivationCarousel(books); // motivationCard.js

  if (celebratedCardEl) {
    bookIdToCelebrate = null; // 一度使ったら消し、次の再描画では繰り返さないようにする
    if (currentNavKey === "books") {
      celebratedCardEl.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    setTimeout(function () {
      celebratedCardEl.classList.remove("book-card-just-added");
    }, 1600);
  }
}

// ---------- ダッシュボード：今読んでいる本 ----------

const currentlyReadingList = document.getElementById("currently-reading-list");
const currentlyReadingEmpty = document.getElementById("currently-reading-empty");

// 「読書中」の本を、直近に読んだ順に並べて表示する。
// 実際に何冊分のカードを見せるか（PC:8冊・タブレット:7冊・スマホ：横スクロールで最大10冊）はstyle.css側の
// 横スクロールリスト・nth-childの絞り込みで決めるため、ここでは幅を問わず必要な最大数（10冊）を描画しておく。
// まだ記録が無い本（追加しただけ、まだ開いていない本）も、追加した順の目安として
// idを使って並べ、一覧に表示する（本一覧で「読書中」にしたのにダッシュボードに出ない、を防ぐ）
const CURRENTLY_READING_MAX_CARDS = 10;

function getLatestActivityTimestamp(book) {
  if (book.records.length > 0) {
    return book.records[book.records.length - 1].timestamp || 0;
  }
  return book.id || 0; // idは追加時刻（Date.now()）なので、記録が無い本の並び順の目安にする
}

function renderCurrentlyReading(books) {
  const readingBooks = books.filter(function (book) {
    return getBookStatusInfo(book).key === "reading";
  });

  readingBooks.sort(function (a, b) {
    return getLatestActivityTimestamp(b) - getLatestActivityTimestamp(a);
  });

  currentlyReadingList.innerHTML = "";
  currentlyReadingEmpty.hidden = readingBooks.length > 0;

  readingBooks.slice(0, CURRENTLY_READING_MAX_CARDS).forEach(function (book) {
    currentlyReadingList.appendChild(buildCurrentlyReadingCard(book));
  });
}

// 「今読んでいる本」1冊ぶんのカード（表紙・タイトル・進捗）を組み立てる
function buildCurrentlyReadingCard(book) {
  const li = document.createElement("li");
  li.className = "currently-reading-card";
  li.addEventListener("click", function () {
    showDetailScreen(book.id);
  });

  const cover = document.createElement("div");
  cover.className = "currently-reading-cover";
  cover.appendChild(buildBookCoverContent(book, "currently-reading-cover-initial"));
  li.appendChild(cover);

  // タイトルの横に、進捗リング（総ページ数がわかっている本だけ）を並べる
  const titleRow = document.createElement("div");
  titleRow.className = "currently-reading-title-row";

  const titleEl = document.createElement("p");
  titleEl.className = "currently-reading-title";
  titleEl.textContent = book.title;
  titleRow.appendChild(titleEl);

  if (book.pageCount) {
    const percent = getBookProgressPercent(book);
    titleRow.appendChild(buildMiniProgressRing(percent, "currently-reading-progress-ring"));
  }

  li.appendChild(titleRow);

  if (book.author) {
    const authorEl = document.createElement("p");
    authorEl.className = "currently-reading-author";
    authorEl.textContent = book.author;
    li.appendChild(authorEl);
  }

  // 「読書時間」「記録」を2列の小さな数値で並べて、一目で分かるようにする
  const statsRow = document.createElement("div");
  statsRow.className = "currently-reading-stats";
  statsRow.appendChild(buildCurrentlyReadingStat("読書時間", getTotalMinutes([book]) + "分"));
  statsRow.appendChild(buildCurrentlyReadingStat("記録", book.records.length + "回"));
  li.appendChild(statsRow);

  return li;
}

// 「今読んでいる本」カードの小さな数値1つ分（ラベル＋値）を組み立てる
function buildCurrentlyReadingStat(label, value) {
  const wrapper = document.createElement("div");
  wrapper.className = "currently-reading-stat";

  const labelEl = document.createElement("span");
  labelEl.className = "currently-reading-stat-label";
  labelEl.textContent = label;
  wrapper.appendChild(labelEl);

  const valueEl = document.createElement("span");
  valueEl.className = "currently-reading-stat-value";
  valueEl.textContent = value;
  wrapper.appendChild(valueEl);

  return wrapper;
}

// ---------- 本一覧の「＋ 新しい本を追加」カード ----------

// 本棚の最後に置く、追加フォームを開くためのカード
function buildAddBookTriggerCard() {
  const li = document.createElement("li");
  li.className = "book-card add-book-trigger-card";
  li.addEventListener("click", openBookFormPanel);

  const cover = document.createElement("div");
  cover.className = "book-cover add-book-trigger-cover";
  cover.textContent = "+";
  li.appendChild(cover);

  const titleEl = document.createElement("p");
  titleEl.className = "book-card-title";
  titleEl.textContent = "新しい本を追加";
  li.appendChild(titleEl);

  const hintEl = document.createElement("p");
  hintEl.className = "book-card-author";
  hintEl.textContent = "読書を記録して学びを深めましょう";
  li.appendChild(hintEl);

  return li;
}

// 追加フォームのモーダルを、ふわっと浮かび上がる形で表示する
const bookFormCloseButton = document.getElementById("book-form-close-button");

function openBookFormPanel() {
  bookFormPanel.hidden = false;
  bookTitleInput.focus();
}

function closeBookFormPanel() {
  bookFormPanel.hidden = true;
}

bookFormCloseButton.addEventListener("click", closeBookFormPanel);
bindModalDismissal(bookFormPanel, closeBookFormPanel);

// ---------- 本一覧の三点メニュー（編集・削除） ----------

// 今、開いている三点メニューの要素（開いていなければnull）
let openBookCardMenu = null;

// メニューが開いていたら閉じる
function closeBookCardMenu() {
  if (openBookCardMenu) {
    openBookCardMenu.hidden = true;
    openBookCardMenu = null;
  }
}

// メニューの外側をクリックしたときに、開いているメニューを閉じる
document.addEventListener("click", closeBookCardMenu);

// 本1冊ぶんの「タイトルの横の三点メニュー」（編集・削除）を組み立てる
function buildBookCardMenu(book) {
  const menuWrapper = document.createElement("div");
  menuWrapper.className = "book-card-menu";

  const menuButton = document.createElement("button");
  menuButton.type = "button";
  menuButton.className = "book-card-menu-button";
  menuButton.textContent = "⋮";
  menuButton.setAttribute("aria-label", "メニューを開く");

  const dropdown = document.createElement("ul");
  dropdown.className = "book-card-menu-dropdown";
  dropdown.hidden = true;

  // メニューボタン・ドロップダウンのクリックが、カード全体のクリック（詳細画面への遷移）に伝わらないようにする
  menuWrapper.addEventListener("click", function (event) {
    event.stopPropagation();
  });

  menuButton.addEventListener("click", function () {
    const willOpen = dropdown.hidden;
    closeBookCardMenu();
    if (willOpen) {
      dropdown.hidden = false;
      openBookCardMenu = dropdown;
    }
  });

  const editItem = document.createElement("li");
  const editButton = document.createElement("button");
  editButton.type = "button";
  editButton.textContent = "編集";
  editButton.addEventListener("click", function () {
    closeBookCardMenu();
    openBookEditModal(book.id);
  });
  editItem.appendChild(editButton);
  dropdown.appendChild(editItem);

  const deleteItem = document.createElement("li");
  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.className = "danger-button";
  deleteButton.textContent = "削除";
  deleteButton.addEventListener("click", function () {
    closeBookCardMenu();
    const deleted = deleteBookById(book.id);
    if (deleted) {
      renderBookList();
    }
  });
  deleteItem.appendChild(deleteButton);
  dropdown.appendChild(deleteItem);

  menuWrapper.appendChild(menuButton);
  menuWrapper.appendChild(dropdown);

  return menuWrapper;
}

// 指定した本を、確認のうえ削除する（本一覧・詳細画面どちらからも呼び出せる共通処理）
function deleteBookById(bookId) {
  const confirmed = confirm("この本を削除しますか？読書記録もすべて削除されます。");
  if (!confirmed) {
    return false;
  }

  const books = loadBooks();
  const remainingBooks = books.filter(function (b) {
    return b.id !== bookId;
  });
  saveBooks(remainingBooks);

  return true;
}

// ---------- 本の編集モーダル ----------

const bookEditModal = document.getElementById("book-edit-modal");
const bookEditForm = document.getElementById("book-edit-form");
const bookEditTitleInput = document.getElementById("book-edit-title");
const bookEditAuthorInput = document.getElementById("book-edit-author");
const bookEditPageCountInput = document.getElementById("book-edit-page-count");
const bookEditCancelButton = document.getElementById("book-edit-cancel-button");
enableFlexibleDigitInput(bookEditPageCountInput); // 全角数字で入力しても半角として扱う

// 今、編集モーダルで開いている本のid（開いていなければnull）
let editingBookId = null;

// 指定した本の編集モーダルを開く
function openBookEditModal(bookId) {
  const books = loadBooks();
  const book = books.find(function (b) {
    return b.id === bookId;
  });
  if (!book) {
    return;
  }

  editingBookId = bookId;
  bookEditTitleInput.value = book.title;
  bookEditAuthorInput.value = book.author || "";
  bookEditPageCountInput.value = book.pageCount || "";

  bookEditModal.hidden = false;
  bookEditTitleInput.focus();
}

// 編集モーダルを閉じる
function closeBookEditModal() {
  bookEditModal.hidden = true;
  editingBookId = null;
  bookEditForm.reset();
}

bookEditCancelButton.addEventListener("click", closeBookEditModal);
bindModalDismissal(bookEditModal, closeBookEditModal);

// 編集フォームが送信されたら、本の情報を更新する
bookEditForm.addEventListener("submit", function (event) {
  event.preventDefault();

  const title = bookEditTitleInput.value.trim();
  if (!title || editingBookId === null) {
    return; // タイトルが空なら何もしない
  }

  const books = loadBooks();
  const book = books.find(function (b) {
    return b.id === editingBookId;
  });
  if (!book) {
    return;
  }

  book.title = title;
  book.author = bookEditAuthorInput.value.trim();
  book.pageCount = Number(bookEditPageCountInput.value) || null;
  saveBooks(books);

  closeBookEditModal();
  renderBookList(); // 一覧を最新の状態に更新

  // 今、この本の詳細画面を開いている場合は、そちらの表示も最新にする
  if (currentBookId === book.id) {
    showDetailScreen(book.id);
  }
});

// アプリ全体の活動（読書時間・読んだ本・学んだこと・実践中・完了した実践）を表示する。
// 同じ集計は「記録」ページ（allRecords.js）にもあるが、ダッシュボードでもすぐ確認できるようにしている。
// 「これまでに◯読みました」的な実績表示は、ダッシュボード上部のモチベーションカード（motivationCard.js）に置き換えた。
// booksはすでにアクティブなカテゴリで絞り込まれたものが渡される
function renderDashboard(books) {
  const actions = getActionsByActiveCategory();
  const activeCategory = loadActiveCategory();
  const isNovel = activeCategory === "novel";

  // このカテゴリに本が1冊も無ければ、初めての案内を表示し、「今読んでいる本」欄は隠しておく。
  // 小説は実用書と表示を合わせるため、1冊も無くても「1冊目を登録する」の案内は出さず、
  // 実用書と同じ「まだ読書中の本がありません」の空メッセージ（currently-reading-empty）を出す
  const hasNoBooks = books.length === 0;
  firstBookNudge.hidden = isNovel || !hasNoBooks;
  currentlyReadingSection.hidden = !isNovel && hasNoBooks;

  // 小説のときは「実践」中・完了の2枠を隠し、タイルが4枚（2列）になる
  dashboardGrid.classList.toggle("dashboard-novel-mode", isNovel);

  // カテゴリに合わせて、ダッシュボードの副題も差し替える
  dashboardSubtitle.textContent = DASHBOARD_SUBTITLES[activeCategory] || DASHBOARD_SUBTITLES.practical;

  // ダッシュボードは「今週の記録」だけを集計する（「記録」ページの、これまでの累計と区別するため）
  let totalMinutes = 0;
  let sessionCount = 0;
  let learningCount = 0;
  books.forEach(function (book) {
    book.records.forEach(function (record) {
      if (!isInCurrentWeek(record.timestamp)) {
        return;
      }
      totalMinutes += record.minutes;
      sessionCount += 1; // 記録回数（今週分のみ）
      if (record.learning || record.impression) {
        learningCount += 1; // 学んだこと・感想が書かれている記録の数を数える
      }
    });
  });

  // 実用書は「学んだこと」が書かれた記録の数、小説は「好きな言葉」の数を表示する（記録画面と同じタイル構成）
  dashboardLearningIcon.textContent = isNovel ? "💬" : "💡";
  dashboardLearningLabel.textContent = isNovel ? "好きな言葉" : "学んだこと";
  const learningTileCount = isNovel
    ? getCombinedQuotes("novel").filter(function (quote) {
      return isInCurrentWeek(quote.timestamp);
    }).length
    : learningCount;

  // 「実践中」「完了した実践」は完了日を記録していないため今週分だけに絞れず、これまでの累計を表示する
  const inProgressCount = actions.filter(function (action) {
    return action.status === "in-progress";
  }).length;

  const doneCount = actions.filter(function (action) {
    return action.status === "done";
  }).length;

  // 「読んだ本」は登録した本の数ではなく、読了した本の数を数える（読了日を記録していないため、これも累計のまま）
  const finishedBookCount = books.filter(function (book) {
    return getBookStatusInfo(book).key === "done";
  }).length;

  dashboardTotalMinutes.textContent = totalMinutes;
  dashboardBookCount.textContent = finishedBookCount;
  dashboardSessionCount.textContent = sessionCount;
  dashboardLearningCount.textContent = learningTileCount;
  dashboardInProgressCount.textContent = inProgressCount;
  dashboardDoneCount.textContent = doneCount;

  replayDashboardTileEntrance(dashboardGrid); // タイルのフェードインを毎回確実に再生させる（app.js）
}

// ---------- 表紙画像の選択 ----------

// 画像ファイルを、指定した最大幅に縮小してbase64のURL文字列に変換する
// （LocalStorageの容量には限りがあるため、選んだ画像をそのまま保存しない）
function resizeImageFile(file, maxWidth, callback) {
  const reader = new FileReader();

  reader.onload = function (loadEvent) {
    const image = new Image();

    image.onload = function () {
      const scale = Math.min(1, maxWidth / image.width);
      const canvas = document.createElement("canvas");
      canvas.width = image.width * scale;
      canvas.height = image.height * scale;

      const context = canvas.getContext("2d");
      context.drawImage(image, 0, 0, canvas.width, canvas.height);

      callback(canvas.toDataURL("image/jpeg", 0.85));
    };

    image.src = loadEvent.target.result;
  };

  reader.readAsDataURL(file);
}

// 選択中の表紙をクリアし、フォームの見た目も元に戻す
function clearSelectedCover() {
  selectedCoverDataUrl = null;
  coverUploadPreview.src = "";
  coverUploadPreview.hidden = true;
  coverUploadPlaceholder.hidden = false;
}

// ファイルが選択されたら、縮小してプレビュー表示する
bookCoverInput.addEventListener("change", function () {
  const file = bookCoverInput.files[0];
  if (!file) {
    clearSelectedCover();
    return;
  }

  resizeImageFile(file, 300, function (dataUrl) {
    // ここで作った文字列（画像のURL）を、そのままcoverImageとして保存する。
    // 将来Google Books APIなどから表紙のURLを取得できるようになったときも、
    // 同じselectedCoverDataUrlにそのURLを入れるだけで、保存・表示の処理は変えずに済む。
    selectedCoverDataUrl = dataUrl;
    coverUploadPreview.src = dataUrl;
    coverUploadPreview.hidden = false;
    coverUploadPlaceholder.hidden = true;
  });
});

// タイトル・著者名から本のデータを組み立てる（他の項目は指定があれば上書きする）
function buildNewBook(title, author, extra) {
  return Object.assign(
    {
      id: Date.now(), // 今の時刻を使った、本ごとの一意なID
      category: loadActiveCategory(), // 今開いているカテゴリ（実用書/小説）をそのまま付ける
      title: title,
      author: author,
      coverImage: null,
      pageCount: null,
      pageAdjustment: 0, // 記録の合計ページ数に対する手動補正（現在のページ = 記録の合計 + この値）
      records: [] // この本の読書記録を後で入れるための空の配列
    },
    extra
  );
}

// 追加した本の本棚カードを、次の描画のときだけふわっと目立たせる（達成感の演出）ために覚えておくid
let bookIdToCelebrate = null;

// 本を保存し、一覧を更新する（本一覧・ダッシュボードどちらの追加フォームからも呼び出す）
function addBook(newBook) {
  // このカテゴリで初めての1冊かどうかを、保存する前に確認しておく
  const wasFirstBookInCategory = getBooksByCategory(newBook.category).length === 0;

  const books = loadBooks();
  books.push(newBook);
  saveBooks(books);

  showToast("📚「" + newBook.title + "」を本棚に追加しました");

  // このカテゴリで初めての1冊（かつ「読みたい本」として追加したのではない）ときは、
  // 一覧から自分で探させず、そのまま読書を始められる詳細画面（タイマー）へ直接進む
  if (wasFirstBookInCategory && !newBook.wantToRead) {
    renderBookList();
    showDetailScreen(newBook.id);
    return;
  }

  // それ以外は本棚に留まり、追加した本のカードがひと目でわかるよう、ふわっと目立たせる
  bookIdToCelebrate = newBook.id;
  renderBookList();
}

// フォームが送信された（追加ボタンが押された）ときの処理
bookForm.addEventListener("submit", function (event) {
  event.preventDefault(); // ページが再読み込みされるのを防ぐ

  const title = bookTitleInput.value.trim();
  const author = bookAuthorInput.value.trim();

  if (!title) {
    return; // タイトルが空なら何もしない
  }

  addBook(
    buildNewBook(title, author, {
      coverImage: selectedCoverDataUrl, // 表紙画像のURL（未選択ならnull）
      pageCount: Number(pageCountInput.value) || null, // 総ページ数（任意）
      wantToRead: bookWantToReadInput.checked // 「まだ読んでいない」を選んでいれば、読みたい本として追加する
    })
  );
  resetBookForm(); // フォーム全体（表紙のプレビューなど）を空に戻す
});

// フォーム全体を初期状態に戻す（表紙のプレビューも含む）
function resetBookForm() {
  bookForm.reset();
  clearSelectedCover();
  resetReadingStatusToggle();
  closeBookFormPanel(); // 追加が終わったら、モーダルを閉じてカード表示に戻す
}
