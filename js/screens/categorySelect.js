// ---------- カテゴリ選択画面／カテゴリの切り替え ----------

const categorySelectScreen = document.getElementById("screen-category-select");
const appShell = document.querySelector(".app-shell");
const categorySelectCards = document.querySelectorAll(".category-select-card");
const categorySwitcherButtons = document.querySelectorAll(".category-switcher-button");
const sidebarNav = document.querySelector(".sidebar-nav");
const sidebarBrandButton = document.getElementById("sidebar-brand-button");
const mobileTopbarTitleButton = document.getElementById("mobile-topbar-title-button");

// カテゴリごとに、サイドバーに表示できる画面（nav属性の値）の一覧
// カテゴリを切り替えたときに、今開いている画面がもう存在しなければダッシュボードに戻すために使う
const NAV_KEYS_BY_CATEGORY = {
  practical: ["dashboard", "books", "actions", "practicalQuotes", "records", "stats", "aiCoach", "settings"],
  novel: ["dashboard", "books", "reviewSummary", "novelQuotes", "records", "stats", "aiCoach", "settings"]
};

// カテゴリ選択画面を隠し、アプリ本体（サイドバー＋メイン画面）を表示してダッシュボードを開く
function enterApp() {
  categorySelectScreen.hidden = true;
  appShell.hidden = false;
  updateCategorySwitcherUI();
  updateNavVisibility();
  goToNavPage("dashboard");
}

// サイドバーの切り替えピルの見た目を、今のアクティブカテゴリに合わせる
function updateCategorySwitcherUI() {
  const activeCategory = loadActiveCategory();
  categorySwitcherButtons.forEach(function (button) {
    button.classList.toggle("active", button.dataset.category === activeCategory);
  });
}

// サイドバーのナビ項目を、今のアクティブカテゴリに合わせて出し分ける
// （実用書：実践リスト・実績／小説：感想まとめ・好きな言葉）
function updateNavVisibility() {
  const activeCategory = loadActiveCategory();
  sidebarNav.classList.toggle("nav-novel-mode", activeCategory === "novel");
}

// カテゴリ選択画面のカード（区画全体）が押されたときの処理
categorySelectCards.forEach(function (card) {
  card.addEventListener("click", function () {
    saveActiveCategory(card.dataset.category);
    enterApp();
  });
});

// アプリ本体を隠し、最初のカテゴリ選択画面に戻す
function showCategorySelectScreen() {
  pauseTimer(); // 開いていた本のタイマーが動いていれば止めておく
  appShell.hidden = true;
  categorySelectScreen.hidden = false;
  closeSidebarDrawer(); // スマホ・タブレット幅でドロワーを開いたまま戻っていた場合に備えて閉じておく
}

// サイドバー左上の「BookHub」ロゴが押されたら、最初のカテゴリ選択画面に戻る
sidebarBrandButton.addEventListener("click", showCategorySelectScreen);

// スマホ・タブレット幅では、同じ役割のボタンをヘッダー中央の「BookHub」に持たせている
// （ドロワーの中にロゴを重複させない分、ナビ項目を大きくする余白にしている）
mobileTopbarTitleButton.addEventListener("click", showCategorySelectScreen);

// サイドバーの切り替えピルが押されたときの処理（アプリを開いたまま、いつでも切り替えられる）
categorySwitcherButtons.forEach(function (button) {
  button.addEventListener("click", function () {
    const category = button.dataset.category;
    if (category === loadActiveCategory()) {
      return; // すでに選択中のカテゴリなら何もしない
    }

    saveActiveCategory(category);
    updateCategorySwitcherUI();
    updateNavVisibility();
    refreshDashboardRecommendations(); // あなたへのおすすめは実用書/小説で内容が違うため、切り替えるたびに取得し直す

    // 今開いている画面が新しいカテゴリに存在しない場合（実践リスト⇔感想まとめ等）は
    // ダッシュボードに戻し、それ以外は同じ画面を新しいカテゴリの内容で描画し直す
    const availableNavKeys = NAV_KEYS_BY_CATEGORY[category] || [];
    const nextNavKey = availableNavKeys.indexOf(currentNavKey) !== -1 ? currentNavKey : "dashboard";
    goToNavPage(nextNavKey);
    closeSidebarDrawer(); // スマホ・タブレット幅でドロワーから切り替えたときは、選んだら自動で閉じる
  });
});

// ---------- 起動時の判定 ----------
// カテゴリが選ばれていればアプリ本体を、まだ選ばれていなければ
// カテゴリ選択画面（初期状態のままHTML上で表示されている）をそのまま使う。
if (loadActiveCategory()) {
  enterApp();
}
