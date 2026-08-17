// ---------- 保存完了トースト ----------
// 「保存しました」のような短い通知を、画面下にふわっと表示して自動で消す。
// 本の追加・記録の保存・好きな言葉の追加など、無音で終わっていた保存操作に一貫したフィードバックを出すために使う。

const toastEl = document.getElementById("toast");
let toastHideTimer = null;

function showToast(message) {
  clearTimeout(toastHideTimer);
  toastEl.textContent = message;
  toastEl.hidden = false;

  // hiddenを解除した直後にクラスを付けると、ブラウザがまとめて処理して
  // アニメーションが発火しないことがあるため、次のフレームまで少し待つ
  requestAnimationFrame(function () {
    toastEl.classList.add("toast-visible");
  });

  toastHideTimer = setTimeout(function () {
    toastEl.classList.remove("toast-visible");
    setTimeout(function () {
      toastEl.hidden = true;
    }, 200);
  }, 2200);
}

// 今どの本の詳細を見ているか（本のid）を覚えておく
let currentBookId = null;

// 画面切り替えに使う要素を取得しておく
const headerBackButton = document.getElementById("header-back-button");
const detailHeaderCover = document.getElementById("detail-header-cover");
const detailBookTitle = document.getElementById("detail-book-title");
const detailBookAuthor = document.getElementById("detail-book-author");
const detailBookPurpose = document.getElementById("detail-book-purpose");
const detailStatusBadge = document.getElementById("detail-status-badge");
const deleteBookButton = document.getElementById("delete-book-button");
const timerFirstTimeHint = document.getElementById("timer-first-time-hint");

// ---------- 本の詳細画面：タブ切り替え ----------
// 「記録・タイマー（能動的に読む・記録する）」と、振り返り系（読書履歴／学んだこと／好きな言葉／実践リスト）を分ける
const detailTabButtons = document.querySelectorAll(".pill-tab[data-detail-tab]");
const detailTabPanels = {
  record: document.getElementById("detail-record-panel"),
  history: document.getElementById("detail-history-panel"),
  learning: document.getElementById("detail-learning-panel"),
  quotes: document.getElementById("detail-quotes-panel"),
  actions: document.getElementById("detail-actions-panel")
};

// 指定したタブだけを表示する（中身はすでに描画済みなので、表示の切り替えだけでよい）
function showDetailTab(tabName) {
  detailTabButtons.forEach(function (button) {
    button.classList.toggle("active", button.dataset.detailTab === tabName);
  });
  Object.keys(detailTabPanels).forEach(function (key) {
    detailTabPanels[key].hidden = key !== tabName;
  });
}

detailTabButtons.forEach(function (button) {
  button.addEventListener("click", function () {
    showDetailTab(button.dataset.detailTab);
  });
});

// 指定した本の詳細画面を表示する
function showDetailScreen(bookId) {
  // 今開いている本自身の表示を更新するだけ（編集・AI提案の反映など）なら確認しない。
  // 別の本の詳細に切り替えようとしたときだけ、タイマー作動中の移動確認をする
  if (bookId === currentBookId) {
    showDetailScreenNow(bookId);
    return;
  }
  confirmLeaveWhileTimerRunning(function () {
    showDetailScreenNow(bookId);
  });
}

// showDetailScreenの本体（確認が終わった、または不要だったあとに実行する）
function showDetailScreenNow(bookId) {
  const books = loadBooks();
  const book = books.find(function (b) {
    return b.id === bookId;
  });
  if (!book) {
    return;
  }

  currentBookId = bookId;
  detailBookTitle.textContent = book.title;
  detailBookAuthor.textContent = book.author;

  // 表紙（books.jsのbuildBookCoverContentを再利用。画像が無ければタイトルの頭文字を表示する）
  detailHeaderCover.innerHTML = "";
  detailHeaderCover.appendChild(buildBookCoverContent(book, "detail-header-cover-initial"));

  // 読書ステータス（読みたい・読書中・読了）を、本棚カードと同じ色分けで常に表示しておく
  const statusInfo = getBookStatusInfo(book);
  detailStatusBadge.textContent = statusInfo.label;
  detailStatusBadge.className = "status-badge detail-status-badge status-" + statusInfo.key;

  // AIアシストで選んだ「読む目的」があれば表示する（無ければ何も表示しない）
  if (book.purpose) {
    detailBookPurpose.textContent = "🎯 読む目的：" + book.purpose;
    detailBookPurpose.hidden = false;
  } else {
    detailBookPurpose.hidden = true;
  }

  // 「実践リスト」タブは実用書のときだけ表示する（「好きな言葉／名言」タブはどちらのカテゴリでも常に表示し、
  // 中身の文言だけquotes.jsのrenderBookQuotesTabでカテゴリに応じて出し分ける）
  detailTabButtons.forEach(function (button) {
    if (button.classList.contains("detail-tab-practical")) {
      button.hidden = book.category !== "practical";
    }
  });
  showDetailTab("record"); // 本を開くたびに、いちばん使う「記録・タイマー」タブから始める

  setTimerDuration(25); // タイマーを毎回25分の初期状態にしておく
  timerFirstTimeHint.hidden = book.records.length > 0; // まだ一度も記録が無い本だけ、次にすることのヒントを出す
  hideRecordForm(); // 記録フォームを毎回隠した状態にしておく
  hideActionForm(); // 実践フォームも毎回隠した状態にしておく
  hidePostRecordCard(); // 別の本のAIアシストカードが残らないようにする
  // 読書履歴の横バーは、本を開くたびに必ず畳んだ状態から始める（前の本で開いていた状態を持ち越さない）
  historyToggleButton.setAttribute("aria-expanded", "false");
  historyList.hidden = true;
  renderBookStats(); // この本のこれまでの記録を表示する
  renderReadingProgress(); // 総ページ数に対する読書の進捗を表示する
  renderBookReview(bookId); // 読了レビューを表示する
  updateShareSectionVisibility(book); // 読み終えていれば「読了カードを見る」ボタンを出す
  renderBookQuotesTab(bookId); // この本の「好きな言葉」タブを最新の状態にする（quotes.js）
  renderBookActionsTab(bookId); // この本の「実践リスト」タブを最新の状態にする（actions.js）

  // 本の詳細は「本一覧」の中のサブ画面という位置づけなので、
  // 他のどのページから開いても、必ず正しく画面が切り替わる（showPage()でフェードインも揃える）
  showPage("screen-detail");
  // 詳細画面自体はサイドバーの項目を持たないため、showPage()の判定では
  // どの項目もactiveにならない。代わりに「本一覧」をactiveのままにしておく
  navItems.forEach(function (navItem) {
    navItem.classList.toggle("active", navItem.dataset.nav === "books");
  });

  // 本の詳細画面のときだけ、ヘッダーに「本一覧に戻る」ボタンを出し、タイトルも本のタイトルに差し替える
  headerBackButton.hidden = false;
  contentHeaderTitle.textContent = book.title;
}

// 本の一覧画面に戻る
function showBookListScreen() {
  pauseTimer(); // 一覧に戻るときは、動いているタイマーを止めておく
  currentBookId = null;
  goToNavPage("books"); // 本一覧ページに戻り、一覧も最新の状態にする
}

headerBackButton.addEventListener("click", function () {
  confirmLeaveWhileTimerRunning(function () {
    showBookListScreen();
  });
});

// 「この本を削除」ボタンの処理
deleteBookButton.addEventListener("click", function () {
  const deleted = deleteBookById(currentBookId); // books.jsの共通処理（確認・削除・保存）
  if (!deleted) {
    return;
  }

  renderBookList(); // books.jsの関数：一覧を最新の状態に更新
  showBookListScreen();
});

// ---------- サイドバーの開閉（スマホ・タブレット幅のドロワー） ----------
// PC幅では常時表示のサイドバーなのでこの開閉は使わないが、ボタン自体はCSSで隠れているだけで
// 常に存在するため、幅を問わずイベントは登録しておいて問題ない

const sidebarEl = document.querySelector(".sidebar");
const sidebarOpenButton = document.getElementById("sidebar-open-button");
const sidebarCloseButton = document.getElementById("sidebar-close-button");
const sidebarBackdrop = document.getElementById("sidebar-backdrop");

function openSidebarDrawer() {
  sidebarEl.classList.add("sidebar-open");
  sidebarBackdrop.hidden = false;
}

// ナビの項目を選んだときなど、明示的に閉じるボタンを押していなくても
// ドロワーごと閉じたい場面が多いため、単体の関数にしておく
function closeSidebarDrawer() {
  sidebarEl.classList.remove("sidebar-open");
  sidebarBackdrop.hidden = true;
}

sidebarOpenButton.addEventListener("click", openSidebarDrawer);
sidebarCloseButton.addEventListener("click", closeSidebarDrawer);
sidebarBackdrop.addEventListener("click", closeSidebarDrawer);

// ---------- サイドバーのナビゲーション ----------

const navItems = document.querySelectorAll(".nav-item");
const pages = document.querySelectorAll(".page");

// 指定したidのページだけを表示し、それ以外は隠す
function showPage(pageId) {
  let shownPage = null;
  pages.forEach(function (page) {
    page.hidden = page.id !== pageId;
    if (!page.hidden) {
      shownPage = page;
    }
  });

  // ページのフェードインは、display:none→blockへの変化だけに頼ると再生されないことがあった。
  // クラスの付け外し＋リフローの強制（void要素.offsetHeight）でも、短時間に連続で
  // 呼び出された場合はブラウザ側で「一度外れた」ことが認識されず、再生されないことがあったため、
  // 次の描画フレームを待ってから付け直す方式にする。連続で呼ばれたときは前回分の予約を取り消し、
  // 常に最後の呼び出しだけが「外れた状態」を経由してから確実に再生されるようにしている
  if (shownPage) {
    cancelAnimationFrame(shownPage._pageEnterRafId);
    shownPage.classList.remove("page-enter");
    shownPage._pageEnterRafId = requestAnimationFrame(function () {
      shownPage.classList.add("page-enter");
    });
  }

  navItems.forEach(function (navItem) {
    navItem.classList.toggle("active", "screen-" + navItem.dataset.nav === pageId);
  });
}

// .dashboard-tile（#dashboardや.records-summaryのタイル）は本一覧のカードと違い、
// 画面を描画し直すたびに作り直されず中身のテキストだけ更新される静的な要素のため、
// フェードインがdisplay:none→blockへの復帰だけに頼ることになり、連続で画面を切り替えると
// 再生されないことがあった。一時的にアニメーションを止めるクラスを付け、リフローを強制してから
// 同じ処理内で外すことで、次の描画フレームを待たずに確実に最初から再生されるようにする
// （display:none/blockの復帰待ちに頼るshowPage()の.page-enterとは違い、こちらは単に
// animation:noneを一瞬当てて外すだけなので、同期的なリフローの強制でも確実に効く）
function replayDashboardTileEntrance(container) {
  if (!container) {
    return;
  }
  const tiles = container.querySelectorAll(".dashboard-tile");
  tiles.forEach(function (tile) {
    tile.classList.add("card-entrance-reset");
  });
  void container.offsetHeight;
  tiles.forEach(function (tile) {
    tile.classList.remove("card-entrance-reset");
  });
}

// サイドバーの項目名（nav属性の値）と、ヘッダーに表示する日本語ラベルの対応表
const NAV_LABELS = {
  dashboard: "ダッシュボード",
  books: "本一覧",
  actions: "実践リスト",
  practicalQuotes: "名言集",
  reviewSummary: "感想",
  novelQuotes: "好きな言葉",
  records: "記録",
  stats: "統計",
  aiCoach: "AI読書コーチ",
  settings: "設定"
};

const contentHeaderTitle = document.getElementById("content-header-title");

// 今開いているページ（サイドバーのnav属性の値）を覚えておく。
// カテゴリを切り替えたときに、同じページを開き直すために使う。
let currentNavKey = "dashboard";

// サイドバーの項目名（nav属性の値）を指定して、そのページに移動する
function goToNavPage(navKey) {
  currentNavKey = navKey;

  showPage("screen-" + navKey);
  contentHeaderTitle.textContent = NAV_LABELS[navKey] || "";
  headerBackButton.hidden = true; // 本の詳細から出たら、戻るボタンは隠す
  renderSidebarQuote(); // ページが変わるたびに「今日の一言」も選び直す
  renderReadingRing(); // 今日の読書時間リングも最新の状態にしておく

  // ページを開くたびに、その中身を最新の状態にしておく
  if (navKey === "dashboard" || navKey === "books") {
    renderBookList();
  }
  if (navKey === "dashboard") {
    showGoalEncouragementCard(); // AIアシスト：今月の読書目標に対する応援メッセージ（未設定なら何も起きない）
  }
  if (navKey === "actions") {
    showActionsTab("inProgress"); // サイドバーから開いたときは、常に「実践中」タブから始める
  }
  if (navKey === "practicalQuotes") {
    renderPracticalQuoteList(); // quotes.js
  }
  if (navKey === "reviewSummary") {
    renderReviewSummary(); // reviewSummary.js
  }
  if (navKey === "novelQuotes") {
    renderQuoteList(); // quotes.js
  }
  if (navKey === "records") {
    renderAllRecordsScreen();
  }
  if (navKey === "stats") {
    renderStatsScreen();
  }
  if (navKey === "aiCoach") {
    showAiTab("coach"); // サイドバーから開いたときは、常に「コーチに相談」タブから始める
  }
}

navItems.forEach(function (navItem) {
  navItem.addEventListener("click", function () {
    confirmLeaveWhileTimerRunning(function () {
      // サイドバーから直接「AI読書コーチ」を開いたときは、前に見ていた本の文脈を持ち越さず汎用モードに戻す
      // （本の詳細画面の専用ボタンから開いたときは、この前にbookContextがセットされた状態でgoToNavPageが呼ばれる）
      if (navItem.dataset.nav === "aiCoach") {
        ReadingCoachViewModel.clearBookContext();
      }
      goToNavPage(navItem.dataset.nav);
      closeSidebarDrawer(); // スマホ・タブレット幅でドロワーから選んだときは、選んだら自動で閉じる
    });
  });
});

// 「data-nav-target」属性を持つボタン（ヒーローバナーのボタンなど）も、同じ仕組みでページ移動できるようにする
document.querySelectorAll("[data-nav-target]").forEach(function (button) {
  button.addEventListener("click", function () {
    confirmLeaveWhileTimerRunning(function () {
      goToNavPage(button.dataset.navTarget);
      closeSidebarDrawer();
    });
  });
});

// 今日の日付を「8月15日（土）」のような形式で表示する
const todayDateEl = document.getElementById("today-date");
const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];
const today = new Date();
todayDateEl.textContent =
  (today.getMonth() + 1) + "月" + today.getDate() + "日（" + WEEKDAY_LABELS[today.getDay()] + "）";

// ---------- 日付入力の「今日」ボタン ----------
// action-start-date等、隣に .date-today-button を置いた日付欄はワンタップで今日の日付を入れられる
document.querySelectorAll(".date-today-button").forEach(function (button) {
  button.addEventListener("click", function () {
    const targetInput = document.getElementById(button.dataset.todayTarget);
    if (!targetInput) {
      return;
    }
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");
    targetInput.value = yyyy + "-" + mm + "-" + dd; // input[type=date]が期待する形式
  });
});

// ---------- ダークモード ----------

const darkModeToggle = document.getElementById("dark-mode-toggle");

// 前回選んだ設定を復元する
if (loadDarkModePreference()) {
  document.documentElement.classList.add("dark-mode");
  darkModeToggle.checked = true;
}

// スイッチが切り替えられたら、見た目と設定の両方を更新する
darkModeToggle.addEventListener("change", function () {
  document.documentElement.classList.toggle("dark-mode", darkModeToggle.checked);
  saveDarkModePreference(darkModeToggle.checked);
});

// ---------- サイドバー：今日の読書時間リング ----------

const readingRingProgress = document.getElementById("reading-ring-progress");
const readingRingValue = document.getElementById("reading-ring-value");
const readingRingGoal = document.getElementById("reading-ring-goal");

// SVGのcircleの半径（index.htmlのr属性と合わせる）から、リング1周ぶんの長さを求めておく
const READING_RING_RADIUS = 42;
const READING_RING_CIRCUMFERENCE = 2 * Math.PI * READING_RING_RADIUS;
readingRingProgress.style.strokeDasharray = READING_RING_CIRCUMFERENCE;

// 今日の読書時間と、設定されている1日の目標時間から、リングを描き直す
function renderReadingRing() {
  const todayMinutes = getTodayTotalMinutes();
  const goalMinutes = loadDailyReadingGoalMinutes();
  const progress = goalMinutes > 0 ? Math.min(todayMinutes / goalMinutes, 1) : 0;

  readingRingProgress.style.strokeDashoffset = READING_RING_CIRCUMFERENCE * (1 - progress);
  readingRingValue.textContent = todayMinutes + "分";
  readingRingGoal.textContent = "目標 " + goalMinutes + "分";
}

renderReadingRing(); // 起動時にも一度描画しておく

// アプリの起動時にどの画面を開くか（カテゴリ選択画面 or ダッシュボード）は
// js/screens/categorySelect.js が判断する（この時点ではまだ何も表示しない）。
