// ---------- おすすめの本（右側の余白：画面に余裕があるときだけ表示する補助エリア） ----------
// Google Books APIからランダムなジャンルの本を取得して紹介する。
// 取得に失敗した（オフライン・APIの利用制限など）ときは、固定のおすすめ本を表示する。

const recommendBookList = document.getElementById("recommend-book-list");

// 検索に使うジャンルの候補。毎回ランダムに1つ選ぶことで、開くたびに違う本が並ぶようにする
const RECOMMEND_SEARCH_TOPICS = [
  "小説", "ビジネス", "自己啓発", "歴史", "心理学", "哲学", "エッセイ", "科学", "ミステリー", "経済", "旅行記", "料理"
];

// 取得に失敗したときに表示する、固定のおすすめ本（表紙は無いので頭文字のプレースホルダーで表示する）
const RECOMMEND_FALLBACK_BOOKS = [
  { title: "人を動かす", author: "デール・カーネギー" },
  { title: "7つの習慣", author: "スティーブン・R・コヴィー" },
  { title: "銀河鉄道の夜", author: "宮沢賢治" },
  { title: "羅生門", author: "芥川龍之介" },
  { title: "自省録", author: "マルクス・アウレリウス" },
  { title: "こころ", author: "夏目漱石" }
];

// 表示する冊数
const RECOMMEND_BOOK_COUNT = 5;

function pickRecommendCount() {
  return RECOMMEND_BOOK_COUNT;
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

// おすすめの本一覧を画面に描画する
function renderRecommendBooks(books) {
  recommendBookList.innerHTML = "";
  books.forEach(function (book, index) {
    recommendBookList.appendChild(buildRecommendBookCard(book, index + 1));
  });
}

// 固定のおすすめ本を表示する（リンクは、その本を検索したGoogle Booksの結果ページを開く）
function renderRecommendFallback() {
  const count = Math.min(pickRecommendCount(), RECOMMEND_FALLBACK_BOOKS.length);
  const books = pickRandomItems(RECOMMEND_FALLBACK_BOOKS, count).map(function (book) {
    return {
      title: book.title,
      author: book.author,
      thumbnail: null,
      infoLink: "https://www.google.com/search?tbm=bks&q=" + encodeURIComponent(book.title + " " + book.author)
    };
  });
  renderRecommendBooks(books);
}

// Google Books APIからランダムなジャンルの本を取得し、表紙のある本だけを対象におすすめを表示する
function loadRecommendBooks() {
  const topic = RECOMMEND_SEARCH_TOPICS[Math.floor(Math.random() * RECOMMEND_SEARCH_TOPICS.length)];
  const startIndex = Math.floor(Math.random() * 30);
  // APIキーが設定されていれば付ける（キーなしだと、利用者全体で共有の無料枠が
  // 枯渇していて失敗しやすいため。bookSearch.jsのsearchBooksByTitleと同じやり方）
  const apiKey = loadGoogleBooksApiKey();
  const keyParam = apiKey ? "&key=" + encodeURIComponent(apiKey) : "";
  const url =
    "https://www.googleapis.com/books/v1/volumes?q=" +
    encodeURIComponent(topic) +
    "&maxResults=40&startIndex=" + startIndex + "&langRestrict=ja" + keyParam;

  // デバッグ用：bookSearch.jsのsearchBooksByTitleと同じ形で、実際に送るリクエストの中身をConsoleに残す
  // （APIキーの値そのものは出さず、「設定されているか」と「何文字か」だけを出す）
  console.log(
    "[おすすめ本] APIキー:",
    apiKey ? "設定あり（" + apiKey.length + "文字）" : "未設定（共有の無料枠を使用）"
  );
  console.log(
    "[おすすめ本] リクエストURL:",
    apiKey ? url.replace(encodeURIComponent(apiKey), "***") : url
  );

  // bookSearch.jsのsearchBooksByTitleと同じ理由でreferrerPolicyを明示する
  // （指定しないと、クロスオリジンのfetchはReferer（参照元URL）のパス部分を送らず、
  // HTTPリファラー制限がパス込みで設定されている場合にAPIキーが拒否されてしまうため）
  fetch(url, { referrerPolicy: "no-referrer-when-downgrade" })
    .then(function (response) {
      if (!response.ok) {
        // ステータスコードだけでなく、Googleが返す本文中のエラー理由もConsoleで確認できるようにする
        return response
          .json()
          .catch(function () {
            return {};
          })
          .then(function (body) {
            const detail = body.error && body.error.message ? body.error.message : "";
            throw new Error(
              "Google Books APIの取得に失敗しました（ステータスコード: " + response.status + "）" + (detail ? "：" + detail : "")
            );
          });
      }
      return response.json();
    })
    .then(function (data) {
      const items = data.items || [];
      // タイトルと表紙画像の両方がそろっている本だけを候補にする
      const candidates = items
        .filter(function (item) {
          const info = item.volumeInfo || {};
          return info.title && info.imageLinks && info.imageLinks.thumbnail;
        })
        .map(function (item) {
          const info = item.volumeInfo;
          return {
            title: info.title,
            author: (info.authors || []).join("、"),
            thumbnail: info.imageLinks.thumbnail.replace("http://", "https://"),
            infoLink: info.infoLink || ("https://books.google.com/books?id=" + item.id)
          };
        });

      if (candidates.length < RECOMMEND_BOOK_COUNT) {
        renderRecommendFallback();
        return;
      }

      renderRecommendBooks(pickRandomItems(candidates, pickRecommendCount()));
    })
    .catch(function (error) {
      console.error("おすすめ本の取得に失敗しました:", error); // 原因を調べられるよう、実際のエラー内容をConsoleに残す
      renderRecommendFallback();
    });
}

loadRecommendBooks();
