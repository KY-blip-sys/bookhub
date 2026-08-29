// ---------- 実践・実績のデータ（Supabaseのactionsテーブルへの保存・読み込み） ----------
// 実践（実践中のもの）と実績（完了して記録したもの）は、以前は別々のlocalStorageキー
//（reading-app-actions / reading-app-achievements）に分けて保存していたが、
// Supabase側は1つのactionsテーブルにまとめ、status（'not-started' | 'in-progress' | 'done' | 'cleared'）
// で区別する設計になっている。そのため、ここでもメモリ上のキャッシュ（cachedActions）に全件（実践＋実績）
// をまとめて持ち、loadActions()・loadAchievements()はそこからstatusで絞り込んで複製を返す。
//
// loadActions()・saveActions()・loadAchievements()・saveAchievements()は、
// 他の画面から見れば以前と同じ「同期的な関数」のまま使えるようにしている：
// ・loadXxx()は、キャッシュの複製を返す（呼び出し側が中身を直接書き換えても、
//   キャッシュ自体は変わらないようにするため）
// ・saveXxx(items)は、渡された一覧（実践側 or 実績側どちらか片方）をキャッシュへ書き戻し、
//   全体を直前の状態と見比べて、追加・変更・削除された分だけをSupabaseへ反映する
//  （結果を待たない「投げっぱなし」）

const LEGACY_ACTIONS_KEY = "reading-app-actions"; // 移行前の旧データ（ローカル。実践のみ）
const LEGACY_ACHIEVEMENTS_KEY = "reading-app-achievements"; // 移行前の旧データ（ローカル。実績のみ）

let cachedActions = [];

function cloneAction(action) {
  return JSON.parse(JSON.stringify(action));
}

// 実践（実績になっていないもの）の一覧を返す
function loadActions() {
  return cachedActions
    .filter(function (a) {
      return a.status !== "cleared";
    })
    .map(cloneAction);
}

// 実績（クリア済み＝status:"cleared"）の一覧を返す
function loadAchievements() {
  return cachedActions
    .filter(function (a) {
      return a.status === "cleared";
    })
    .map(cloneAction);
}

// 渡された「実践」一覧を保存する（実績側はキャッシュにある分をそのまま保つ）
function saveActions(actions) {
  const achievements = cachedActions.filter(function (a) {
    return a.status === "cleared";
  });
  persistActions(actions.concat(achievements));
}

// 渡された「実績」一覧を保存する（実践側はキャッシュにある分をそのまま保つ）
function saveAchievements(achievements) {
  const actions = cachedActions.filter(function (a) {
    return a.status !== "cleared";
  });
  persistActions(actions.concat(achievements));
}

// 全件（実践＋実績）を、直前の状態（cachedActions）と見比べて、
// 追加・変更・削除された分だけをSupabaseのactionsテーブルへ反映する
function persistActions(newActions) {
  const previousById = {};
  cachedActions.forEach(function (action) {
    previousById[action.id] = action;
  });

  const nextIds = {};
  newActions.forEach(function (action) {
    nextIds[action.id] = true;

    const previous = previousById[action.id];
    if (!previous) {
      queueActionInsert(action);
    } else if (actionSnapshot(previous) !== actionSnapshot(action)) {
      queueActionUpdate(action);
    }
  });

  Object.keys(previousById).forEach(function (id) {
    if (!nextIds[id]) {
      queueActionDelete(previousById[id].id);
    }
  });

  cachedActions = newActions;
}

// ---------- Supabaseとの変換・読み書き ----------

// 新しい実践のidを発行する（Supabaseのactions.idがuuid型のため）
function generateActionId() {
  return crypto.randomUUID();
}

// 中身を比べるためのスナップショット（idを除く。中身が同じならSupabaseへの更新を発生させない）
function actionSnapshot(action) {
  return JSON.stringify({
    bookId: action.bookId,
    content: action.content,
    purpose: action.purpose || "",
    startDate: action.startDate || "",
    dueDate: action.dueDate || "",
    status: action.status,
    todos: action.todos || [],
    reflection: action.reflection || null,
    clearedTimestamp: action.clearedTimestamp || 0
  });
}

// アプリ内で使う実践の形 → Supabaseのactions行の形
function actionToSupabaseRow(action) {
  return {
    id: action.id,
    user_id: currentUserId, // js/services/cloudSync.js（ログイン中ユーザーのauth.uid()）
    book_id: action.bookId || null,
    content: action.content,
    purpose: action.purpose || null,
    start_date: action.startDate || null,
    due_date: action.dueDate || null,
    status: action.status,
    todos: action.todos || [], // jsonb列（配列のまま渡せば自動的にJSONBとして保存される）
    reflection: action.reflection ? JSON.stringify(action.reflection) : null, // reflection列はtext型のため文字列化する
    cleared_at: action.clearedTimestamp ? new Date(action.clearedTimestamp).toISOString() : null
  };
}

// Supabaseのactions行 → アプリ内で使う実践の形
function supabaseRowToAction(row) {
  const action = {
    id: row.id,
    bookId: row.book_id,
    content: row.content,
    purpose: row.purpose || "",
    startDate: row.start_date || "",
    dueDate: row.due_date || "",
    status: row.status,
    todos: row.todos || [],
    reflection: row.reflection ? JSON.parse(row.reflection) : null
  };
  if (row.cleared_at) {
    action.clearedTimestamp = new Date(row.cleared_at).getTime();
    action.clearedDate = new Date(action.clearedTimestamp).toLocaleDateString("ja-JP");
  }
  return action;
}

// 指定した実践をSupabaseへ新規保存する（ログインしていなければ何もしない。結果を待たない「投げっぱなし」）
function queueActionInsert(action) {
  if (!currentUserId || !window.sb) {
    return;
  }
  window.sb
    .from("actions")
    .insert(actionToSupabaseRow(action))
    .then(function (result) {
      if (result.error) {
        console.error("実践の追加をクラウドへ保存できませんでした：", result.error);
      }
    });
}

// 指定した実践の変更をSupabaseへ反映する（ログインしていなければ何もしない。結果を待たない「投げっぱなし」）
function queueActionUpdate(action) {
  if (!currentUserId || !window.sb) {
    return;
  }
  window.sb
    .from("actions")
    .update(actionToSupabaseRow(action))
    .eq("id", action.id)
    .then(function (result) {
      if (result.error) {
        console.error("実践の更新をクラウドへ保存できませんでした：", result.error);
      }
    });
}

// 指定した実践をSupabaseから削除する（ログインしていなければ何もしない。結果を待たない「投げっぱなし」）
function queueActionDelete(actionId) {
  if (!currentUserId || !window.sb) {
    return;
  }
  window.sb
    .from("actions")
    .delete()
    .eq("id", actionId)
    .then(function (result) {
      if (result.error) {
        console.error("実践の削除をクラウドへ反映できませんでした：", actionId, result.error);
      }
    });
}

// ---------- 起動時の読み込み・旧データからの移行 ----------

// ログイン直後に1回だけ呼ぶ：Supabaseのactionsテーブルから実践・実績をまとめて読み込んでキャッシュする。
// まだ1件も無ければ（このアカウントでこの機能を初めて使う）、ローカルに残っている旧データ
//（reading-app-actions・reading-app-achievements。他の端末で使っていた分はapp_dataテーブルにある
// かもしれないので、そちらも確認する）があればSupabaseへ移行する
async function initializeActionsFromCloud(userId) {
  const { data: rows, error } = await window.sb
    .from("actions")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("実践・実績の読み込みに失敗しました：", error);
    cachedActions = [];
    return;
  }

  if (rows.length === 0) {
    await migrateLegacyActionsToCloud(userId);
  } else {
    cachedActions = rows.map(supabaseRowToAction);
  }

  localStorage.removeItem(LEGACY_ACTIONS_KEY);
  localStorage.removeItem(LEGACY_ACHIEVEMENTS_KEY);
}

// このブラウザのlocalStorage、無ければ以前の同期先だったapp_dataテーブルから、
// 指定したキーの旧形式データを探す
async function findLegacyActionItems(userId, key) {
  const localRaw = localStorage.getItem(key);
  if (localRaw) {
    try {
      return JSON.parse(localRaw);
    } catch (e) {
      // 壊れていれば、下のapp_data側の確認へ進む
    }
  }

  const { data, error } = await window.sb
    .from("app_data")
    .select("data_value")
    .eq("user_id", userId)
    .eq("data_key", key)
    .maybeSingle();

  if (error || !data) {
    return [];
  }
  return data.data_value || [];
}

// 旧データ（reading-app-actions・reading-app-achievements）をSupabaseのactionsテーブルへ移行する。
// 実績は物理的に別リストへ移すことで表現していたため、移行時にstatusを明示的に"cleared"にする
async function migrateLegacyActionsToCloud(userId) {
  const legacyActions = await findLegacyActionItems(userId, LEGACY_ACTIONS_KEY);
  const legacyAchievements = await findLegacyActionItems(userId, LEGACY_ACHIEVEMENTS_KEY);

  const migrated = [];

  legacyActions.forEach(function (legacy) {
    migrated.push({
      id: generateActionId(),
      bookId: legacy.bookId,
      content: legacy.content,
      purpose: legacy.purpose || "",
      startDate: legacy.startDate || "",
      dueDate: legacy.dueDate || "",
      status: legacy.status || "not-started",
      todos: legacy.todos || [],
      reflection: legacy.reflection || null
    });
  });

  legacyAchievements.forEach(function (legacy) {
    migrated.push({
      id: generateActionId(),
      bookId: legacy.bookId,
      content: legacy.content,
      purpose: legacy.purpose || "",
      startDate: legacy.startDate || "",
      dueDate: legacy.dueDate || "",
      status: "cleared",
      todos: legacy.todos || [],
      reflection: legacy.reflection || null,
      clearedTimestamp: legacy.clearedTimestamp || Date.now()
    });
  });

  if (migrated.length === 0) {
    cachedActions = [];
    return;
  }

  for (const action of migrated) {
    const { error } = await window.sb.from("actions").insert(actionToSupabaseRow(action));
    if (error) {
      console.error("実践の移行に失敗しました：", action.content, error);
    }
  }

  cachedActions = migrated;
}

// ---------- 実践の状態にまつわる、純粋な計算 ----------

// やることリストのチェック状況から、ステータスを自動的に決める
function computeStatusFromTodos(todos) {
  if (!todos || todos.length === 0) {
    return "not-started";
  }

  const doneCount = todos.filter(function (todo) {
    return todo.done;
  }).length;

  if (doneCount === 0) {
    return "not-started"; // まだ1つもチェックしていない
  }
  if (doneCount === todos.length) {
    return "done"; // 全部チェックした
  }
  return "in-progress"; // 一部だけチェックした
}

// 実践・実績（どちらもbookIdを持つ配列）から、指定したカテゴリの本に紐づくものだけを返す
function filterItemsByBookCategory(items, books, category) {
  return items.filter(function (item) {
    const book = books.find(function (b) {
      return b.id === item.bookId;
    });
    return book && book.category === category;
  });
}

// 今アクティブなカテゴリの本に紐づく実践だけを返す（ダッシュボードや実践リストで使う）
function getActionsByActiveCategory() {
  return filterItemsByBookCategory(loadActions(), loadBooks(), loadActiveCategory());
}

// 今アクティブなカテゴリの本に紐づく実績だけを返す
function getAchievementsByActiveCategory() {
  return filterItemsByBookCategory(loadAchievements(), loadBooks(), loadActiveCategory());
}
