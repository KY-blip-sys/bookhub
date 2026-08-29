// ---------- 実践を作るときに、やることリスト（TODO）を一緒に入力する仕組み ----------
// フォームを開いている間だけメモリ上に持つ「下書き」のやることリスト。保存時に実践のtodosとして登録する。
// action-form（記録直後の入力）・action-add-form（あとから追加）の両方で使う、同じ形の仕組み。
function createTodoDraftController(listEl, inputEl, addButtonEl) {
  let drafts = [];

  function render() {
    listEl.innerHTML = "";
    drafts.forEach(function (text, index) {
      const li = document.createElement("li");

      const span = document.createElement("span");
      span.textContent = text;
      li.appendChild(span);

      const removeButton = document.createElement("button");
      removeButton.type = "button";
      removeButton.textContent = "×";
      removeButton.setAttribute("aria-label", "削除");
      removeButton.addEventListener("click", function () {
        drafts.splice(index, 1);
        render();
      });
      li.appendChild(removeButton);

      listEl.appendChild(li);
    });
  }

  function addFromInput() {
    const text = inputEl.value.trim();
    if (!text) {
      return;
    }
    drafts.push(text);
    inputEl.value = "";
    render();
    inputEl.focus();
  }

  addButtonEl.addEventListener("click", addFromInput);
  inputEl.addEventListener("keydown", function (event) {
    // isComposingがtrueのときは変換確定のEnterなので、ここでは無視する
    // （確定前の文字で追加してしまい、確定後の文字が次の入力に紛れ込むのを防ぐ）
    if (event.key === "Enter" && !event.isComposing) {
      event.preventDefault(); // フォーム全体の送信ではなく、やることの追加として扱う
      addFromInput();
    }
  });

  return {
    getTodos: function () {
      return drafts.map(function (text) {
        return { text: text, done: false };
      });
    },
    reset: function () {
      drafts = [];
      render();
    }
  };
}

// 実践フォーム関連の要素を取得しておく
const actionFormSection = document.getElementById("action-form-section");
const actionForm = document.getElementById("action-form");
const actionContentInput = document.getElementById("action-content");
const actionPurposeInput = document.getElementById("action-purpose");
const actionStartDateInput = document.getElementById("action-start-date");
const actionDueDateInput = document.getElementById("action-due-date");
const actionSkipButton = document.getElementById("action-skip-button");

const actionTodoDraft = createTodoDraftController(
  document.getElementById("action-todo-draft-list"),
  document.getElementById("action-todo-draft-input"),
  document.getElementById("action-todo-draft-add-button")
);

// 実践の入力フォームを表示する
function showActionForm() {
  // 前回開いたときの入力が残っていないよう、表示するたびに空の状態にしておく
  actionForm.reset();
  actionTodoDraft.reset();
  actionFormSection.hidden = false;
}

// 実践の入力フォームを隠して、中身を空に戻す
function hideActionForm() {
  actionFormSection.hidden = true;
  actionForm.reset();
  actionTodoDraft.reset();
}

// 「あとで」ボタン：今は入力せず閉じる
actionSkipButton.addEventListener("click", hideActionForm);

// 実践フォームが送信された（保存ボタンが押された）ときの処理
actionForm.addEventListener("submit", function (event) {
  event.preventDefault();

  const content = actionContentInput.value.trim();
  if (!content) {
    return; // 実践内容が空なら何もしない
  }

  const newAction = {
    id: Date.now(),
    bookId: currentBookId, // どの本から生まれた実践かを紐づける
    content: content,
    purpose: actionPurposeInput.value.trim(),
    startDate: actionStartDateInput.value,
    dueDate: actionDueDateInput.value,
    status: "not-started", // 未開始・実践中・完了のいずれか
    todos: actionTodoDraft.getTodos(), // やることリスト（{ text, done } の配列。作成時に一緒に登録できる）
    reflection: null // 振り返り（完了したときに入力する）
  };
  newAction.status = computeStatusFromTodos(newAction.todos);

  const actions = loadActions();
  actions.push(newAction);
  saveActions(actions);

  hideActionForm();
  showToast("実践を保存しました。「実践リスト」から確認できます");
});

// ---------- 実践リスト画面 ----------
// 実践の状態を計算する関数（computeStatusFromTodos）は js/models/actionsModel.js にある。

// ステータスの内部的な値と、画面に表示する日本語のラベルの対応表
const ACTION_STATUS_LABELS = {
  "not-started": "未開始",
  "in-progress": "実践中",
  "done": "完了"
};

// 今、振り返りフォームを開いている実践のid（開いていなければnull）
let reflectionFormActionId = null;

// 今、編集フォームを開いている実践のid（開いていなければnull）
let editingActionId = null;

// ---------- 「実践中」「実績」タブの切り替え（旧・実績ページをこのページ内に統合） ----------

const actionsTabButtons = document.querySelectorAll(".pill-tab[data-actions-tab]");
const actionsInProgressPanel = document.getElementById("actions-inprogress-panel");
const actionsAchievementsPanel = document.getElementById("actions-achievements-panel");

// 指定したタブ（"inProgress" | "achievements"）を表示し、その中身を最新の状態にする
function showActionsTab(tabName) {
  actionsTabButtons.forEach(function (button) {
    button.classList.toggle("active", button.dataset.actionsTab === tabName);
  });
  actionsInProgressPanel.hidden = tabName !== "inProgress";
  actionsAchievementsPanel.hidden = tabName !== "achievements";

  if (tabName === "inProgress") {
    renderActionList();
  } else {
    renderAchievementList();
  }
}

actionsTabButtons.forEach(function (button) {
  button.addEventListener("click", function () {
    showActionsTab(button.dataset.actionsTab);
  });
});

// 実践リスト画面関連の要素を取得しておく
const actionList = document.getElementById("action-list");
const actionListEmptyMessage = document.getElementById("action-list-empty-message");

// 実践を直接追加するフォーム関連の要素を取得しておく
const actionAddForm = document.getElementById("action-add-form");
const actionAddPanel = document.getElementById("action-add-panel");
const actionAddTriggerButton = document.getElementById("action-add-trigger-button");
const actionAddCloseButton = document.getElementById("action-add-close-button");
const actionAddBookSelect = document.getElementById("action-add-book-select");
const actionAddContentInput = document.getElementById("action-add-content");
const actionAddPurposeInput = document.getElementById("action-add-purpose");
const actionAddStartDateInput = document.getElementById("action-add-start-date");
const actionAddDueDateInput = document.getElementById("action-add-due-date");

const actionAddTodoDraft = createTodoDraftController(
  document.getElementById("action-add-todo-draft-list"),
  document.getElementById("action-add-todo-draft-input"),
  document.getElementById("action-add-todo-draft-add-button")
);

// 「実践を追加」モーダルを、ふわっと浮かび上がる形で開閉する
function openActionAddPanel() {
  // 前回開いたときの入力が残っていないよう、表示するたびに空の状態にしておく
  actionAddForm.reset();
  actionAddTodoDraft.reset();
  actionAddPanel.hidden = false;
  actionAddContentInput.focus();
}

function closeActionAddPanel() {
  actionAddPanel.hidden = true;
  actionAddForm.reset();
  actionAddTodoDraft.reset();
}

actionAddTriggerButton.addEventListener("click", openActionAddPanel);
actionAddCloseButton.addEventListener("click", closeActionAddPanel);

bindModalDismissal(actionAddPanel, closeActionAddPanel);

// 「実践を追加」フォームの本の選択肢を、今登録されている実用書で作り直す
function updateActionAddBookOptions() {
  const selectedValue = actionAddBookSelect.value;
  const books = getBooksByCategory("practical");

  actionAddBookSelect.innerHTML = "";

  const placeholderOption = document.createElement("option");
  placeholderOption.value = "";
  placeholderOption.textContent = "本を選ぶ";
  actionAddBookSelect.appendChild(placeholderOption);

  books.forEach(function (book) {
    const option = document.createElement("option");
    option.value = String(book.id);
    option.textContent = book.title;
    actionAddBookSelect.appendChild(option);
  });

  actionAddBookSelect.value = selectedValue; // 作り直したあとも、選んでいた本があれば復元する
}

// 「実践を追加」フォームが送信されたら、新しい実践を追加する
actionAddForm.addEventListener("submit", function (event) {
  event.preventDefault();

  const bookId = actionAddBookSelect.value;
  const content = actionAddContentInput.value.trim();
  if (!bookId || !content) {
    return; // 本と実践内容は必須
  }

  const newAction = {
    id: Date.now(),
    bookId: bookId,
    content: content,
    purpose: actionAddPurposeInput.value.trim(),
    startDate: actionAddStartDateInput.value,
    dueDate: actionAddDueDateInput.value,
    status: "not-started",
    todos: actionAddTodoDraft.getTodos(), // やることリスト（作成時に一緒に登録できる）
    reflection: null
  };
  newAction.status = computeStatusFromTodos(newAction.todos);

  const actions = loadActions();
  actions.push(newAction);
  saveActions(actions);

  closeActionAddPanel(); // フォームのリセット・下書きTODOのリセットも行う
  showToast("実践を追加しました");
  renderActionList();
});

// 実践リストを、本ごとにグループ分けして画面に表示する（アクティブなカテゴリの本だけを対象にする）
function renderActionList() {
  updateActionAddBookOptions();

  const actions = getActionsByActiveCategory();
  const books = loadBooks();
  actionList.innerHTML = "";
  actionListEmptyMessage.hidden = actions.length > 0;

  // 本のid（bookId）ごとに、実践をまとめる
  const groupedByBookId = {};
  actions.forEach(function (action) {
    if (!groupedByBookId[action.bookId]) {
      groupedByBookId[action.bookId] = [];
    }
    groupedByBookId[action.bookId].push(action);
  });

  Object.keys(groupedByBookId).forEach(function (bookIdKey) {
    const bookId = bookIdKey;
    const book = books.find(function (b) {
      return b.id === bookId;
    });

    // 本1冊ぶんの「ブロック」を作る
    const groupBlock = document.createElement("li");
    groupBlock.className = "action-group";

    const titleEl = document.createElement("p");
    titleEl.className = "action-group-title";
    titleEl.textContent = book ? book.title : "（削除された本）";
    groupBlock.appendChild(titleEl);

    // ブロックの中に、その本から生まれた実践を並べる
    const itemsList = document.createElement("ul");
    itemsList.className = "action-group-items";

    groupedByBookId[bookIdKey].forEach(function (action) {
      itemsList.appendChild(buildActionBlock(action));
    });

    groupBlock.appendChild(itemsList);
    actionList.appendChild(groupBlock);
  });

  // 本の詳細画面を開いていれば、その本の「実践リスト」タブも最新の状態にしておく
  if (currentBookId !== null) {
    renderBookActionsTab(currentBookId);
  }
}

// ---------- 本の詳細画面「実践リスト」タブ：この本に紐づく実践だけを表示する ----------

const detailActionsList = document.getElementById("detail-actions-list");
const detailActionsEmpty = document.getElementById("detail-actions-empty");

function renderBookActionsTab(bookId) {
  const bookActions = loadActions().filter(function (action) {
    return action.bookId === bookId;
  });

  detailActionsList.innerHTML = "";
  detailActionsEmpty.hidden = bookActions.length > 0;

  bookActions.forEach(function (action) {
    detailActionsList.appendChild(buildActionBlock(action));
  });
}

// 「＋ 実践を追加」ボタン：今開いている本を選んだ状態で、実践リスト画面と同じ追加モーダルを開く
const detailActionAddTriggerButton = document.getElementById("detail-action-add-trigger-button");

detailActionAddTriggerButton.addEventListener("click", function () {
  openActionAddPanel();
  updateActionAddBookOptions();
  actionAddBookSelect.value = String(currentBookId);
});

// 実践の「ブロック」（要約カード）を組み立てる。押すと詳細モーダルが浮かび上がる
function buildActionBlock(action) {
  const li = document.createElement("li");
  li.className = "action-block";
  li.addEventListener("click", function () {
    openActionDetail(action.id);
  });

  const contentEl = document.createElement("p");
  contentEl.className = "action-content";
  contentEl.textContent = action.content;
  li.appendChild(contentEl);

  if (action.purpose) {
    const purposeEl = document.createElement("p");
    purposeEl.className = "action-meta";
    purposeEl.textContent = "目的：" + action.purpose;
    li.appendChild(purposeEl);
  }

  if (action.dueDate) {
    const dueDateEl = document.createElement("p");
    dueDateEl.className = "action-meta";
    dueDateEl.textContent = "期限：" + action.dueDate;
    li.appendChild(dueDateEl);
  }

  const statusEl = document.createElement("p");
  statusEl.className = "action-meta action-status";
  statusEl.textContent = "ステータス：" + ACTION_STATUS_LABELS[action.status];
  li.appendChild(statusEl);

  li.appendChild(buildActionProgressBar(action));

  const hintEl = document.createElement("p");
  hintEl.className = "action-block-hint";
  hintEl.textContent = "タップしてTODOを管理";
  li.appendChild(hintEl);

  return li;
}

// やることリスト（TODO）のチェック状況から、進捗バーを組み立てる
function buildActionProgressBar(action) {
  const todos = action.todos || [];
  const doneCount = todos.filter(function (todo) {
    return todo.done;
  }).length;
  const percent = todos.length > 0 ? Math.round((doneCount / todos.length) * 100) : 0;

  const progressWrapper = document.createElement("div");
  progressWrapper.className = "action-progress";

  const progressBarTrack = document.createElement("div");
  progressBarTrack.className = "action-progress-track";

  const progressBarFill = document.createElement("div");
  progressBarFill.className = "action-progress-fill";
  progressBarFill.style.width = percent + "%";
  progressBarTrack.appendChild(progressBarFill);
  progressWrapper.appendChild(progressBarTrack);

  const progressValue = document.createElement("span");
  progressValue.className = "action-progress-value";
  progressValue.textContent = percent + "%";
  progressWrapper.appendChild(progressValue);

  return progressWrapper;
}

// やることリスト本体（チェックボックス付き）を組み立てる
function buildTodoChecklist(action) {
  const todos = action.todos || [];
  const todoListEl = document.createElement("ul");
  todoListEl.className = "todo-list";

  todos.forEach(function (todo, todoIndex) {
    const todoItem = document.createElement("li");

    // チェックボックスと文字を label で囲むと、文字をクリックしてもチェックできる
    const todoLabel = document.createElement("label");
    todoLabel.className = "todo-label";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = todo.done;
    checkbox.addEventListener("change", function () {
      toggleTodoDone(action.id, todoIndex, checkbox.checked);
    });
    todoLabel.appendChild(checkbox);

    const todoText = document.createElement("span");
    todoText.textContent = todo.text;
    if (todo.done) {
      todoText.classList.add("todo-done");
    }
    todoLabel.appendChild(todoText);

    todoItem.appendChild(todoLabel);

    const deleteTodoButton = document.createElement("button");
    deleteTodoButton.type = "button";
    deleteTodoButton.textContent = "削除";
    deleteTodoButton.classList.add("danger-button");
    deleteTodoButton.addEventListener("click", function () {
      deleteTodo(action.id, todoIndex);
    });
    todoItem.appendChild(deleteTodoButton);

    todoListEl.appendChild(todoItem);
  });

  return todoListEl;
}

// やることを追加するフォームを組み立てる
function buildAddTodoForm(action) {
  const addTodoForm = document.createElement("form");
  addTodoForm.className = "add-todo-form";

  const addTodoInput = document.createElement("input");
  addTodoInput.type = "text";
  addTodoInput.placeholder = "やることを追加";

  const addTodoButton = document.createElement("button");
  addTodoButton.type = "submit";
  addTodoButton.textContent = "追加";

  addTodoForm.appendChild(addTodoInput);
  addTodoForm.appendChild(addTodoButton);

  addTodoForm.addEventListener("submit", function (event) {
    event.preventDefault();
    const text = addTodoInput.value.trim();
    if (!text) {
      return;
    }
    addTodoInput.value = "";
    addTodo(action.id, text);
  });

  return addTodoForm;
}

// 実践の内容・目的・開始日・期限を編集するフォームを組み立てる
function buildActionEditForm(action) {
  const form = document.createElement("form");
  form.className = "action-edit-form";

  const contentInput = document.createElement("input");
  contentInput.type = "text";
  contentInput.placeholder = "実践内容";
  contentInput.value = action.content;
  contentInput.required = true;
  form.appendChild(contentInput);

  const purposeInput = document.createElement("input");
  purposeInput.type = "text";
  purposeInput.placeholder = "目的";
  purposeInput.value = action.purpose || "";
  form.appendChild(purposeInput);

  const startDateLabel = document.createElement("label");
  startDateLabel.textContent = "開始日";
  const startDateInput = document.createElement("input");
  startDateInput.type = "text";
  startDateInput.readOnly = true;
  startDateInput.placeholder = "年-月-日";
  startDateInput.className = "scroll-date-input";
  startDateInput.value = action.startDate || "";
  startDateLabel.appendChild(startDateInput);
  form.appendChild(startDateLabel);
  bindScrollDateInput(startDateInput);

  const dueDateLabel = document.createElement("label");
  dueDateLabel.textContent = "期限";
  const dueDateInput = document.createElement("input");
  dueDateInput.type = "text";
  dueDateInput.readOnly = true;
  dueDateInput.placeholder = "年-月-日";
  dueDateInput.className = "scroll-date-input";
  dueDateInput.value = action.dueDate || "";
  dueDateLabel.appendChild(dueDateInput);
  form.appendChild(dueDateLabel);
  bindScrollDateInput(dueDateInput);

  const formButtons = document.createElement("div");
  formButtons.className = "action-form-buttons";

  const saveButton = document.createElement("button");
  saveButton.type = "submit";
  saveButton.textContent = "保存";
  formButtons.appendChild(saveButton);

  const cancelButton = document.createElement("button");
  cancelButton.type = "button";
  cancelButton.textContent = "キャンセル";
  cancelButton.addEventListener("click", function () {
    editingActionId = null;
    renderActionDetailModal();
  });
  formButtons.appendChild(cancelButton);

  form.appendChild(formButtons);

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    const content = contentInput.value.trim();
    if (!content) {
      return; // 実践内容が空なら何もしない
    }

    saveActionEdit(action.id, {
      content: content,
      purpose: purposeInput.value.trim(),
      startDate: startDateInput.value,
      dueDate: dueDateInput.value
    });
  });

  return form;
}

// 指定した実践を、確認のうえ実践リストから削除する
function deleteAction(actionId) {
  const confirmed = confirm("この実践を削除しますか？削除すると元に戻せません。");
  if (!confirmed) {
    return;
  }

  const actions = loadActions();
  const remainingActions = actions.filter(function (a) {
    return a.id !== actionId;
  });
  saveActions(remainingActions);

  if (openActionDetailId === actionId) {
    closeActionDetailModal();
  }
  renderActionList();
}

// 実践の編集内容を保存する
function saveActionEdit(actionId, updates) {
  const actions = loadActions();
  const action = actions.find(function (a) {
    return a.id === actionId;
  });
  if (!action) {
    return;
  }

  action.content = updates.content;
  action.purpose = updates.purpose;
  action.startDate = updates.startDate;
  action.dueDate = updates.dueDate;
  saveActions(actions);

  editingActionId = null;
  refreshActionsView();
}

// 「実績にする」ボタンを組み立てる
function buildClearButton(action) {
  const wrapper = document.createElement("div");
  wrapper.className = "action-clear-wrapper";

  const clearButton = document.createElement("button");
  clearButton.type = "button";
  clearButton.className = "clear-action-button";
  clearButton.textContent = "実績にする";
  clearButton.addEventListener("click", function () {
    clearAction(action.id);
  });
  wrapper.appendChild(clearButton);

  return wrapper;
}

// 完了した実践を、確認のうえ実践リストから実績へ移動する
function clearAction(actionId) {
  const confirmed = confirm("この実践を実績として記録しますか？実践リストから削除されます。");
  if (!confirmed) {
    return;
  }

  const actions = loadActions();
  const actionIndex = actions.findIndex(function (a) {
    return a.id === actionId;
  });
  if (actionIndex === -1) {
    return;
  }

  const [clearedAction] = actions.splice(actionIndex, 1);
  saveActions(actions);

  clearedAction.clearedDate = new Date().toLocaleDateString("ja-JP");
  clearedAction.clearedTimestamp = Date.now();

  const achievements = loadAchievements();
  achievements.push(clearedAction);
  saveAchievements(achievements);

  if (openActionDetailId === actionId) {
    closeActionDetailModal();
  }
  showToast("実績に登録しました。「実績」タブから確認できます");
  renderActionList();
}

// ---------- 実践の詳細モーダル：ブロックを押すと浮かび上がり、TODO・内容・振り返りをまとめて管理できる ----------

const actionDetailModal = document.getElementById("action-detail-modal");
const actionDetailTitle = document.getElementById("action-detail-title");
const actionDetailBody = document.getElementById("action-detail-body");
const actionDetailCloseButton = document.getElementById("action-detail-close-button");

// 今、詳細モーダルで開いている実践のid（開いていなければnull）
let openActionDetailId = null;

// 指定した実践の詳細モーダルを開く
function openActionDetail(actionId) {
  openActionDetailId = actionId;
  editingActionId = null;
  reflectionFormActionId = null; // 前に開いていた振り返りフォームの状態を持ち越さない
  renderActionDetailModal();
}

function closeActionDetailModal() {
  actionDetailModal.hidden = true;
  openActionDetailId = null;
  editingActionId = null;
}

actionDetailCloseButton.addEventListener("click", closeActionDetailModal);

bindModalDismissal(actionDetailModal, closeActionDetailModal);

// 詳細モーダルの中身を、今の実践のデータで描画し直す
function renderActionDetailModal() {
  const actions = loadActions();
  const action = actions.find(function (a) {
    return a.id === openActionDetailId;
  });
  if (!action) {
    closeActionDetailModal();
    return;
  }

  const books = loadBooks();
  const book = books.find(function (b) {
    return b.id === action.bookId;
  });

  actionDetailTitle.textContent = book ? book.title : "（削除された本）";
  actionDetailBody.innerHTML = "";

  if (editingActionId === action.id) {
    // 編集中は、内容・目的・開始日・期限の入力フォームだけを表示する
    actionDetailBody.appendChild(buildActionEditForm(action));
    actionDetailModal.hidden = false;
    return;
  }

  const contentEl = document.createElement("p");
  contentEl.className = "action-content";
  contentEl.textContent = action.content;
  actionDetailBody.appendChild(contentEl);

  if (action.purpose) {
    const purposeEl = document.createElement("p");
    purposeEl.className = "action-meta";
    purposeEl.textContent = "目的：" + action.purpose;
    actionDetailBody.appendChild(purposeEl);
  }

  if (action.dueDate) {
    const dueDateEl = document.createElement("p");
    dueDateEl.className = "action-meta";
    dueDateEl.textContent = "期限：" + action.dueDate;
    actionDetailBody.appendChild(dueDateEl);
  }

  const statusEl = document.createElement("p");
  statusEl.className = "action-meta action-status";
  statusEl.textContent = "ステータス：" + ACTION_STATUS_LABELS[action.status];
  actionDetailBody.appendChild(statusEl);

  actionDetailBody.appendChild(buildActionProgressBar(action));

  const buttonRow = document.createElement("div");
  buttonRow.className = "action-form-buttons";

  const editButton = document.createElement("button");
  editButton.type = "button";
  editButton.textContent = "編集";
  editButton.addEventListener("click", function () {
    editingActionId = action.id;
    renderActionDetailModal();
  });
  buttonRow.appendChild(editButton);

  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.textContent = "削除";
  deleteButton.classList.add("danger-button");
  deleteButton.addEventListener("click", function () {
    deleteAction(action.id);
  });
  buttonRow.appendChild(deleteButton);

  actionDetailBody.appendChild(buttonRow);

  const todoHeading = document.createElement("h4");
  todoHeading.textContent = "やることリスト";
  actionDetailBody.appendChild(todoHeading);

  actionDetailBody.appendChild(buildTodoChecklist(action));
  actionDetailBody.appendChild(buildAddTodoForm(action));

  // 完了した実践だけ、振り返りの表示・入力欄と「実績にする」ボタンを出す
  if (action.status === "done") {
    actionDetailBody.appendChild(buildReflectionSection(action));
    actionDetailBody.appendChild(buildClearButton(action));
  }

  actionDetailModal.hidden = false;
}

// 実践のブロック一覧と、開いていれば詳細モーダルの両方を、今のデータで最新の状態にする
function refreshActionsView() {
  renderActionList();
  if (openActionDetailId !== null) {
    renderActionDetailModal();
  }
}

// ---------- 実績画面 ----------

const achievementList = document.getElementById("achievement-list");

// 実績（クリアした実践）を、新しい順に並べて画面に表示する（アクティブなカテゴリの本だけを対象にする）
function renderAchievementList() {
  const achievements = getAchievementsByActiveCategory();
  const books = loadBooks();
  achievementList.innerHTML = "";

  if (achievements.length === 0) {
    const emptyMessage = document.createElement("li");
    emptyMessage.className = "record-list-empty";
    emptyMessage.textContent = "まだ実績がありません。実践リストで完了した実践を「実績にする」と、ここに表示されます。";
    achievementList.appendChild(emptyMessage);
    return;
  }

  const sortedAchievements = achievements.slice().sort(function (a, b) {
    return (b.clearedTimestamp || 0) - (a.clearedTimestamp || 0);
  });

  sortedAchievements.forEach(function (achievement) {
    achievementList.appendChild(buildAchievementCard(achievement, books));
  });
}

// 実績1件ぶんのボックス（本のタイトル・内容・実績日の要点だけを表示し、押すと詳細を見られる）
function buildAchievementCard(achievement, books) {
  const li = document.createElement("li");
  li.className = "achievement-card";
  li.addEventListener("click", function () {
    openAchievementDetail(achievement.id);
  });

  const book = books.find(function (b) {
    return b.id === achievement.bookId;
  });

  const bookTitleEl = document.createElement("p");
  bookTitleEl.className = "achievement-book-title";
  bookTitleEl.textContent = book ? book.title : "（削除された本）";
  li.appendChild(bookTitleEl);

  const contentEl = document.createElement("p");
  contentEl.className = "action-content";
  contentEl.textContent = achievement.content;
  li.appendChild(contentEl);

  const clearedDateEl = document.createElement("p");
  clearedDateEl.className = "action-meta";
  clearedDateEl.textContent = "実績日：" + achievement.clearedDate;
  li.appendChild(clearedDateEl);

  if (achievement.reflection) {
    const ratingEl = document.createElement("p");
    ratingEl.className = "achievement-card-rating";
    ratingEl.textContent =
      "★".repeat(achievement.reflection.rating) + "☆".repeat(5 - achievement.reflection.rating);
    li.appendChild(ratingEl);
  }

  const hintEl = document.createElement("p");
  hintEl.className = "achievement-card-hint";
  hintEl.textContent = "押すと詳しく見られます";
  li.appendChild(hintEl);

  return li;
}

// ---------- 実績の詳細モーダル（あとから内容・振り返りを編集できる） ----------

const achievementDetailModal = document.getElementById("achievement-detail-modal");
const achievementDetailTitle = document.getElementById("achievement-detail-title");
const achievementDetailBody = document.getElementById("achievement-detail-body");
const achievementDetailCloseButton = document.getElementById("achievement-detail-close-button");

// 今、詳細モーダルで開いている実績のid（開いていなければnull）
let openAchievementId = null;

// 今、詳細モーダルを編集フォームで開いているかどうか
let editingAchievementId = null;

// 指定した実績の詳細モーダルを開く
function openAchievementDetail(achievementId) {
  openAchievementId = achievementId;
  editingAchievementId = null;
  renderAchievementDetailModal();
}

function closeAchievementDetail() {
  achievementDetailModal.hidden = true;
  openAchievementId = null;
  editingAchievementId = null;
}

// 実績の詳細（目的・実績日・振り返り）を、今のデータでモーダルに描画し直す
function renderAchievementDetailModal() {
  const achievements = loadAchievements();
  const achievement = achievements.find(function (a) {
    return a.id === openAchievementId;
  });
  if (!achievement) {
    closeAchievementDetail();
    return;
  }

  const books = loadBooks();
  const book = books.find(function (b) {
    return b.id === achievement.bookId;
  });

  achievementDetailTitle.textContent = achievement.content;
  achievementDetailBody.innerHTML = "";

  if (editingAchievementId === achievement.id) {
    achievementDetailBody.appendChild(buildAchievementEditForm(achievement));
    achievementDetailModal.hidden = false;
    return;
  }

  const bookTitleEl = document.createElement("p");
  bookTitleEl.className = "achievement-book-title";
  bookTitleEl.textContent = book ? book.title : "（削除された本）";
  achievementDetailBody.appendChild(bookTitleEl);

  if (achievement.purpose) {
    const purposeEl = document.createElement("p");
    purposeEl.className = "action-meta";
    purposeEl.textContent = "目的：" + achievement.purpose;
    achievementDetailBody.appendChild(purposeEl);
  }

  const clearedDateEl = document.createElement("p");
  clearedDateEl.className = "action-meta";
  clearedDateEl.textContent = "実績日：" + achievement.clearedDate;
  achievementDetailBody.appendChild(clearedDateEl);

  if (achievement.reflection) {
    const reflection = achievement.reflection;

    const achievedEl = document.createElement("p");
    achievedEl.className = "action-meta";
    achievedEl.textContent = "実践できたこと：" + reflection.achieved;
    achievementDetailBody.appendChild(achievedEl);

    const notWellEl = document.createElement("p");
    notWellEl.className = "action-meta";
    notWellEl.textContent = "うまくいかなかったこと：" + reflection.notWell;
    achievementDetailBody.appendChild(notWellEl);

    const improveEl = document.createElement("p");
    improveEl.className = "action-meta";
    improveEl.textContent = "次回改善したいこと：" + reflection.improve;
    achievementDetailBody.appendChild(improveEl);

    const ratingEl = document.createElement("p");
    ratingEl.className = "action-meta";
    ratingEl.textContent =
      "評価：" + "★".repeat(reflection.rating) + "☆".repeat(5 - reflection.rating);
    achievementDetailBody.appendChild(ratingEl);
  } else {
    const noReflectionEl = document.createElement("p");
    noReflectionEl.className = "action-meta";
    noReflectionEl.textContent = "振り返りは記録されていません。";
    achievementDetailBody.appendChild(noReflectionEl);
  }

  const editButton = document.createElement("button");
  editButton.type = "button";
  editButton.textContent = "編集";
  editButton.addEventListener("click", function () {
    editingAchievementId = achievement.id;
    renderAchievementDetailModal();
  });
  achievementDetailBody.appendChild(editButton);

  achievementDetailModal.hidden = false;
}

// 実績の内容・目的・振り返りをまとめて編集するフォームを組み立てる
function buildAchievementEditForm(achievement) {
  const form = document.createElement("form");
  form.className = "action-edit-form";

  const contentInput = document.createElement("input");
  contentInput.type = "text";
  contentInput.placeholder = "実践内容";
  contentInput.value = achievement.content;
  contentInput.required = true;
  form.appendChild(contentInput);

  const purposeInput = document.createElement("input");
  purposeInput.type = "text";
  purposeInput.placeholder = "目的";
  purposeInput.value = achievement.purpose || "";
  form.appendChild(purposeInput);

  const reflectionHeading = document.createElement("h4");
  reflectionHeading.textContent = "振り返り";
  form.appendChild(reflectionHeading);

  const existingReflection = achievement.reflection;

  const achievedLabel = document.createElement("label");
  achievedLabel.textContent = "実践できたこと";
  const achievedInput = document.createElement("textarea");
  achievedInput.rows = 2;
  achievedInput.value = existingReflection ? existingReflection.achieved : "";
  achievedLabel.appendChild(achievedInput);
  form.appendChild(achievedLabel);

  const notWellLabel = document.createElement("label");
  notWellLabel.textContent = "うまくいかなかったこと";
  const notWellInput = document.createElement("textarea");
  notWellInput.rows = 2;
  notWellInput.value = existingReflection ? existingReflection.notWell : "";
  notWellLabel.appendChild(notWellInput);
  form.appendChild(notWellLabel);

  const improveLabel = document.createElement("label");
  improveLabel.textContent = "次回改善したいこと";
  const improveInput = document.createElement("textarea");
  improveInput.rows = 2;
  improveInput.value = existingReflection ? existingReflection.improve : "";
  improveLabel.appendChild(improveInput);
  form.appendChild(improveLabel);

  const ratingLabel = document.createElement("label");
  ratingLabel.textContent = "評価";
  form.appendChild(ratingLabel);

  // 星を5つ並べたボタン群（共通部品はjs/screens/starPicker.js）
  const starPicker = document.createElement("div");
  starPicker.className = "star-picker";
  form.appendChild(starPicker);

  let selectedRating = existingReflection ? existingReflection.rating : 3;
  // 星をクリックして評価を選んだかどうか（文章を書いていなくても、星を選んでいれば振り返りを保存する）
  let ratingSelected = false;
  buildStarPicker(starPicker, selectedRating, function (rating) {
    selectedRating = rating;
    ratingSelected = true;
  });

  const formButtons = document.createElement("div");
  formButtons.className = "action-form-buttons";

  const saveButton = document.createElement("button");
  saveButton.type = "submit";
  saveButton.textContent = "保存";
  formButtons.appendChild(saveButton);

  const cancelButton = document.createElement("button");
  cancelButton.type = "button";
  cancelButton.textContent = "キャンセル";
  cancelButton.addEventListener("click", function () {
    editingAchievementId = null;
    renderAchievementDetailModal();
  });
  formButtons.appendChild(cancelButton);

  form.appendChild(formButtons);

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    const content = contentInput.value.trim();
    if (!content) {
      return; // 実践内容が空なら何もしない
    }

    const achievedText = achievedInput.value.trim();
    const notWellText = notWellInput.value.trim();
    const improveText = improveInput.value.trim();
    const hasReflectionInput = achievedText || notWellText || improveText || ratingSelected;

    saveAchievementEdit(achievement.id, {
      content: content,
      purpose: purposeInput.value.trim(),
      // 振り返りを何も書いていない場合は、既存のまま（無ければ「記録されていません」表示のまま）にする
      reflection: hasReflectionInput || existingReflection
        ? { achieved: achievedText, notWell: notWellText, improve: improveText, rating: selectedRating }
        : null
    });
  });

  return form;
}

// 実績の編集内容を保存する
function saveAchievementEdit(achievementId, updates) {
  const achievements = loadAchievements();
  const achievement = achievements.find(function (a) {
    return a.id === achievementId;
  });
  if (!achievement) {
    return;
  }

  achievement.content = updates.content;
  achievement.purpose = updates.purpose;
  achievement.reflection = updates.reflection;
  saveAchievements(achievements);

  editingAchievementId = null;
  renderAchievementList();
  renderAchievementDetailModal();
}

achievementDetailCloseButton.addEventListener("click", closeAchievementDetail);

bindModalDismissal(achievementDetailModal, closeAchievementDetail);

// 完了した実践1件ぶんの「振り返り」欄（表示 or 入力フォーム）を組み立てる
function buildReflectionSection(action) {
  const section = document.createElement("div");
  section.className = "reflection-section";

  const isEditing = reflectionFormActionId === action.id;

  if (action.reflection && !isEditing) {
    // すでに振り返り済みなら、内容をそのまま表示する（編集ボタンつき）
    const heading = document.createElement("h4");
    heading.textContent = "振り返り";
    section.appendChild(heading);

    const achievedEl = document.createElement("p");
    achievedEl.className = "action-meta";
    achievedEl.textContent = "実践できたこと：" + action.reflection.achieved;
    section.appendChild(achievedEl);

    const notWellEl = document.createElement("p");
    notWellEl.className = "action-meta";
    notWellEl.textContent = "うまくいかなかったこと：" + action.reflection.notWell;
    section.appendChild(notWellEl);

    const improveEl = document.createElement("p");
    improveEl.className = "action-meta";
    improveEl.textContent = "次回改善したいこと：" + action.reflection.improve;
    section.appendChild(improveEl);

    const ratingEl = document.createElement("p");
    ratingEl.className = "action-meta";
    ratingEl.textContent =
      "評価：" + "★".repeat(action.reflection.rating) + "☆".repeat(5 - action.reflection.rating);
    section.appendChild(ratingEl);

    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.textContent = "編集";
    editButton.addEventListener("click", function () {
      reflectionFormActionId = action.id;
      refreshActionsView();
    });
    section.appendChild(editButton);

    return section;
  }

  if (!action.reflection && !isEditing) {
    // まだ書いていなければ、フォームを開くボタンだけ表示する
    const openButton = document.createElement("button");
    openButton.type = "button";
    openButton.textContent = "振り返りを書く";
    openButton.addEventListener("click", function () {
      reflectionFormActionId = action.id;
      refreshActionsView();
    });
    section.appendChild(openButton);
    return section;
  }

  // 振り返りフォームを組み立てる（新規入力・編集のどちらもここを通る）
  const existingReflection = action.reflection; // 編集のときは、既存の内容がここに入っている

  const heading = document.createElement("h4");
  heading.textContent = existingReflection ? "振り返りを編集" : "振り返りを入力";
  section.appendChild(heading);

  const form = document.createElement("form");
  form.className = "reflection-form";

  const achievedLabel = document.createElement("label");
  achievedLabel.textContent = "実践できたこと";
  const achievedInput = document.createElement("textarea");
  achievedInput.rows = 2;
  achievedInput.value = existingReflection ? existingReflection.achieved : "";
  achievedLabel.appendChild(achievedInput);
  form.appendChild(achievedLabel);

  const notWellLabel = document.createElement("label");
  notWellLabel.textContent = "うまくいかなかったこと";
  const notWellInput = document.createElement("textarea");
  notWellInput.rows = 2;
  notWellInput.value = existingReflection ? existingReflection.notWell : "";
  notWellLabel.appendChild(notWellInput);
  form.appendChild(notWellLabel);

  const improveLabel = document.createElement("label");
  improveLabel.textContent = "次回改善したいこと";
  const improveInput = document.createElement("textarea");
  improveInput.rows = 2;
  improveInput.value = existingReflection ? existingReflection.improve : "";
  improveLabel.appendChild(improveInput);
  form.appendChild(improveLabel);

  const ratingLabel = document.createElement("label");
  ratingLabel.textContent = "今回の評価";
  form.appendChild(ratingLabel);

  // 星を5つ並べたボタン群（共通部品はjs/screens/starPicker.js）
  const starPicker = document.createElement("div");
  starPicker.className = "star-picker";
  form.appendChild(starPicker);

  // 編集なら元の評価から、新規なら1から始める
  let selectedRating = existingReflection ? existingReflection.rating : 1;
  buildStarPicker(starPicker, selectedRating, function (rating) {
    selectedRating = rating;
  });

  const formButtons = document.createElement("div");
  formButtons.className = "action-form-buttons";

  const saveButton = document.createElement("button");
  saveButton.type = "submit";
  saveButton.textContent = existingReflection ? "更新する" : "振り返りを保存";
  formButtons.appendChild(saveButton);

  const cancelButton = document.createElement("button");
  cancelButton.type = "button";
  cancelButton.textContent = "キャンセル";
  cancelButton.addEventListener("click", function () {
    reflectionFormActionId = null;
    refreshActionsView();
  });
  formButtons.appendChild(cancelButton);

  form.appendChild(formButtons);

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    saveReflection(action.id, {
      achieved: achievedInput.value.trim(),
      notWell: notWellInput.value.trim(),
      improve: improveInput.value.trim(),
      rating: selectedRating
    });
  });

  section.appendChild(form);
  return section;
}

// 振り返りを保存する
function saveReflection(actionId, reflection) {
  const actions = loadActions();
  const action = actions.find(function (a) {
    return a.id === actionId;
  });
  if (!action) {
    return;
  }

  action.reflection = reflection;
  saveActions(actions);

  reflectionFormActionId = null;
  refreshActionsView();
}

// 指定した実践に、新しいやることを追加する
function addTodo(actionId, text) {
  const actions = loadActions();
  const action = actions.find(function (a) {
    return a.id === actionId;
  });
  if (!action) {
    return;
  }

  if (!action.todos) {
    action.todos = [];
  }
  action.todos.push({ text: text, done: false });
  action.status = computeStatusFromTodos(action.todos); // ステータスも自動で見直す
  saveActions(actions);
  refreshActionsView(); // 追加後、一覧を作り直して進捗（%）にも反映する
}

// やることのチェック状態を切り替える
function toggleTodoDone(actionId, todoIndex, done) {
  const actions = loadActions();
  const action = actions.find(function (a) {
    return a.id === actionId;
  });
  if (!action) {
    return;
  }

  action.todos[todoIndex].done = done;
  action.status = computeStatusFromTodos(action.todos); // ステータスも自動で見直す
  saveActions(actions);
  refreshActionsView(); // チェック後、一覧を作り直して進捗（%）にも反映する
}

// やることを削除する
function deleteTodo(actionId, todoIndex) {
  const actions = loadActions();
  const action = actions.find(function (a) {
    return a.id === actionId;
  });
  if (!action) {
    return;
  }

  action.todos.splice(todoIndex, 1);
  action.status = computeStatusFromTodos(action.todos); // ステータスも自動で見直す
  saveActions(actions);
  refreshActionsView();
}
