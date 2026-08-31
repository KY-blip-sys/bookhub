// 記録フォーム関連の要素を取得しておく
const recordFormSection = document.getElementById("record-form-section");
const recordForm = document.getElementById("record-form");
const recordPagesInput = document.getElementById("record-pages");
const recordSaveButton = document.getElementById("record-save-button");
enableFlexibleDigitInput(recordPagesInput); // 全角数字で入力しても半角として扱う

// 実用書用・小説用、それぞれの入力欄グループ
const recordFieldsPractical = document.getElementById("record-fields-practical");
const recordLearningInput = document.getElementById("record-learning");
const recordQuoteInput = document.getElementById("record-quote");
const recordDetailsPractical = document.getElementById("record-details-practical");
const recordFieldsNovel = document.getElementById("record-fields-novel");
const recordImpressionInput = document.getElementById("record-impression");
const recordMemorableQuoteInput = document.getElementById("record-memorable-quote");
const recordFavoriteCharacterInput = document.getElementById("record-favorite-character");
const recordNotesInput = document.getElementById("record-notes");
const recordDetailsNovel = document.getElementById("record-details-novel");

// 他の欄を書き終える前にEnterキー（変換確定を含む）でフォームが送信され、
// 書きかけの内容が次の記録の入力欄に紛れ込んでしまわないようにする
[recordPagesInput, recordQuoteInput, recordMemorableQuoteInput, recordFavoriteCharacterInput].forEach(preventEnterSubmit);

// 本ごとの記録表示に使う要素を取得しておく
const statsTotalMinutes = document.getElementById("stats-total-minutes");
const statsSessionCount = document.getElementById("stats-session-count");
const historyList = document.getElementById("history-list");
const learningList = document.getElementById("learning-list");
const notesListHeading = document.getElementById("notes-list-heading");

// ---------- 読書履歴：押すと開閉する横バー ----------
// 件数が増えると縦に長くなりがちなため、既定では畳んでおき、見たいときだけ開く
const historyToggleButton = document.getElementById("history-toggle-button");
const historyToggleCount = document.getElementById("history-toggle-count");

historyToggleButton.addEventListener("click", function () {
  const isExpanded = historyToggleButton.getAttribute("aria-expanded") === "true";
  historyToggleButton.setAttribute("aria-expanded", String(!isExpanded));
  historyList.hidden = isExpanded;
});

// 今、何番目の記録を編集中か（新規保存のときはnull）
let editingRecordIndex = null;

// 今開いている本のカテゴリに合わせて、記録フォームの入力欄を切り替える
function updateRecordFormFieldsForCategory(category) {
  recordFieldsPractical.hidden = category === "novel";
  recordFieldsNovel.hidden = category !== "novel";
}

// タイマー終了後に、記録の入力フォームを表示する
function showRecordForm() {
  const books = loadBooks();
  const book = books.find(function (b) {
    return b.id === currentBookId;
  });
  if (book) {
    updateRecordFormFieldsForCategory(book.category);
  }

  recordFormSection.hidden = false;
}

// 記録の入力フォームを隠して、中身と編集状態を空に戻す
function hideRecordForm() {
  recordFormSection.hidden = true;
  recordForm.reset();
  recordDetailsPractical.open = false; // 「詳しく記録する」も、次に開いたときはたたんだ状態から始める
  recordDetailsNovel.open = false;
  editingRecordIndex = null;
  recordSaveButton.textContent = "保存";
}

// 「×」ボタン・背景タップ・Escapeキーでも、他のモーダルと同じように閉じられるようにする
const recordFormCloseButton = document.getElementById("record-form-close-button");
recordFormCloseButton.addEventListener("click", hideRecordForm);
bindModalDismissal(recordFormSection, hideRecordForm);

// 指定した記録を編集モードで開く
function startEditingRecord(index) {
  const books = loadBooks();
  const book = books.find(function (b) {
    return b.id === currentBookId;
  });
  if (!book) {
    return;
  }

  const record = book.records[index];
  if (!record) {
    return;
  }

  editingRecordIndex = index;
  updateRecordFormFieldsForCategory(book.category);
  recordPagesInput.value = record.pages;

  if (book.category === "novel") {
    recordImpressionInput.value = record.impression || "";
    recordMemorableQuoteInput.value = record.memorableQuote || "";
    recordFavoriteCharacterInput.value = record.favoriteCharacter || "";
    recordNotesInput.value = record.notes || "";
    // すでに詳細項目に内容があれば、編集時に見落とさないよう開いた状態で表示する
    recordDetailsNovel.open = !!(record.memorableQuote || record.favoriteCharacter || record.notes);
  } else {
    recordLearningInput.value = record.learning || "";
    recordQuoteInput.value = record.quote || "";
    recordDetailsPractical.open = !!record.quote;
  }

  recordSaveButton.textContent = "更新";

  showRecordForm();
}

// 指定した記録を削除する
function deleteRecord(index) {
  const confirmed = confirm("この記録を削除しますか？");
  if (!confirmed) {
    return;
  }

  const books = loadBooks();
  const book = books.find(function (b) {
    return b.id === currentBookId;
  });
  if (!book) {
    return;
  }

  book.records.splice(index, 1);
  saveBooks(books);
  renderBookStats();
  renderReadingProgress(); // 記録の合計ページ数が変わるので、進捗表示も更新する
  renderReadingRing(); // 削除した記録が今日の分だった場合に備えて、サイドバーのリングも更新する
  renderBookQuotesTab(book.id); // 削除した記録に名言が入っていた場合、タブに残ったままにならないようにする

  // 削除によって読了状態が変わることがあるため、記録保存時と同じくヘッダー表示も最新化する
  const statusInfo = getBookStatusInfo(book);
  detailStatusBadge.textContent = statusInfo.label;
  detailStatusBadge.className = "status-badge detail-status-badge status-" + statusInfo.key;
  updateShareSectionVisibility(book);
}

// 読書履歴1件ぶんのカードを組み立てる（名言・学んだことのカードと同じ雰囲気に揃える）
function buildHistoryCard(record, index) {
  const li = document.createElement("li");
  li.className = "history-card";

  const mainRow = document.createElement("div");
  mainRow.className = "history-card-main";

  const minutesEl = document.createElement("span");
  minutesEl.className = "history-card-minutes";
  minutesEl.textContent = record.minutes + "分";
  mainRow.appendChild(minutesEl);

  const pagesEl = document.createElement("span");
  pagesEl.className = "history-card-pages";
  pagesEl.textContent = record.pages + "ページ読書";
  mainRow.appendChild(pagesEl);

  li.appendChild(mainRow);

  // 実用書は「名言・印象に残った言葉」、小説は「印象に残ったセリフ」。
  // どちらもこの記録に書かれていれば、この場でも振り返れるように表示する
  // （好きな言葉／名言タブにも自動で集まるが、記録がここに何件も並ぶとどれに書いたか分かりにくいため）
  const quoteText = record.quote || record.memorableQuote;
  if (quoteText) {
    const quoteEl = document.createElement("p");
    quoteEl.className = "history-card-quote";
    quoteEl.textContent = "💬 " + quoteText;
    li.appendChild(quoteEl);
  }

  const metaRow = document.createElement("div");
  metaRow.className = "history-card-meta-row";

  const dateEl = document.createElement("span");
  dateEl.className = "history-card-date";
  dateEl.textContent = record.date;
  metaRow.appendChild(dateEl);

  // 「編集」「削除」を並べて置くとスマホでは押しにくいため、本一覧のカードと同じ「⋮」メニューにまとめる（js/screens/modal.js）
  metaRow.appendChild(buildCardMenu([
    {
      label: "編集",
      onClick: function () {
        startEditingRecord(index);
      }
    },
    {
      label: "削除",
      danger: true,
      onClick: function () {
        deleteRecord(index);
      }
    }
  ]));
  li.appendChild(metaRow);

  return li;
}

// 小説の記録1件ぶんの「感想・メモ」欄を組み立てる（何も書かれていなければnull）。
// 「印象に残ったセリフ」は好きな言葉タブの方に自動で集まるため、ここでは繰り返さない。
function buildNovelNoteListItem(record) {
  const parts = [];
  if (record.impression) {
    parts.push("感想：" + record.impression);
  }
  if (record.favoriteCharacter) {
    parts.push("好きな登場人物：" + record.favoriteCharacter);
  }
  if (record.notes) {
    parts.push("考察メモ：" + record.notes);
  }

  if (parts.length === 0) {
    return null;
  }

  const li = document.createElement("li");
  li.textContent = record.date + "：" + parts.join(" / ");
  return li;
}

// 今開いている本の記録（累計時間・回数・履歴・学び）を画面に表示する
function renderBookStats() {
  const books = loadBooks();
  const book = books.find(function (b) {
    return b.id === currentBookId;
  });
  if (!book) {
    return;
  }

  const totalMinutes = book.records.reduce(function (sum, record) {
    return sum + record.minutes;
  }, 0);

  animateNumber(statsTotalMinutes, totalMinutes);
  animateNumber(statsSessionCount, book.records.length);
  notesListHeading.textContent = book.category === "novel" ? "感想・メモ一覧" : "学んだこと一覧";
  // 「学んだこと」を読書記録と切り離して直接追加できるのは、この概念がある実用書だけ
  learningAddTriggerButton.hidden = book.category !== "practical";

  historyToggleCount.textContent = book.records.length + "件";

  historyList.innerHTML = "";

  book.records.forEach(function (record, index) {
    historyList.appendChild(buildHistoryCard(record, index));
  });

  if (book.category === "practical") {
    // 実用書：読書記録由来 + 直接追加した分をまとめて、編集・削除できるカードとして表示する
    learningList.classList.add("quote-list");
    renderLearningList(book);
  } else {
    // 小説：これまで通り、記録に書かれた感想・メモをプレーンテキストで表示する
    learningList.classList.remove("quote-list");
    learningList.innerHTML = "";
    book.records.forEach(function (record) {
      const noteItem = buildNovelNoteListItem(record);
      if (noteItem) {
        learningList.appendChild(noteItem);
      }
    });
  }
}

// ---------- 学んだこと（実用書のみ）：読書記録由来 + 直接追加した分をまとめて、
// 名言タブと同じカード形式（quote-card）で編集・削除できるようにする ----------

const learningAddTriggerButton = document.getElementById("learning-add-trigger-button");
const learningAddPanel = document.getElementById("learning-add-panel");
const learningAddCloseButton = document.getElementById("learning-add-close-button");
const learningAddForm = document.getElementById("learning-add-form");
const learningAddTextInput = document.getElementById("learning-add-text");

function openLearningAddPanel() {
  learningAddPanel.hidden = false;
  learningAddTextInput.focus();
}

function closeLearningAddPanel() {
  learningAddPanel.hidden = true;
  learningAddForm.reset();
}

learningAddTriggerButton.addEventListener("click", openLearningAddPanel);
learningAddCloseButton.addEventListener("click", closeLearningAddPanel);
bindModalDismissal(learningAddPanel, closeLearningAddPanel);

learningAddForm.addEventListener("submit", function (event) {
  event.preventDefault();

  const text = learningAddTextInput.value.trim();
  if (!text || currentBookId === null) {
    return; // 空なら何もしない
  }

  addFavoriteLearning(currentBookId, text);
  closeLearningAddPanel();
  showToast("学んだことを追加しました");
  renderBookStats();
});

// 今、編集中の学んだことのキー（learningKey関数が返す文字列。編集していなければnull）
let editingLearningKey = null;

// 学んだこと1件を一意に表す文字列を作る（読書記録由来／直接追加のどちらにも対応する。quotes.jsのquoteKeyと同じ考え方。
// 読書記録由来はrecordIndex（配列内の順番）ではなくrecord.id（記録固有のid）で特定する。
// indexだと、編集フォームを開いたまま別の記録が削除されて後続のindexがズレたときに、
// 別の記録を編集中と誤認してしまう（保存すると別の記録を上書きしてしまう）ため）
function learningKey(learning) {
  return learning.source === "manual" ? "manual-" + learning.id : "record-" + learning.recordId;
}

// 今開いている本の「学んだこと」を、読書記録由来＋直接追加した分を合わせて、新しいものが先頭にくるように並べて返す
function getCombinedLearnings(book) {
  let learnings = [];

  book.records.forEach(function (record) {
    if (record.learning) {
      learnings.push({
        source: "record",
        recordId: record.id,
        date: record.date,
        timestamp: record.timestamp || 0,
        text: record.learning
      });
    }
  });

  loadFavoriteLearnings().forEach(function (learning) {
    if (learning.bookId !== book.id) {
      return;
    }
    learnings.push({
      source: "manual",
      id: learning.id,
      date: new Date(learning.createdAt).toLocaleDateString("ja-JP"),
      timestamp: learning.createdAt,
      text: learning.text
    });
  });

  learnings.sort(function (a, b) {
    return b.timestamp - a.timestamp;
  });

  return learnings;
}

// 「学んだこと」タブを、今開いている本の内容で描画し直す
function renderLearningList(book) {
  const learnings = getCombinedLearnings(book);
  learningList.innerHTML = "";

  learnings.forEach(function (learning) {
    learningList.appendChild(buildLearningCard(learning));
  });
}

// 保存直後などに、今開いている本の最新データを取り直すための共通ヘルパー
function findCurrentBook() {
  const books = loadBooks();
  return books.find(function (b) {
    return b.id === currentBookId;
  });
}

// 学んだこと1件ぶんのカードを組み立てる（すでにこの本のページを開いているため、
// 名言カードと違って押しても遷移はしない。編集中は入力フォームを表示する）
function buildLearningCard(learning) {
  const li = document.createElement("li");
  li.className = "quote-card quote-card-no-link";

  if (editingLearningKey === learningKey(learning)) {
    li.appendChild(buildLearningEditForm(learning));
    return li;
  }

  const bodyEl = document.createElement("p");
  bodyEl.className = "quote-card-body";
  bodyEl.textContent = learning.text;
  li.appendChild(bodyEl);

  const metaRow = document.createElement("div");
  metaRow.className = "quote-card-meta-row";

  const metaEl = document.createElement("span");
  metaEl.className = "quote-card-meta";
  metaEl.textContent = learning.date;
  metaRow.appendChild(metaEl);

  // 「編集」「削除」を並べて置くとスマホでは押しにくいため、本一覧のカードと同じ「⋮」メニューにまとめる（js/screens/modal.js）
  const menuActions = [
    {
      label: "編集",
      onClick: function () {
        editingLearningKey = learningKey(learning);
        renderLearningList(findCurrentBook());
      }
    }
  ];

  // 直接追加した学んだことだけ、削除できるようにする（読書記録由来のものは記録の編集から扱う）
  if (learning.source === "manual") {
    menuActions.push({
      label: "削除",
      danger: true,
      onClick: function () {
        const confirmed = confirm("この「学んだこと」を削除しますか？");
        if (!confirmed) {
          return;
        }
        deleteFavoriteLearning(learning.id);
        renderLearningList(findCurrentBook());
      }
    });
  }

  metaRow.appendChild(buildCardMenu(menuActions));
  li.appendChild(metaRow);

  return li;
}

// 学んだことを修正するフォームを組み立てる（quotes.jsのbuildQuoteEditFormと同じ考え方）
function buildLearningEditForm(learning) {
  const form = document.createElement("form");
  form.className = "quote-edit-form";

  const textarea = document.createElement("textarea");
  textarea.rows = 3;
  textarea.value = learning.text;
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
    editingLearningKey = null;
    renderLearningList(findCurrentBook());
  });
  buttonsRow.appendChild(cancelButton);

  form.appendChild(buttonsRow);

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    const newText = textarea.value.trim();
    if (!newText) {
      return; // 空にはできない
    }

    if (learning.source === "manual") {
      updateFavoriteLearning(learning.id, newText);
    } else {
      const books = loadBooks();
      const book = books.find(function (b) {
        return b.id === currentBookId;
      });
      const record = book && book.records.find(function (r) {
        return r.id === learning.recordId;
      });
      if (record) {
        record.learning = newText;
        saveBooks(books);
      }
    }

    editingLearningKey = null;
    renderLearningList(findCurrentBook());
  });

  textarea.focus();

  return form;
}

// 記録フォームが送信された（保存・更新ボタンが押された）ときの処理
recordForm.addEventListener("submit", function (event) {
  event.preventDefault();

  const books = loadBooks();
  const book = books.find(function (b) {
    return b.id === currentBookId;
  });
  if (!book) {
    return;
  }

  const isNewRecord = editingRecordIndex === null;
  const isNovel = book.category === "novel";

  // 新規記録のときだけ、「この記録を追加する前から、すでに読了状態だったか」を覚えておく
  let wasFinishedBeforeThisRecord = false;

  if (!isNewRecord) {
    // 既存の記録を更新する（読んだ時間はそのまま、ページとカテゴリ別の項目だけ直す）
    const record = book.records[editingRecordIndex];
    record.pages = Number(recordPagesInput.value) || 0;
    if (isNovel) {
      record.impression = recordImpressionInput.value.trim();
      record.memorableQuote = recordMemorableQuoteInput.value.trim();
      record.favoriteCharacter = recordFavoriteCharacterInput.value.trim();
      record.notes = recordNotesInput.value.trim();
    } else {
      record.learning = recordLearningInput.value.trim();
      record.quote = recordQuoteInput.value.trim();
    }
  } else {
    wasFinishedBeforeThisRecord = !!(book.pageCount && getComputedCurrentPage(book) >= book.pageCount);

    // 新しい記録を追加する
    const newRecord = {
      id: generateRecordId(), // js/models/booksModel.js（Supabaseのbook_records.idがuuid型のため）
      date: new Date().toLocaleDateString("ja-JP"),
      timestamp: Date.now(), // 他の本の記録と時系列で比べるための値（ダッシュボードの並び替えに使う）
      minutes: Math.floor(timerElapsedSecondsForRecord / 60), // 最後まで読んだ時間、または途中リセットまでの経過時間
      pages: Number(recordPagesInput.value) || 0
    };

    if (isNovel) {
      newRecord.impression = recordImpressionInput.value.trim();
      newRecord.memorableQuote = recordMemorableQuoteInput.value.trim();
      newRecord.favoriteCharacter = recordFavoriteCharacterInput.value.trim();
      newRecord.notes = recordNotesInput.value.trim();
    } else {
      newRecord.learning = recordLearningInput.value.trim();
      newRecord.quote = recordQuoteInput.value.trim();
    }

    book.records.push(newRecord);
  }

  saveBooks(books);

  hideRecordForm();
  renderBookStats();
  renderReadingProgress(); // 記録の合計ページ数が変わるので、進捗表示も更新する
  renderReadingRing(); // 今日の読書時間が変わるので、サイドバーのリングも更新する
  // 「名言・印象に残った言葉」欄に書いた内容は「好きな言葉／名言」タブに自動で集まる仕組みだが、
  // ここで更新しないと、その本の詳細画面を開き直すまでタブの中身が古いままになってしまう
  // （名言集など他の画面は開くたびに作り直されるため気づきにくいが、同じ本を開いたまま名言タブを見ると反映されていなかった）
  renderBookQuotesTab(book.id);

  // ページ数の合計が変わって読了状態が切り替わることがあるため、
  // 詳細画面ヘッダーのステータスバッジと「読了カードを見る」の表示もこの場で最新化する
  // （これまでは画面を開き直すまで「読書中」のまま表示が古くなっていた）
  const statusInfo = getBookStatusInfo(book);
  detailStatusBadge.textContent = statusInfo.label;
  detailStatusBadge.className = "status-badge detail-status-badge status-" + statusInfo.key;
  updateShareSectionVisibility(book);

  if (isNewRecord) {
    // 読み終えていて、まだレビューを書いていなければレビューを促す。
    // それ以外のときは、これまで通り実践の入力を促す（実践は実用書のみの機能）。
    const isFinished = book.pageCount && getComputedCurrentPage(book) >= book.pageCount;
    const justFinished = isFinished && !wasFinishedBeforeThisRecord;

    // 今回はじめて読み終えたときだけ、特別な演出のトーストにする
    showToast(justFinished ? "🎉 読了しました！お疲れさまでした" : "読書記録を保存しました");
    if (justFinished) {
      celebrateBookFinished();
    }

    if (isFinished && !getReviewForBook(book.id)) {
      if (justFinished) {
        // 読了の余韻を一呼吸おいてから感想を促す（進捗リングの演出を見届けてもらってから）
        setTimeout(function () {
          openReviewModal(book.id, { celebratory: true });
        }, 700);
      } else {
        openReviewModal(book.id);
      }
    } else if (!isNovel) {
      showActionForm();
    }
  } else {
    showToast("読書記録を保存しました");
  }
});
