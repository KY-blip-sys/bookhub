// ---------- ダッシュボードのモチベーションカード（横スライドカルーセル） ----------
// 「これまでに何ページ読みました」という実績表示の代わりに、
// 「今読んでいる本」ごとに、自分が登録した好きな言葉／今日の一歩（💬・💡）をスライドで見せる。
//
// ハイライト（好きな言葉／今日の一歩）の中身は、半日単位のバケットID（日付＋午前午後）を
// もとにした決定的なハッシュで選ぶ。乱数は使わないため、同じ半日のうちはリロードしても
// 内容が変わらない。バケットが変わる（＝半日〜1日たつ）か、候補そのものが変わる
// （実践を完了して候補から外れる、など）と、選ばれる内容も変わる。
//
// AIサービス（aiService.js等）はここでは一切使わない。表示する言葉・実践項目は
// すべてユーザー自身が登録したデータ（quotes.js／actionsModel.jsの既存関数）から選ぶだけ。

const MOTIVATION_CAROUSEL_MAX_BOOKS = 3; // 対象本を直近に読んだ順で絞り込む数（カードを増やしすぎない）

let motivationCarouselCards = [];
let motivationCarouselIndex = 0;

// 半日単位のバケットID（正午で区切る）。同じバケットのうちは結果が変わらない。
function getMotivationBucketId(now) {
  const d = now || new Date();
  const half = d.getHours() < 12 ? "AM" : "PM";
  return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate() + "-" + half;
}

// 文字列から決定的な整数を作る簡易ハッシュ（乱数は使わない）
function hashStringToInt(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

// 1冊ぶんのカードを組み立てる（好きな言葉／今日の一歩カードの最大1枚。候補が無ければ作らない）
function buildMotivationCardsForBook(book, bucketId, actions) {
  const cards = [];

  if (book.category === "novel") {
    const quotes = getCombinedQuotes("novel").filter(function (quote) {
      return quote.bookId === book.id;
    });
    if (quotes.length > 0) {
      const index = hashStringToInt(bucketId + "-" + book.id + "-quote") % quotes.length;
      cards.push({ type: "quote", book: book, quote: quotes[index] });
    }
  } else {
    const bookActions = actions.filter(function (action) {
      return action.bookId === book.id && action.status !== "done";
    });
    if (bookActions.length > 0) {
      const index = hashStringToInt(bucketId + "-" + book.id + "-action") % bookActions.length;
      const chosenAction = bookActions[index];
      const nextTodo = (chosenAction.todos || []).find(function (todo) {
        return !todo.done;
      });
      cards.push({
        type: "action",
        book: book,
        stepText: nextTodo ? nextTodo.text : chosenAction.content
      });
    }
  }

  return cards;
}

// カルーセルに並べるカードを組み立てる（booksは呼び出し側ですでにアクティブなカテゴリで絞り込み済み）
function buildMotivationCards(books) {
  const bucketId = getMotivationBucketId();
  const actions = getActionsByActiveCategory();

  const readingBooks = books.filter(function (book) {
    return getBookStatusInfo(book).key === "reading";
  });
  readingBooks.sort(function (a, b) {
    return getLatestActivityTimestamp(b) - getLatestActivityTimestamp(a);
  });

  let cards = [];
  readingBooks.slice(0, MOTIVATION_CAROUSEL_MAX_BOOKS).forEach(function (book) {
    cards = cards.concat(buildMotivationCardsForBook(book, bucketId, actions));
  });
  return cards;
}

// カルーセル全体を最新の状態で描画し直す
function renderMotivationCarousel(books) {
  const section = document.getElementById("motivation-carousel");
  motivationCarouselCards = buildMotivationCards(books);

  if (motivationCarouselCards.length === 0) {
    section.hidden = true;
    return;
  }

  section.hidden = false;
  motivationCarouselIndex = Math.min(motivationCarouselIndex, motivationCarouselCards.length - 1);
  renderMotivationCarouselFrame();
}

// 今のインデックスのカード1枚と、ドットインジケーターを描画する
function renderMotivationCarouselFrame() {
  const viewport = document.getElementById("motivation-carousel-viewport");
  const dotsEl = document.getElementById("motivation-carousel-dots");
  const card = motivationCarouselCards[motivationCarouselIndex];

  viewport.innerHTML = "";
  viewport.appendChild(buildMotivationCardEl(card));

  dotsEl.innerHTML = "";
  motivationCarouselCards.forEach(function (_, index) {
    const dot = document.createElement("span");
    dot.className = "motivation-carousel-dot" + (index === motivationCarouselIndex ? " active" : "");
    dotsEl.appendChild(dot);
  });
}

// カード1枚ぶんのDOMを組み立てる（押すとその本の詳細画面に移動する）。
// 1行目：アイコン＋本のタイトル（どの本の情報か一目でわかるように必ず表示）
// 2行目：好きな言葉／今日の一歩の本文
function buildMotivationCardEl(card) {
  const el = document.createElement("div");
  el.className = "motivation-carousel-card";
  makeRowClickable(el, function () {
    showDetailScreen(card.book.id);
  });

  const icon = card.type === "quote" ? "💬" : "💡";

  const titleEl = document.createElement("p");
  titleEl.className = "motivation-carousel-book-title";
  titleEl.textContent = icon + " 『" + card.book.title + "』";
  el.appendChild(titleEl);

  const mainTextEl = document.createElement("p");
  mainTextEl.className = "motivation-carousel-main-text";

  if (card.type === "quote") {
    mainTextEl.textContent = "「" + card.quote.quote + "」";
  } else {
    mainTextEl.textContent = "今日は「" + card.stepText + "」してみよう";
  }
  el.appendChild(mainTextEl);

  return el;
}

document.getElementById("motivation-carousel-prev").addEventListener("click", function (event) {
  event.stopPropagation();
  if (motivationCarouselCards.length === 0) {
    return;
  }
  motivationCarouselIndex =
    (motivationCarouselIndex - 1 + motivationCarouselCards.length) % motivationCarouselCards.length;
  renderMotivationCarouselFrame();
});

document.getElementById("motivation-carousel-next").addEventListener("click", function (event) {
  event.stopPropagation();
  if (motivationCarouselCards.length === 0) {
    return;
  }
  motivationCarouselIndex = (motivationCarouselIndex + 1) % motivationCarouselCards.length;
  renderMotivationCarouselFrame();
});
