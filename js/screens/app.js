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

// ---------- 数値のカウントアップ表示 ----------
// 読書時間・冊数などのタイル数値を、瞬時に書き換えるのではなく前の値から滑らかに増減させる。
// 値が変わっていないとき（同じ画面を開き直しただけ等）は何もしないので、無駄なアニメーションは起きない。
function animateNumber(el, targetValue, options) {
  options = options || {};
  const suffix = options.suffix || "";
  const duration = options.duration || 550;

  const previousValue = Number(el.dataset.animatedValue);
  const startValue = Number.isFinite(previousValue) ? previousValue : 0;

  if (startValue === targetValue) {
    el.textContent = targetValue + suffix;
    el.dataset.animatedValue = targetValue;
    return;
  }

  const prefersReducedMotion = window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (prefersReducedMotion) {
    el.textContent = targetValue + suffix;
    el.dataset.animatedValue = targetValue;
    return;
  }

  cancelAnimationFrame(el._animateNumberRafId);
  const startTime = performance.now();

  function tick(now) {
    const progress = Math.min((now - startTime) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic：終盤ほどゆっくり収束させる
    const currentValue = Math.round(startValue + (targetValue - startValue) * eased);
    el.textContent = currentValue + suffix;

    if (progress < 1) {
      el._animateNumberRafId = requestAnimationFrame(tick);
    } else {
      el.textContent = targetValue + suffix;
      el.dataset.animatedValue = targetValue;
    }
  }

  el._animateNumberRafId = requestAnimationFrame(tick);
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

// ---------- 本の詳細画面：タブ切り替え ----------
// 「感想（振り返り）」「AIに質問」「クイズ」「実践リスト」の4つに絞る
const detailTabButtons = document.querySelectorAll(".pill-tab[data-detail-tab]");
const detailTabPanels = {
  review: document.getElementById("detail-review-panel"),
  aiQuestion: document.getElementById("detail-ai-question-panel"),
  quiz: document.getElementById("detail-quiz-panel"),
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

  if (tabName === "aiQuestion") {
    prepareBookQuestionTab(currentBookId); // js/screens/bookQuestion.js
  }
  if (tabName === "quiz") {
    prepareBookQuizTab(currentBookId); // js/screens/bookQuiz.js
  }
}

detailTabButtons.forEach(function (button) {
  button.addEventListener("click", function () {
    showDetailTab(button.dataset.detailTab);
  });
});

// 指定した本の詳細画面を表示する
function showDetailScreen(bookId) {
  showDetailScreenNow(bookId);
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

  // 「読む目的」が設定されていれば表示する（無ければ何も表示しない）
  if (book.purpose) {
    detailBookPurpose.textContent = "🎯 読む目的：" + book.purpose;
    detailBookPurpose.hidden = false;
  } else {
    detailBookPurpose.hidden = true;
  }

  showDetailTab("review"); // 本を開くたびに、いちばん使う「感想」タブから始める

  renderReadingProgress(); // 総ページ数に対する読書の進捗を表示する
  renderBookReview(bookId); // 感想（レビュー）を表示する
  updateShareSectionVisibility(book); // 読み終えていれば「読了カードを見る」ボタンを出す
  renderBookLearnings(bookId); // この本の「学んだこと」一覧を最新の状態にする（records.js）
  renderBookActionsTab(bookId); // この本の「実践リスト」タブを最新の状態にする（actions.js）

  // 本の詳細は「本一覧」の中のサブ画面という位置づけなので、
  // 他のどのページから開いても、必ず正しく画面が切り替わる（showPage()でフェードインも揃える）
  showPage("screen-detail");
  // 詳細画面自体はサイドバーの項目を持たないため、showPage()の判定では
  // どの項目もactiveにならない。代わりに「本一覧」をactiveのままにしておく
  navItems.forEach(function (navItem) {
    navItem.classList.toggle("active", navItem.dataset.nav === "books");
  });
  updateNavIndicator();

  // 本の詳細画面のときだけ、ヘッダーに「本一覧に戻る」ボタンを出し、タイトルも本のタイトルに差し替える
  headerBackButton.hidden = false;
  setHeaderTitle(book.title);
}

// 本の一覧画面に戻る
function showBookListScreen() {
  currentBookId = null;
  goToNavPage("books"); // 本一覧ページに戻り、一覧も最新の状態にする
}

headerBackButton.addEventListener("click", showBookListScreen);

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
const sidebarToggleTab = document.getElementById("sidebar-toggle-tab");
const sidebarCloseButton = document.getElementById("sidebar-close-button");
const sidebarBackdrop = document.getElementById("sidebar-backdrop");

function openSidebarDrawer() {
  sidebarEl.classList.add("sidebar-open");
  sidebarToggleTab.classList.add("sidebar-open");
  sidebarToggleTab.setAttribute("aria-expanded", "true");
  sidebarToggleTab.setAttribute("aria-label", "メニューを閉じる");
  // 「◀」は.sidebarの外（兄弟要素）に置いているため、.sidebarにsidebar-openを
  // 付けるだけでは表示されない。自分自身にも同じクラスを付けて表示を切り替える
  sidebarCloseButton.classList.add("sidebar-open");
  sidebarBackdrop.hidden = false;
}

// ナビの項目を選んだときなど、明示的に閉じるボタンを押していなくても
// ドロワーごと閉じたい場面が多いため、単体の関数にしておく
function closeSidebarDrawer() {
  sidebarEl.classList.remove("sidebar-open");
  sidebarToggleTab.classList.remove("sidebar-open");
  sidebarToggleTab.setAttribute("aria-expanded", "false");
  sidebarToggleTab.setAttribute("aria-label", "メニューを開く");
  sidebarCloseButton.classList.remove("sidebar-open");
  sidebarBackdrop.hidden = true;
}

// 「≡」は閉じているときだけ表示され、開く操作のみを行う（開いている間はCSSで非表示になるため、
// 押されるのは常に「閉じている」ときだけ）
sidebarToggleTab.addEventListener("click", function () {
  if (sidebarEl.classList.contains("sidebar-open")) {
    closeSidebarDrawer();
  } else {
    openSidebarDrawer();
  }
});
// サイドバーの縁に貼り付いた「◀」は、開いている間だけ表示され、閉じる操作だけを行う
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
  updateNavIndicator();
}

// ---------- サイドバー：選択中の項目へ滑らかに追従する背景 ----------
const navActiveIndicator = document.getElementById("nav-active-indicator");

// 今.activeが付いている項目の位置・高さに、インジケーターを合わせる。
function updateNavIndicator() {
  const activeItem = document.querySelector(".nav-item.active");
  if (!activeItem || activeItem.offsetParent === null) {
    // 表示中の.activeが無い（サイドバーごと隠れている等）ときは、インジケーターも消しておく
    navActiveIndicator.style.opacity = "0";
    return;
  }
  navActiveIndicator.style.transform = "translateY(" + activeItem.offsetTop + "px)";
  navActiveIndicator.style.height = activeItem.offsetHeight + "px";
  navActiveIndicator.style.opacity = "1";
}

// サイドバーのドロワー開閉・画面幅の変化で項目の高さが変わることがあるため、位置を再計算する
window.addEventListener("resize", updateNavIndicator);

// .dashboard-tile（#dashboardのタイル）は本一覧のカードと違い、
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
  dashboard: "ホーム",
  books: "本棚",
  actions: "実践リスト",
  stats: "統計",
  ai: "AI",
  pricing: "料金プラン",
  settings: "設定"
};

// 以前はメイン画面上部に浮かせたヘッダーで「今開いているページ」の名前を表示していたが、
// スマホのトップバー・サイドバーの「BookHub」ロゴの位置に表示するよう変更したため、
// そちらの2つの要素を書き換える
const headerTopbarTitleEl = document.getElementById("mobile-topbar-title-button");
const headerSidebarBrandNameEl = document.querySelector(".sidebar-brand-name");

function setHeaderTitle(text) {
  headerTopbarTitleEl.textContent = text;
  headerSidebarBrandNameEl.textContent = text;
}

// 今開いているページ（サイドバーのnav属性の値）を覚えておく。
let currentNavKey = "dashboard";

// サイドバーの項目名（nav属性の値）を指定して、そのページに移動する
function goToNavPage(navKey) {
  currentNavKey = navKey;

  showPage("screen-" + navKey);
  setHeaderTitle(NAV_LABELS[navKey] || "");
  headerBackButton.hidden = true; // 本の詳細から出たら、戻るボタンは隠す

  // ページを開くたびに、その中身を最新の状態にしておく
  if (navKey === "dashboard" || navKey === "books") {
    renderBookList();
  }
  if (navKey === "actions") {
    showActionsTab("inProgress"); // サイドバーから開いたときは、常に「実践中」タブから始める
  }
  if (navKey === "stats") {
    renderStatsScreen();
  }
  if (navKey === "ai") {
    prepareAiScreen(); // aiTabs.js：常に「チャット」タブから開き直す（実践リスト等の他タブ画面と同じ挙動）
  }
  if (navKey === "pricing") {
    preparePricingScreen(); // pricing.js
  }
  if (navKey === "settings") {
    prepareSettingsScreen(); // settings.js
  }
}

navItems.forEach(function (navItem) {
  navItem.addEventListener("click", function () {
    goToNavPage(navItem.dataset.nav);
    closeSidebarDrawer(); // スマホ・タブレット幅でドロワーから選んだときは、選んだら自動で閉じる
  });
});

// 「data-nav-target」属性を持つボタン（ヒーローバナーのボタンなど）も、同じ仕組みでページ移動できるようにする
document.querySelectorAll("[data-nav-target]").forEach(function (button) {
  button.addEventListener("click", function () {
    goToNavPage(button.dataset.navTarget);
    closeSidebarDrawer();
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

// アプリは起動したら常にホーム（ダッシュボード）から始まる。
goToNavPage("dashboard");
