// ---------- 好きな言葉（小説）／名言集（実用書）画面 ----------
// 小説：読書記録で「印象に残ったセリフ」を保存すると自動的にここに集まる。
// 実用書：読書記録で「名言・印象に残った言葉」を保存すると自動的にここに集まる。
// どちらも、それぞれの画面から直接追加することもできる。

// カテゴリ別の表示文言（タブ見出し・空メッセージなど、画面上で言い回しが変わる箇所をまとめておく）
const QUOTE_LABELS = {
  novel: {
    tabLabel: "好きな言葉",
    detailEmpty: "まだこの本の好きな言葉がありません。読書記録の「印象に残ったセリフ」に書くと、ここに集まります。"
  },
  practical: {
    tabLabel: "名言",
    detailEmpty: "まだこの本の名言がありません。読書記録の「名言・印象に残った言葉」に書くと、ここに集まります。"
  }
};

const quoteList = document.getElementById("quote-list");
const quoteEmptyMessage = document.getElementById("quote-empty-message");
const quoteAddForm = document.getElementById("quote-add-form");
const quoteAddTextInput = document.getElementById("quote-add-text");
const quoteAddBookSelect = document.getElementById("quote-add-book-select");
const quoteAddPanel = document.getElementById("quote-add-panel");
const quoteAddTriggerButton = document.getElementById("quote-add-trigger-button");
const quoteAddCloseButton = document.getElementById("quote-add-close-button");

// ---------- 実用書の「名言集」（実践リスト画面の3つ目のタブ）関連の要素 ----------
const practicalQuoteList = document.getElementById("practical-quote-list");
const practicalQuoteEmptyMessage = document.getElementById("practical-quote-empty-message");
const practicalQuoteAddForm = document.getElementById("practical-quote-add-form");
const practicalQuoteAddTextInput = document.getElementById("practical-quote-add-text");
const practicalQuoteAddBookSelect = document.getElementById("practical-quote-add-book-select");
const practicalQuoteAddPanel = document.getElementById("practical-quote-add-panel");
const practicalQuoteAddTriggerButton = document.getElementById("practical-quote-add-trigger-button");
const practicalQuoteAddCloseButton = document.getElementById("practical-quote-add-close-button");

function openPracticalQuoteAddPanel() {
  practicalQuoteAddPanel.hidden = false;
  practicalQuoteAddTextInput.focus();
}

function closePracticalQuoteAddPanel() {
  practicalQuoteAddPanel.hidden = true;
}

practicalQuoteAddTriggerButton.addEventListener("click", openPracticalQuoteAddPanel);
practicalQuoteAddCloseButton.addEventListener("click", closePracticalQuoteAddPanel);

bindModalDismissal(practicalQuoteAddPanel, closePracticalQuoteAddPanel);

// 「好きな言葉を追加」モーダルを、ふわっと浮かび上がる形で開閉する
function openQuoteAddPanel() {
  quoteAddPanel.hidden = false;
  quoteAddTextInput.focus();
}

function closeQuoteAddPanel() {
  quoteAddPanel.hidden = true;
}

quoteAddTriggerButton.addEventListener("click", openQuoteAddPanel);
quoteAddCloseButton.addEventListener("click", closeQuoteAddPanel);

bindModalDismissal(quoteAddPanel, closeQuoteAddPanel);

// 今、編集中の「好きな言葉」のキー（quoteKey関数が返す文字列。編集していなければnull）
let editingQuoteKey = null;

// 好きな言葉1件を一意に表す文字列を作る（読書記録由来／直接追加のどちらにも対応する）
function quoteKey(quote) {
  return quote.source === "manual" ? "manual-" + quote.id : "record-" + quote.bookId + "-" + quote.recordIndex;
}

// 読書記録の「印象に残ったセリフ」（小説）・「名言・印象に残った言葉」（実用書）と、
// それぞれの画面から直接追加した言葉を1つの配列にまとめる（新しいものが先頭にくるように並び替え済み）。
// category: "novel" | "practical"（必須）
function getCombinedQuotes(category) {
  const books = getBooksByCategory(category);
  const recordFieldName = category === "novel" ? "memorableQuote" : "quote";
  let quotes = [];

  books.forEach(function (book) {
    book.records.forEach(function (record, recordIndex) {
      if (record[recordFieldName]) {
        quotes.push({
          source: "record",
          bookId: book.id,
          recordIndex: recordIndex,
          bookTitle: book.title,
          date: record.date,
          timestamp: record.timestamp || 0,
          quote: record[recordFieldName]
        });
      }
    });
  });

  loadFavoriteQuotes().forEach(function (favoriteQuote) {
    if (favoriteQuote.bookId) {
      // 本が紐づいている言葉は、その本のカテゴリで判定する
      const book = books.find(function (b) {
        return b.id === favoriteQuote.bookId;
      });
      if (!book) {
        return;
      }
      quotes.push({
        source: "manual",
        id: favoriteQuote.id,
        bookId: favoriteQuote.bookId,
        bookTitle: book.title,
        date: new Date(favoriteQuote.createdAt).toLocaleDateString("ja-JP"),
        timestamp: favoriteQuote.createdAt,
        quote: favoriteQuote.text
      });
    } else {
      // 本を選ばずに追加した言葉は、保存されているcategoryで判定する
      if (favoriteQuote.category !== category) {
        return;
      }
      quotes.push({
        source: "manual",
        id: favoriteQuote.id,
        bookId: null,
        bookTitle: null,
        date: new Date(favoriteQuote.createdAt).toLocaleDateString("ja-JP"),
        timestamp: favoriteQuote.createdAt,
        quote: favoriteQuote.text
      });
    }
  });

  quotes.sort(function (a, b) {
    return b.timestamp - a.timestamp;
  });

  return quotes;
}

// 好きな言葉画面（小説）を、今保存されているすべての好きな言葉で描画し直す
function renderQuoteList() {
  updateQuoteAddBookOptions(quoteAddBookSelect, "novel");

  const quotes = getCombinedQuotes("novel");
  quoteList.innerHTML = "";
  quoteEmptyMessage.hidden = quotes.length > 0;

  quotes.forEach(function (quote) {
    quoteList.appendChild(buildQuoteCard(quote));
  });

  // 本の詳細画面を開いていれば、その本の「好きな言葉」タブも最新の状態にしておく
  if (currentBookId !== null) {
    renderBookQuotesTab(currentBookId);
  }
}

// 名言集画面（実用書）を、今保存されているすべての名言で描画し直す
function renderPracticalQuoteList() {
  updateQuoteAddBookOptions(practicalQuoteAddBookSelect, "practical");

  const quotes = getCombinedQuotes("practical");
  practicalQuoteList.innerHTML = "";
  practicalQuoteEmptyMessage.hidden = quotes.length > 0;

  quotes.forEach(function (quote) {
    practicalQuoteList.appendChild(buildQuoteCard(quote));
  });

  if (currentBookId !== null) {
    renderBookQuotesTab(currentBookId);
  }
}

// ---------- 本の詳細画面「好きな言葉／名言」タブ：この本に紐づく言葉だけを表示する ----------

const detailQuotesTabButton = document.querySelector('.pill-tab[data-detail-tab="quotes"]');
const detailQuotesList = document.getElementById("detail-quotes-list");
const detailQuotesEmpty = document.getElementById("detail-quotes-empty");

function renderBookQuotesTab(bookId) {
  const books = loadBooks();
  const book = books.find(function (b) {
    return b.id === bookId;
  });
  if (!book) {
    return;
  }

  const labels = QUOTE_LABELS[book.category] || QUOTE_LABELS.novel;
  detailQuotesTabButton.textContent = labels.tabLabel;
  detailQuotesEmpty.textContent = labels.detailEmpty;

  const quotes = getCombinedQuotes(book.category).filter(function (quote) {
    return quote.bookId === bookId;
  });

  detailQuotesList.innerHTML = "";
  detailQuotesEmpty.hidden = quotes.length > 0;

  quotes.forEach(function (quote) {
    detailQuotesList.appendChild(buildQuoteCard(quote));
  });
}

// 「＋ 追加」ボタン：今開いている本を選んだ状態で、カテゴリに応じた追加モーダル（好きな言葉／名言集）を開く
const detailQuoteAddTriggerButton = document.getElementById("detail-quote-add-trigger-button");

detailQuoteAddTriggerButton.addEventListener("click", function () {
  const books = loadBooks();
  const book = books.find(function (b) {
    return b.id === currentBookId;
  });
  if (!book) {
    return;
  }

  if (book.category === "novel") {
    updateQuoteAddBookOptions(quoteAddBookSelect, "novel");
    quoteAddBookSelect.value = String(book.id);
    openQuoteAddPanel();
  } else {
    updateQuoteAddBookOptions(practicalQuoteAddBookSelect, "practical");
    practicalQuoteAddBookSelect.value = String(book.id);
    openPracticalQuoteAddPanel();
  }
});

// 「追加」フォームの本の選択肢を、指定したカテゴリの本で作り直す
function updateQuoteAddBookOptions(selectEl, category) {
  const selectedValue = selectEl.value;
  const books = getBooksByCategory(category);

  selectEl.innerHTML = "";

  const noneOption = document.createElement("option");
  noneOption.value = "";
  noneOption.textContent = "本を選ばない";
  selectEl.appendChild(noneOption);

  books.forEach(function (book) {
    const option = document.createElement("option");
    option.value = String(book.id);
    option.textContent = book.title;
    selectEl.appendChild(option);
  });

  selectEl.value = selectedValue; // 作り直したあとも、選んでいた本があれば復元する
}

// 好きな言葉1件ぶんのカードを組み立てる（押すとその本の詳細画面に移動する。編集中は入力フォームを表示する）
function buildQuoteCard(quote) {
  const li = document.createElement("li");
  li.className = "quote-card";

  const isEditing = editingQuoteKey === quoteKey(quote);

  if (isEditing) {
    li.appendChild(buildQuoteEditForm(quote));
    return li;
  }

  if (quote.bookId) {
    makeRowClickable(li, function () {
      showDetailScreen(quote.bookId);
    });
  } else {
    li.classList.add("quote-card-no-link"); // 本が紐づいていない言葉は、押しても何も起きないことが分かるようにする
  }

  const bodyEl = document.createElement("p");
  bodyEl.className = "quote-card-body";
  bodyEl.textContent = "“" + quote.quote + "”";
  li.appendChild(bodyEl);

  const metaRow = document.createElement("div");
  metaRow.className = "quote-card-meta-row";

  const metaEl = document.createElement("span");
  metaEl.className = "quote-card-meta";
  metaEl.textContent = quote.bookTitle ? quote.bookTitle + "・" + quote.date : quote.date;
  metaRow.appendChild(metaEl);

  // 「編集」「削除」を並べて置くとスマホでは押しにくいため、本一覧のカードと同じ「⋮」メニューにまとめる（js/screens/modal.js）
  const menuActions = [
    {
      label: "編集",
      onClick: function () {
        editingQuoteKey = quoteKey(quote);
        refreshAllQuoteViews();
      }
    }
  ];

  // 直接追加した好きな言葉だけ、削除できるようにする（読書記録由来のものは記録の編集から扱う）
  if (quote.source === "manual") {
    menuActions.push({
      label: "削除",
      danger: true,
      onClick: function () {
        deleteQuote(quote);
      }
    });
  }

  metaRow.appendChild(buildCardMenu(menuActions));
  li.appendChild(metaRow);

  return li;
}

// 好きな言葉を修正するフォームを組み立てる
function buildQuoteEditForm(quote) {
  const form = document.createElement("form");
  form.className = "quote-edit-form";
  // フォーム内のクリックが、カード全体のクリック（本の詳細への遷移）に伝わらないようにする
  form.addEventListener("click", function (event) {
    event.stopPropagation();
  });

  const textarea = document.createElement("textarea");
  textarea.rows = 3;
  textarea.value = quote.quote;
  form.appendChild(textarea);

  const buttonsRow = document.createElement("div");
  buttonsRow.className = "action-form-buttons";

  const saveButton = document.createElement("button");
  saveButton.type = "submit";
  saveButton.textContent = "保存";
  buttonsRow.appendChild(saveButton);

  const cancelButton = document.createElement("button");
  cancelButton.type = "button";
  cancelButton.textContent = "キャンセル";
  cancelButton.addEventListener("click", function () {
    editingQuoteKey = null;
    refreshAllQuoteViews();
  });
  buttonsRow.appendChild(cancelButton);

  form.appendChild(buttonsRow);

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    const newQuoteText = textarea.value.trim();
    if (!newQuoteText) {
      return; // 空にはできない
    }

    if (quote.source === "manual") {
      updateFavoriteQuote(quote.id, newQuoteText);
      editingQuoteKey = null;
      refreshAllQuoteViews();
    } else {
      saveQuoteEdit(quote.bookId, quote.recordIndex, newQuoteText);
    }
  });

  textarea.focus();

  return form;
}

// 好きな言葉（小説の「印象に残ったセリフ」／実用書の「名言・印象に残った言葉」）を更新する
function saveQuoteEdit(bookId, recordIndex, newQuoteText) {
  const books = loadBooks();
  const book = books.find(function (b) {
    return b.id === bookId;
  });
  if (!book) {
    return;
  }

  const record = book.records[recordIndex];
  if (!record) {
    return;
  }

  if (book.category === "novel") {
    record.memorableQuote = newQuoteText;
  } else {
    record.quote = newQuoteText;
  }
  saveBooks(books);

  editingQuoteKey = null;
  refreshAllQuoteViews();

  // 今その本の詳細画面を開いている場合は、記録一覧の表示も最新にする
  if (currentBookId === bookId) {
    renderBookStats();
  }
}

// 直接追加した好きな言葉／名言を、確認のうえ削除する
function deleteQuote(quote) {
  const confirmed = confirm("この言葉を削除しますか？");
  if (!confirmed) {
    return;
  }

  deleteFavoriteQuote(quote.id);
  refreshAllQuoteViews();
}

// 好きな言葉（小説）・名言集（実用書）の一覧表示をまとめて最新の状態にする
// （どちらの画面から編集・削除しても、もう片方の画面や本の詳細タブに古い内容が残らないようにする）
function refreshAllQuoteViews() {
  renderQuoteList();
  renderPracticalQuoteList();
}

// 「追加」フォームが送信されたときの処理（小説：好きな言葉）
quoteAddForm.addEventListener("submit", function (event) {
  event.preventDefault();

  const text = quoteAddTextInput.value.trim();
  if (!text) {
    return; // 空なら何もしない
  }

  const bookId = quoteAddBookSelect.value || null;
  addFavoriteQuote(bookId, text, "novel");

  quoteAddForm.reset();
  closeQuoteAddPanel();
  showToast("好きな言葉を追加しました");
  renderQuoteList();
});

// 「追加」フォームが送信されたときの処理（実用書：名言集）
practicalQuoteAddForm.addEventListener("submit", function (event) {
  event.preventDefault();

  const text = practicalQuoteAddTextInput.value.trim();
  if (!text) {
    return; // 空なら何もしない
  }

  const bookId = practicalQuoteAddBookSelect.value || null;
  addFavoriteQuote(bookId, text, "practical");

  practicalQuoteAddForm.reset();
  closePracticalQuoteAddPanel();
  showToast("名言を追加しました");
  renderPracticalQuoteList();
});

// ---------- サイドバー「今日の一言」（小説のときは、自分の好きな言葉からランダムに表示） ----------

const sidebarQuoteBox = document.getElementById("sidebar-quote");
const sidebarQuoteTextEl = document.getElementById("sidebar-quote-text");
const sidebarQuoteAuthorEl = document.getElementById("sidebar-quote-author");

// 実用書カテゴリのときに表示する、もとの固定の一言
const DEFAULT_SIDEBAR_QUOTE_TEXT = "読むことは、未来の自分への最高の投資。";
const DEFAULT_SIDEBAR_QUOTE_AUTHOR = "— ジム・ローン";

// 保存されている小説の「好きな言葉」（読書記録由来＋直接追加した分）を、本のタイトルつきで1つの配列にまとめる
function getAllFavoriteQuotes() {
  return getCombinedQuotes("novel").map(function (quote) {
    return { text: quote.quote, bookTitle: quote.bookTitle };
  });
}

// サイドバーの「今日の一言」を、今のカテゴリに合わせて描画し直す
// （小説：保存した好きな言葉からランダムに1つ／実用書：もとの固定の一言）
function renderSidebarQuote() {
  const isNovel = loadActiveCategory() === "novel";
  sidebarQuoteBox.classList.toggle("sidebar-quote-clickable", isNovel);

  if (!isNovel) {
    sidebarQuoteTextEl.textContent = DEFAULT_SIDEBAR_QUOTE_TEXT;
    sidebarQuoteAuthorEl.textContent = DEFAULT_SIDEBAR_QUOTE_AUTHOR;
    return;
  }

  const quotes = getAllFavoriteQuotes();
  if (quotes.length === 0) {
    sidebarQuoteTextEl.textContent = "好きな言葉を保存すると、ここに表示されます。";
    sidebarQuoteAuthorEl.textContent = "";
    return;
  }

  const randomQuote = quotes[Math.floor(Math.random() * quotes.length)];
  sidebarQuoteTextEl.textContent = randomQuote.text;
  sidebarQuoteAuthorEl.textContent = randomQuote.bookTitle ? "— 『" + randomQuote.bookTitle + "』" : "";
}

// 「今日の一言」欄を押すたびに、好きな言葉からランダムに選び直す（小説カテゴリのときだけ）
sidebarQuoteBox.addEventListener("click", function () {
  if (loadActiveCategory() === "novel") {
    renderSidebarQuote();
  }
});
