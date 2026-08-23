// 「記録」画面（すべての本の読書記録を、本ごとにまとめて表示する画面）関連の要素を取得しておく
// アプリ全体の活動（読書時間・読んだ本・学んだこと・実践中・完了した実践）は、
// 以前はダッシュボードにあったが、「見せすぎない」ダッシュボードにするためこの画面に一本化した。
const recordsTotalMinutes = document.getElementById("records-total-minutes");
const recordsBookCount = document.getElementById("records-book-count");
const recordsSessionCount = document.getElementById("records-session-count");
const recordsLearningIcon = document.getElementById("records-learning-icon");
const recordsLearningCount = document.getElementById("records-learning-count");
const recordsLearningLabel = document.getElementById("records-learning-label");
const recordsInProgressCount = document.getElementById("records-in-progress-count");
const recordsDoneCount = document.getElementById("records-done-count");
// 実践中・完了した実践のタイルは実用書のときだけ表示する（小説には実践の概念が無いため）
const recordsPracticalTiles = document.querySelectorAll(".records-summary .dashboard-tile-practical");
const recordsSummaryGrid = document.querySelector(".records-summary");
const allRecordsList = document.getElementById("all-records-list");

// すべての本の記録を、本の情報つきで1つの配列にまとめて新しい順に並べる（stats.jsからも再利用される）
function collectAllRecords(books) {
  let allRecords = [];
  books.forEach(function (book) {
    book.records.forEach(function (record) {
      allRecords.push({
        bookId: book.id,
        bookTitle: book.title,
        bookAuthor: book.author,
        date: record.date,
        minutes: record.minutes,
        pages: record.pages,
        // 実用書は「学んだこと」、小説は「今日の感想」をハイライトとして扱う
        learning: record.learning || record.impression || "",
        // 実用書は「名言・印象に残った言葉」、小説は「印象に残ったセリフ」
        quote: record.quote || record.memorableQuote || "",
        timestamp: record.timestamp || 0 // 古い記録にはtimestampがないので、0として扱う
      });
    });
  });

  allRecords.sort(function (a, b) {
    return b.timestamp - a.timestamp;
  });

  return allRecords;
}

// 「記録」画面を最新の状態で表示する（アクティブなカテゴリの本だけを対象にする）。
// 「自分が本から何を学び、何を実践しているのか」を振り返りやすいよう、記録は本ごとに1つの四角いブロックへまとめ、
// タップすると詳細モーダルでその本のセッション一覧が見られるようにする（実績一覧と同じ考え方）。
function renderAllRecordsScreen() {
  const isNovel = loadActiveCategory() === "novel";
  const books = getBooksByCategory(loadActiveCategory());
  const allRecords = collectAllRecords(books);
  const actions = getActionsByActiveCategory();

  // 実用書は「学んだこと」が書かれた記録の数、小説は「好きな言葉」の数を表示する
  recordsLearningIcon.textContent = isNovel ? "💬" : "💡";
  recordsLearningLabel.textContent = isNovel ? "好きな言葉" : "学んだこと";
  const learningCount = isNovel
    ? getCombinedQuotes("novel").length
    : allRecords.filter(function (record) {
        return record.learning;
      }).length;

  // 読書時間・読んだ本（登録数ではなく読了数）・実践中・完了した実践（旧ダッシュボードのタイルをここに統合）
  const totalMinutes = getTotalMinutes(books);
  const finishedBookCount = books.filter(function (book) {
    return getBookStatusInfo(book).key === "done";
  }).length;
  const inProgressCount = actions.filter(function (action) {
    return action.status === "in-progress";
  }).length;
  const doneCount = actions.filter(function (action) {
    return action.status === "done";
  }).length;

  animateNumber(recordsTotalMinutes, totalMinutes);
  animateNumber(recordsBookCount, finishedBookCount);
  animateNumber(recordsSessionCount, allRecords.length);
  animateNumber(recordsLearningCount, learningCount);
  animateNumber(recordsInProgressCount, inProgressCount);
  animateNumber(recordsDoneCount, doneCount);

  recordsPracticalTiles.forEach(function (tile) {
    tile.hidden = isNovel;
  });
  // 小説は表示タイルが4枚になるため、実用書（6枚・3列）と別の列数（2列）できれいに揃える
  recordsSummaryGrid.classList.toggle("records-novel-mode", isNovel);
  replayDashboardTileEntrance(recordsSummaryGrid); // タイルのフェードインを毎回確実に再生させる（app.js）

  allRecordsList.innerHTML = "";

  if (allRecords.length === 0) {
    const emptyMessage = document.createElement("li");
    emptyMessage.className = "record-list-empty";

    const text = document.createElement("p");
    // 本が1冊も無いときは「本を選んで」ではなく、まず本の登録を案内する
    text.textContent = books.length === 0
      ? "この本棚にはまだ本が登録されていません。まず本を登録すると、ここに読書記録が並びます。"
      : "まだ読書記録がありません。本を選んでタイマーを始めると、ここに記録が並びます。";
    emptyMessage.appendChild(text);

    const goToBooksButton = document.createElement("button");
    goToBooksButton.type = "button";
    goToBooksButton.className = "add-item-button record-list-empty-button";
    goToBooksButton.textContent = "本一覧を見る";
    goToBooksButton.addEventListener("click", function () {
      goToNavPage("books");
    });
    emptyMessage.appendChild(goToBooksButton);

    allRecordsList.appendChild(emptyMessage);
    return;
  }

  // 本ごとにグルーピングする。allRecordsはすでに新しい順なので、
  // 最初に出てきた本から並べれば「直近に読んだ本が上」という順序が自然に保たれる
  // （bookIdは巨大な数値のためObject.keys()に頼ると数値順に並び替わってしまうので、別配列で順序を覚えておく）
  const recordsByBookId = {};
  const bookIdsInOrder = [];
  allRecords.forEach(function (record) {
    if (!recordsByBookId[record.bookId]) {
      recordsByBookId[record.bookId] = [];
      bookIdsInOrder.push(record.bookId);
    }
    recordsByBookId[record.bookId].push(record);
  });

  bookIdsInOrder.forEach(function (bookId) {
    allRecordsList.appendChild(buildRecordBookCard(bookId, recordsByBookId[bookId], isNovel, actions));
  });

  // 開いたままのモーダルがあれば、最新のデータで表示し直す
  if (openRecordBookId !== null) {
    renderRecordDetailModal();
  }
}

// 本1冊ぶんの四角いブロック（タイトル・記録回数・要点だけを表示し、押すと詳細モーダルを開く）
function buildRecordBookCard(bookId, records, isNovel, actions) {
  const li = document.createElement("li");
  li.className = "record-book-card";
  li.addEventListener("click", function () {
    openRecordDetail(bookId);
  });

  const firstRecord = records[0];

  const titleEl = document.createElement("p");
  titleEl.className = "record-book-card-title";
  titleEl.textContent = firstRecord.bookTitle;
  li.appendChild(titleEl);

  if (firstRecord.bookAuthor) {
    const authorEl = document.createElement("p");
    authorEl.className = "record-book-card-author";
    authorEl.textContent = firstRecord.bookAuthor;
    li.appendChild(authorEl);
  }

  const metaRow = document.createElement("div");
  metaRow.className = "record-book-card-meta";

  const countEl = document.createElement("span");
  countEl.className = "record-book-card-count";
  countEl.textContent = records.length + "回";
  metaRow.appendChild(countEl);

  // その本に実践があれば、実践中/完了のバッジも添える（実用書のみの機能）
  if (!isNovel) {
    const bookActions = actions.filter(function (action) {
      return action.bookId === bookId;
    });
    const hasDone = bookActions.some(function (action) {
      return action.status === "done";
    });
    const hasInProgress = bookActions.some(function (action) {
      return action.status === "in-progress";
    });
    if (hasDone || hasInProgress) {
      const badge = document.createElement("span");
      badge.className = "status-badge " + (hasDone ? "status-done" : "status-in-progress");
      badge.textContent = hasDone ? "実践あり" : "実践中";
      metaRow.appendChild(badge);
    }
  }

  li.appendChild(metaRow);

  const hintEl = document.createElement("p");
  hintEl.className = "record-book-card-hint";
  hintEl.textContent = "タップして記録を見る";
  li.appendChild(hintEl);

  return li;
}

// ---------- 本ごとの記録の詳細モーダル ----------

const recordDetailModal = document.getElementById("record-detail-modal");
const recordDetailTitle = document.getElementById("record-detail-title");
const recordDetailBody = document.getElementById("record-detail-body");
const recordDetailCloseButton = document.getElementById("record-detail-close-button");

// 今、詳細モーダルで開いている本のid（開いていなければnull）
let openRecordBookId = null;

// 指定した本の記録の詳細モーダルを開く
function openRecordDetail(bookId) {
  openRecordBookId = bookId;
  renderRecordDetailModal();
}

function closeRecordDetail() {
  recordDetailModal.hidden = true;
  openRecordBookId = null;
}

recordDetailCloseButton.addEventListener("click", closeRecordDetail);
bindModalDismissal(recordDetailModal, closeRecordDetail);

// 開いている本のセッション一覧を、今のデータでモーダルに描画し直す
function renderRecordDetailModal() {
  const isNovel = loadActiveCategory() === "novel";
  const books = getBooksByCategory(loadActiveCategory());
  const allRecords = collectAllRecords(books);
  const records = allRecords.filter(function (record) {
    return record.bookId === openRecordBookId;
  });

  if (records.length === 0) {
    closeRecordDetail();
    return;
  }

  recordDetailModal.hidden = false;
  recordDetailTitle.textContent = records[0].bookTitle;

  recordDetailBody.innerHTML = "";

  const sessionList = document.createElement("ul");
  sessionList.className = "record-book-session-list";
  records.forEach(function (record) {
    sessionList.appendChild(buildRecordRow(record, isNovel));
  });
  recordDetailBody.appendChild(sessionList);

  const bookId = openRecordBookId;
  const detailLinkButton = document.createElement("button");
  detailLinkButton.type = "button";
  detailLinkButton.className = "link-button record-book-group-detail-link";
  detailLinkButton.textContent = "この本の詳細を見る ›";
  detailLinkButton.addEventListener("click", function () {
    closeRecordDetail();
    showDetailScreen(bookId);
  });
  recordDetailBody.appendChild(detailLinkButton);
}

// 記録1件ぶんの行（日付・時間・ページ・学び）を組み立てる。
// 本のタイトルはモーダルの見出しにすでにあるため、ここでは繰り返さない
function buildRecordRow(record, isNovel) {
  const row = document.createElement("li");
  row.className = "record-row";
  row.addEventListener("click", function () {
    closeRecordDetail();
    showDetailScreen(record.bookId);
  });

  const topLine = document.createElement("div");
  topLine.className = "record-row-top";

  const dateEl = document.createElement("span");
  dateEl.className = "record-row-meta";
  dateEl.textContent = "📅 " + record.date;
  topLine.appendChild(dateEl);

  const minutesEl = document.createElement("span");
  minutesEl.className = "record-row-meta";
  minutesEl.textContent = "🕐 " + record.minutes + "分";
  topLine.appendChild(minutesEl);

  const pagesEl = document.createElement("span");
  pagesEl.className = "record-row-meta";
  pagesEl.textContent = "📖 " + record.pages + "ページ";
  topLine.appendChild(pagesEl);

  row.appendChild(topLine);

  if (record.learning) {
    const learningEl = document.createElement("p");
    learningEl.className = "record-row-learning";
    learningEl.textContent = (isNovel ? "💬 " : "💡 ") + record.learning;
    row.appendChild(learningEl);
  }

  if (record.quote) {
    const quoteEl = document.createElement("p");
    quoteEl.className = "record-row-learning record-row-quote";
    quoteEl.textContent = "💬 " + record.quote;
    row.appendChild(quoteEl);
  }

  return row;
}
