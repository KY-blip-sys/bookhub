// ---------- 学んだこと（本の詳細画面「感想」タブの一部） ----------
// 読んでいる間に気づいたこと・学んだことを、いつでも自由に追加できる（実用書・小説の区別はない）。

const learningList = document.getElementById("learning-list");

// 今、編集中の「学んだこと」のキー（learningKey関数が返す文字列。編集していなければnull）
let editingLearningKey = null;

// 今開いている本の「学んだこと」一覧を、画面に表示する
function renderBookLearnings(bookId) {
  const books = loadBooks();
  const book = books.find(function (b) {
    return b.id === bookId;
  });
  if (!book) {
    return;
  }

  learningList.innerHTML = "";
  renderLearningList(book);
}

// ---------- 学んだこと：追加パネル ----------

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
  renderBookLearnings(currentBookId);
});

// 学んだこと1件を一意に表す文字列を作る（quotes.jsのquoteKeyと同じ考え方）
function learningKey(learning) {
  return "manual-" + learning.id;
}

// 保存直後などに、今開いている本の最新データを取り直すための共通ヘルパー
function findCurrentBook() {
  const books = loadBooks();
  return books.find(function (b) {
    return b.id === currentBookId;
  });
}

// 「学んだこと」一覧を、今開いている本の内容で描画し直す
function renderLearningList(book) {
  const learnings = loadFavoriteLearnings()
    .filter(function (learning) {
      return learning.bookId === book.id;
    })
    .sort(function (a, b) {
      return b.createdAt - a.createdAt;
    });

  learningList.innerHTML = "";
  learnings.forEach(function (learning) {
    learningList.appendChild(buildLearningCard(learning));
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
  metaEl.textContent = new Date(learning.createdAt).toLocaleDateString("ja-JP");
  metaRow.appendChild(metaEl);

  // 「編集」「削除」を並べて置くとスマホでは押しにくいため、本一覧のカードと同じ「⋮」メニューにまとめる（js/screens/modal.js）
  metaRow.appendChild(buildCardMenu([
    {
      label: "編集",
      onClick: function () {
        editingLearningKey = learningKey(learning);
        renderLearningList(findCurrentBook());
      }
    },
    {
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
    }
  ]));
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

    updateFavoriteLearning(learning.id, newText);
    editingLearningKey = null;
    renderLearningList(findCurrentBook());
  });

  textarea.focus();

  return form;
}
