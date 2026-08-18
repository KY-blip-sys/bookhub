// ---------- カテゴリの切り替え（実用書 / 小説） ----------
// 以前はアプリ起動時に「実用書 / 小説」を選ぶ専用画面を挟んでいたが、
// 起動したら常にホーム（ダッシュボード）から始まるように変更したため、
// このファイルはカテゴリの読み込み・記憶と、切り替えUIの初期化だけを担当する。

// サイドバーの切り替えピルと、ホーム画面上の切り替えタブの両方を、同じクラス名で一括して扱う
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

// 切り替えピル（サイドバー・ホーム画面のどちらも）の見た目を、今のアクティブカテゴリに合わせる
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

// サイドバー左上・スマホ/タブレット幅のヘッダー中央「BookHub」ロゴが押されたら、ホームに戻る
function goHome() {
  confirmLeaveWhileTimerRunning(function () {
    goToNavPage("dashboard");
    closeSidebarDrawer(); // ドロワーを開いたまま押した場合に備えて閉じておく
  });
}

sidebarBrandButton.addEventListener("click", goHome);
mobileTopbarTitleButton.addEventListener("click", goHome);

// 切り替えピルが押されたときの処理（サイドバー・ホーム画面のどちらの切り替えタブから押しても同じ処理）
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

// ---------- 起動時の初期化 ----------
// カテゴリがまだ一度も選ばれていなければ（初回起動）、実用書を初期カテゴリとして保存しておく
// （起動時にカテゴリ選択を挟まないため、必ずどちらかのカテゴリで開始する）
if (!loadActiveCategory()) {
  saveActiveCategory("practical");
}

updateCategorySwitcherUI();
updateNavVisibility();
goToNavPage("dashboard"); // 起動したら常にホームから始める
