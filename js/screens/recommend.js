// ---------- おすすめの本（右側の余白：画面に余裕があるときだけ表示する補助エリア） ----------
// 誰もが知っている定番・ベストセラー本のリストからランダムに選び、それぞれ実際の表紙・詳細ページを
// Google Books APIから取得して紹介する。
// （ジャンル名だけで検索すると無名の本が混ざってしまうため、タイトルを指定して検索することで
//   「Google Books APIから取得した情報」と「有名な本しか出てこないこと」を両立させている）
// 個別の検索に失敗した本は、表紙なしの簡易カードにフォールバックする。

const recommendBookList = document.getElementById("recommend-book-list");
// PC幅では右のサイドバー（recommendBookList）が使われるが、タブレット横向き・スマホ幅では
// 右側に表示する余白が無いため、代わりにダッシュボードの中の2箇所（どちらか一方だけがCSSで表示される）に
// 同じおすすめを描画する（詳しくはindex.html・style.cssのdashboard-recommend-rail-section参照）
const recommendBookListInline = document.getElementById("recommend-book-list-inline");
const recommendBookListInlineMobile = document.getElementById("recommend-book-list-inline-mobile");

// おすすめとして紹介する候補。ここから毎回ランダムに数冊選ぶことで、開くたびに違う本が並ぶようにする
const RECOMMEND_FAMOUS_BOOKS = [
  { title: "人を動かす", author: "デール・カーネギー" },
  { title: "7つの習慣", author: "スティーブン・R・コヴィー" },
  { title: "嫌われる勇気", author: "岸見一郎" },
  { title: "ファクトフルネス", author: "ハンス・ロスリング" },
  { title: "影響力の武器", author: "ロバート・チャルディーニ" },
  { title: "イシューからはじめよ", author: "安宅和人" },
  { title: "思考は現実化する", author: "ナポレオン・ヒル" },
  { title: "羅生門", author: "芥川龍之介" },
  { title: "銀河鉄道の夜", author: "宮沢賢治" },
  { title: "こころ", author: "夏目漱石" },
  { title: "人間失格", author: "太宰治" },
  { title: "坊っちゃん", author: "夏目漱石" },
  { title: "星の王子さま", author: "サン=テグジュペリ" },
  { title: "老人と海", author: "アーネスト・ヘミングウェイ" },
  { title: "罪と罰", author: "ドストエフスキー" },
  { title: "自省録", author: "マルクス・アウレリウス" },
  { title: "幸福論", author: "アラン" },
  { title: "夜と霧", author: "ヴィクトール・E・フランクル" }
];

// 表示する冊数：右のサイドバー（PC幅）は縦に並ぶぶん高さが長くなりすぎないよう少なめに、
// 横スクロールのカルーセル（タブレット横向き・スマホ幅）はスワイプして見られるぶん多めにする
const RECOMMEND_RAIL_COUNT = 5;
const RECOMMEND_CAROUSEL_COUNT = 8;

function pickRecommendCount() {
  // どちらの表示先でも使えるよう、多い方の件数だけ取得しておく
  return Math.max(RECOMMEND_RAIL_COUNT, RECOMMEND_CAROUSEL_COUNT);
}

// 配列からランダムにn件を重複無く取り出す
function pickRandomItems(items, count) {
  const shuffled = items.slice().sort(function () {
    return Math.random() - 0.5;
  });
  return shuffled.slice(0, count);
}

// 本1冊ぶんの行（表紙・タイトル・著者。押すとGoogle Booksの詳細ページを新しいタブで開く）を組み立てる
// rank: 一覧の中で何番目か（1始まり）。行の先頭に番号として表示する
function buildRecommendBookCard(book, rank) {
  const a = document.createElement("a");
  a.className = "recommend-book-card";
  a.href = book.infoLink;
  a.target = "_blank";
  a.rel = "noopener noreferrer";

  const rankBadge = document.createElement("span");
  rankBadge.className = "recommend-book-rank";
  rankBadge.textContent = rank + ".";
  a.appendChild(rankBadge);

  const cover = document.createElement("div");
  cover.className = "recommend-book-cover";
  if (book.thumbnail) {
    const img = document.createElement("img");
    img.src = book.thumbnail;
    img.alt = book.title;
    img.loading = "lazy";
    cover.appendChild(img);
  } else {
    const initial = document.createElement("span");
    initial.className = "recommend-book-cover-initial";
    initial.textContent = book.title.charAt(0);
    cover.appendChild(initial);
  }
  a.appendChild(cover);

  const info = document.createElement("div");
  info.className = "recommend-book-info";

  const titleEl = document.createElement("p");
  titleEl.className = "recommend-book-title";
  titleEl.textContent = book.title;
  info.appendChild(titleEl);

  if (book.author) {
    const authorEl = document.createElement("p");
    authorEl.className = "recommend-book-author";
    authorEl.textContent = book.author;
    info.appendChild(authorEl);
  }

  a.appendChild(info);

  const arrow = document.createElement("span");
  arrow.className = "recommend-book-arrow";
  arrow.textContent = "›";
  a.appendChild(arrow);

  return a;
}

// 本1冊ぶんの縦型カード（表紙・タイトル・著者。押すとGoogle Booksの詳細ページを新しいタブで開く）を組み立てる。
// 横スクロールのカルーセル（タブレット横向き・スマホ幅の入れ物）で使う。行型のbuildRecommendBookCardと違い、
// 横に並べて見比べやすいよう表紙を大きく見せることを優先し、順位バッジは付けない
function buildRecommendCarouselCard(book) {
  const a = document.createElement("a");
  a.className = "recommend-carousel-card";
  a.href = book.infoLink;
  a.target = "_blank";
  a.rel = "noopener noreferrer";

  const cover = document.createElement("div");
  cover.className = "recommend-carousel-cover";
  if (book.thumbnail) {
    const img = document.createElement("img");
    img.src = book.thumbnail;
    img.alt = book.title;
    img.loading = "lazy";
    cover.appendChild(img);
  } else {
    const initial = document.createElement("span");
    initial.className = "recommend-carousel-cover-initial";
    initial.textContent = book.title.charAt(0);
    cover.appendChild(initial);
  }
  a.appendChild(cover);

  const titleEl = document.createElement("p");
  titleEl.className = "recommend-carousel-title";
  titleEl.textContent = book.title;
  a.appendChild(titleEl);

  if (book.author) {
    const authorEl = document.createElement("p");
    authorEl.className = "recommend-carousel-author";
    authorEl.textContent = book.author;
    a.appendChild(authorEl);
  }

  return a;
}

// 横スクロールのカルーセル用の入れ物に、おすすめの本一覧を描画する（listElが無い＝この幅では使わない場合は何もしない）
function renderRecommendCarouselList(listEl, books) {
  if (!listEl) {
    return;
  }
  listEl.innerHTML = "";
  books.forEach(function (book) {
    listEl.appendChild(buildRecommendCarouselCard(book));
  });
}

// おすすめの本一覧を画面に描画する（サイドバー・タブレット横向き用・スマホ用の3箇所すべてに反映する）
function renderRecommendBooks(books) {
  recommendBookList.innerHTML = "";
  books.slice(0, RECOMMEND_RAIL_COUNT).forEach(function (book, index) {
    recommendBookList.appendChild(buildRecommendBookCard(book, index + 1));
  });

  const carouselBooks = books.slice(0, RECOMMEND_CAROUSEL_COUNT);
  renderRecommendCarouselList(recommendBookListInline, carouselBooks);
  renderRecommendCarouselList(recommendBookListInlineMobile, carouselBooks);
}

// 表紙なしの簡易カードを作る（リンクは、その本を検索したGoogle Booksの結果ページを開く）
function buildRecommendFallbackEntry(book) {
  return {
    title: book.title,
    author: book.author,
    thumbnail: null,
    infoLink: "https://www.google.com/search?tbm=bks&q=" + encodeURIComponent(book.title + " " + book.author)
  };
}

// 1冊分を、タイトルを指定してGoogle Books APIで検索する。表紙が見つかった本の情報を返し、
// 見つからない・通信に失敗した場合はその本だけ表紙なしの簡易カードにフォールバックする
// （Promiseは常に成功させ、catchで全体の描画が止まらないようにする）
function fetchRecommendBook(book, apiKey) {
  const keyParam = apiKey ? "&key=" + encodeURIComponent(apiKey) : "";
  const url =
    "https://www.googleapis.com/books/v1/volumes?q=" +
    encodeURIComponent("intitle:\"" + book.title + "\"") +
    "&maxResults=5&langRestrict=ja" + keyParam;

  // bookSearch.jsのsearchBooksByTitleと同じ理由でreferrerPolicyを明示する
  // （指定しないと、クロスオリジンのfetchはReferer（参照元URL）のパス部分を送らず、
  // HTTPリファラー制限がパス込みで設定されている場合にAPIキーが拒否されてしまうため）
  return fetch(url, { referrerPolicy: "no-referrer-when-downgrade" })
    .then(function (response) {
      if (!response.ok) {
        throw new Error("Google Books APIの取得に失敗しました（ステータスコード: " + response.status + "）");
      }
      return response.json();
    })
    .then(function (data) {
      const items = data.items || [];
      // 表紙画像があるものだけを候補にし、その中で最初に一致した1件を使う
      const match = items.find(function (item) {
        const info = item.volumeInfo || {};
        return info.imageLinks && info.imageLinks.thumbnail;
      });

      if (!match) {
        return buildRecommendFallbackEntry(book);
      }

      const info = match.volumeInfo;
      return {
        title: info.title || book.title,
        author: (info.authors || []).join("、") || book.author,
        thumbnail: info.imageLinks.thumbnail.replace("http://", "https://"),
        infoLink: info.infoLink || ("https://books.google.com/books?id=" + match.id)
      };
    })
    .catch(function (error) {
      console.error("「" + book.title + "」の取得に失敗しました:", error); // 原因を調べられるよう、実際のエラー内容をConsoleに残す
      return buildRecommendFallbackEntry(book);
    });
}

// 有名な本のリストからランダムに選び、それぞれGoogle Books APIから表紙・詳細ページを取得しておすすめとして表示する
function loadRecommendBooks() {
  // APIキーが設定されていれば付ける（キーなしだと、利用者全体で共有の無料枠が
  // 枯渇していて失敗しやすいため。bookSearch.jsのsearchBooksByTitleと同じやり方）
  const apiKey = loadGoogleBooksApiKey();
  console.log(
    "[おすすめ本] APIキー:",
    apiKey ? "設定あり（" + apiKey.length + "文字）" : "未設定（共有の無料枠を使用）"
  );

  const picks = pickRandomItems(RECOMMEND_FAMOUS_BOOKS, pickRecommendCount());
  Promise.all(picks.map(function (book) {
    return fetchRecommendBook(book, apiKey);
  })).then(renderRecommendBooks);
}

loadRecommendBooks();
