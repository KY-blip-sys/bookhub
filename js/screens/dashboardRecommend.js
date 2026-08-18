// ---------- ダッシュボード：あなたへのおすすめ ----------
// 登録している本の読書傾向（カテゴリ・著者）をもとに、Google Books APIから取得したおすすめの本を表示する。
// 集計・取得（読書傾向のカウント／Google Books APIへの問い合わせ／重複除外）はrecommendationService.jsが行い、
// このファイルはその結果をカードとして描画すること・「登録する」ボタンの処理だけを受け持つ。
//
// 表示先は2箇所（どちらか一方だけがCSSで表示される。詳しくはindex.html・style.cssを参照）：
// ・#dashboard-recommend-list　　　　　　　→ PC幅：右サイドバー（.recommend-rail）に縦1列で表示
// ・#dashboard-recommend-list-carousel　　→ タブレット・スマホ幅：「今読んでいる本」の直下に横スクロールで表示

const dashboardRecommendList = document.getElementById("dashboard-recommend-list");
const dashboardRecommendListCarousel = document.getElementById("dashboard-recommend-list-carousel");
const dashboardRecommendMessage = document.getElementById("dashboard-recommend-message");
const dashboardRecommendMessageCarousel = document.getElementById("dashboard-recommend-message-carousel");

// 表示する冊数：右のサイドバー（PC幅）は縦に並ぶぶん高さが長くなりすぎないよう少なめに、
// 横スクロールのカルーセル（タブレット横向き・スマホ幅）はカードサイズを変えずに横スクロールで
// たどれるぶん、取得できた分（最大はrecommendationService.jsのRECOMMEND_TARGET_COUNT）だけ表示する
const DASHBOARD_RECOMMEND_RAIL_COUNT = 5;

// 今おすすめを取得中かどうか（本の追加・編集・削除が連続したときに、同時に何度もAPIを呼ばないようにする）
let isLoadingDashboardRecommendations = false;
// 取得中にもう一度更新の必要が起きたかどうか（取得が終わり次第、もう一度だけ取得し直す）
let dashboardRecommendationsNeedsRefresh = false;

// おすすめが1件も無いとき・取得に失敗したときのメッセージを表示する（欄ごと非表示にはしない）
function showDashboardRecommendMessage(message) {
  dashboardRecommendList.innerHTML = "";
  dashboardRecommendMessage.textContent = message;
  dashboardRecommendMessage.hidden = false;

  dashboardRecommendListCarousel.innerHTML = "";
  dashboardRecommendMessageCarousel.textContent = message;
  dashboardRecommendMessageCarousel.hidden = false;
}

// 本1冊ぶんの「あなたへのおすすめ」カード（表紙・タイトル・著者・カテゴリ・登録するボタン）を組み立てる
function buildDashboardRecommendCard(book) {
  const li = document.createElement("li");
  li.className = "dashboard-recommend-card";

  const cover = document.createElement("div");
  cover.className = "dashboard-recommend-cover";
  if (book.thumbnail) {
    const img = document.createElement("img");
    img.src = book.thumbnail;
    img.alt = book.title;
    img.loading = "lazy";
    cover.appendChild(img);
  } else {
    const initial = document.createElement("span");
    initial.className = "dashboard-recommend-cover-initial";
    initial.textContent = book.title.charAt(0);
    cover.appendChild(initial);
  }
  li.appendChild(cover);

  const titleEl = document.createElement("p");
  titleEl.className = "dashboard-recommend-title";
  titleEl.textContent = book.title;
  li.appendChild(titleEl);

  if (book.author) {
    const authorEl = document.createElement("p");
    authorEl.className = "dashboard-recommend-author";
    authorEl.textContent = book.author;
    li.appendChild(authorEl);
  }

  if (book.genre) {
    const genreEl = document.createElement("span");
    genreEl.className = "dashboard-recommend-genre";
    genreEl.textContent = book.genre;
    li.appendChild(genreEl);
  }

  const registerButton = document.createElement("button");
  registerButton.type = "button";
  registerButton.className = "dashboard-recommend-register-button";
  registerButton.textContent = "登録する";
  registerButton.addEventListener("click", function () {
    registerDashboardRecommendedBook(book, registerButton);
  });
  li.appendChild(registerButton);

  return li;
}

// 「登録する」ボタンが押されたら、本棚に追加する（books.jsのbuildNewBook・addBookをそのまま使う）。
// addBook自身がrefreshDashboardRecommendations()を呼ぶため、おすすめ一覧はそちらで更新される。
function registerDashboardRecommendedBook(book, registerButton) {
  registerButton.disabled = true;
  registerButton.textContent = "登録中…";

  addBook(
    buildNewBook(book.title, book.author, {
      coverImage: book.thumbnail || null,
      pageCount: book.pageCount || null,
      genre: book.genre || null,
      isbn: book.isbn || null
    })
  );
}

// おすすめの本一覧を画面に描画する（サイドバー・カルーセルの両方に反映する。
// 同じ本でも表示先ごとに別々のDOM要素・ボタンが必要なため、カードは2回組み立て直す）
function renderDashboardRecommendations(books) {
  if (books.length === 0) {
    showDashboardRecommendMessage("おすすめを取得できませんでした");
    return;
  }

  dashboardRecommendMessage.hidden = true;
  dashboardRecommendList.innerHTML = "";
  books.slice(0, DASHBOARD_RECOMMEND_RAIL_COUNT).forEach(function (book) {
    dashboardRecommendList.appendChild(buildDashboardRecommendCard(book));
  });

  dashboardRecommendMessageCarousel.hidden = true;
  dashboardRecommendListCarousel.innerHTML = "";
  books.forEach(function (book) {
    dashboardRecommendListCarousel.appendChild(buildDashboardRecommendCard(book));
  });
}

// おすすめ一覧を取得し直す（本の追加・編集・削除のタイミングでbooks.jsから呼ばれるほか、起動時にも呼ぶ）
function refreshDashboardRecommendations() {
  if (isLoadingDashboardRecommendations) {
    dashboardRecommendationsNeedsRefresh = true;
    return;
  }

  isLoadingDashboardRecommendations = true;

  fetchRecommendedBooks()
    .then(renderDashboardRecommendations)
    .catch(function (error) {
      console.error("[あなたへのおすすめ] 取得に失敗しました:", error);
      showDashboardRecommendMessage("おすすめを取得できませんでした");
    })
    .then(function () {
      isLoadingDashboardRecommendations = false;
      if (dashboardRecommendationsNeedsRefresh) {
        dashboardRecommendationsNeedsRefresh = false;
        refreshDashboardRecommendations();
      }
    });
}

refreshDashboardRecommendations(); // 起動時にも一度取得しておく
