// ---------- 学んだことのデータ（Supabaseのfavorite_learningsテーブルへの保存・読み込み） ----------
// 読書記録の「今日学んだこと」は本を読んでいる最中にしか書けないが、
// こちらは本の詳細画面の「学んだこと」タブからいつでも自由に追加できる、独立したコレクション
//（この考え方は変わらない）。favoriteQuotesModel.jsと同じ考え方・同じ形（id / bookId / text / createdAt）。
// 「学んだこと」は実用書だけの概念のため、bookIdは必須（本を選ばずに追加する入り口は無い）。
//
// loadFavoriteLearnings()・saveFavoriteLearnings()は、他の画面から見れば以前と同じ「同期的な関数」の
// まま使えるように、メモリ上のキャッシュ（cachedFavoriteLearnings）を介してSupabaseとやり取りする：
// ・loadFavoriteLearnings()は、キャッシュの複製を返す（呼び出し側が中身を直接書き換えても、
//   キャッシュ自体は変わらないようにするため）
// ・saveFavoriteLearnings(learnings)は、渡された配列をキャッシュ（＝直前の状態）と見比べて、
//   追加・変更・削除された分だけをSupabaseのfavorite_learningsテーブルへ反映する（結果を待たない「投げっぱなし」）

const LEGACY_FAVORITE_LEARNINGS_KEY = "reading-app-favorite-learnings"; // 移行前の旧データ（ローカル）

let cachedFavoriteLearnings = [];

function cloneFavoriteLearning(learning) {
  return JSON.parse(JSON.stringify(learning));
}

function loadFavoriteLearnings() {
  return cachedFavoriteLearnings.map(cloneFavoriteLearning);
}

function saveFavoriteLearnings(learnings) {
  const previousById = {};
  cachedFavoriteLearnings.forEach(function (learning) {
    previousById[learning.id] = learning;
  });

  const nextIds = {};
  learnings.forEach(function (learning) {
    nextIds[learning.id] = true;

    const previous = previousById[learning.id];
    if (!previous) {
      queueFavoriteLearningInsert(learning);
    } else if (favoriteLearningSnapshot(previous) !== favoriteLearningSnapshot(learning)) {
      queueFavoriteLearningUpdate(learning);
    }
  });

  Object.keys(previousById).forEach(function (id) {
    if (!nextIds[id]) {
      queueFavoriteLearningDelete(previousById[id].id);
    }
  });

  cachedFavoriteLearnings = learnings;
}

// 学んだことを1件追加する
function addFavoriteLearning(bookId, text) {
  const learnings = loadFavoriteLearnings();
  learnings.push({
    id: generateFavoriteLearningId(),
    bookId: bookId,
    text: text,
    createdAt: Date.now()
  });
  saveFavoriteLearnings(learnings);
}

// 学んだことの本文を更新する
function updateFavoriteLearning(learningId, text) {
  const learnings = loadFavoriteLearnings();
  const learning = learnings.find(function (l) {
    return l.id === learningId;
  });
  if (!learning) {
    return;
  }
  learning.text = text;
  saveFavoriteLearnings(learnings);
}

// 学んだことを削除する
function deleteFavoriteLearning(learningId) {
  const learnings = loadFavoriteLearnings();
  const remaining = learnings.filter(function (l) {
    return l.id !== learningId;
  });
  saveFavoriteLearnings(remaining);
}

// ---------- Supabaseとの変換・読み書き ----------

// 新しい学んだことのidを発行する（Supabaseのfavorite_learnings.idがuuid型のため）
function generateFavoriteLearningId() {
  return crypto.randomUUID();
}

// 中身を比べるためのスナップショット（idを除く。中身が同じならSupabaseへの更新を発生させない）
function favoriteLearningSnapshot(learning) {
  return JSON.stringify({
    bookId: learning.bookId,
    text: learning.text,
    createdAt: learning.createdAt || 0
  });
}

// アプリ内で使う学んだことの形 → Supabaseのfavorite_learnings行の形
function favoriteLearningToSupabaseRow(learning) {
  return {
    id: learning.id,
    user_id: currentUserId, // js/services/cloudSync.js（ログイン中ユーザーのauth.uid()）
    book_id: learning.bookId,
    text: learning.text,
    created_at: learning.createdAt ? new Date(learning.createdAt).toISOString() : new Date().toISOString()
  };
}

// Supabaseのfavorite_learnings行 → アプリ内で使う学んだことの形
function supabaseRowToFavoriteLearning(row) {
  return {
    id: row.id,
    bookId: row.book_id,
    text: row.text,
    createdAt: new Date(row.created_at).getTime()
  };
}

// js/services/cloudSync.jsの共通CRUD（ログイン確認・投げっぱなし送信・エラーログを1箇所にまとめたもの）
const favoriteLearningsCrud = createCloudCrud("favorite_learnings", "学んだこと");

// 指定した学んだことをSupabaseへ新規保存する
function queueFavoriteLearningInsert(learning) {
  favoriteLearningsCrud.insert(favoriteLearningToSupabaseRow(learning));
}

// 指定した学んだことの変更をSupabaseへ反映する
function queueFavoriteLearningUpdate(learning) {
  favoriteLearningsCrud.update(learning.id, favoriteLearningToSupabaseRow(learning));
}

// 指定した学んだことをSupabaseから削除する
function queueFavoriteLearningDelete(learningId) {
  favoriteLearningsCrud.remove(learningId);
}

// ---------- 起動時の読み込み・旧データからの移行 ----------

// ログイン直後に1回だけ呼ぶ：Supabaseのfavorite_learningsテーブルから一覧を読み込んでキャッシュする。
// まだ1件も無ければ（このアカウントでこの機能を初めて使う）、ローカルに残っている旧データ
//（reading-app-favorite-learnings。他の端末で使っていた分はapp_dataテーブルにあるかもしれないので、
// そちらも確認する）があればSupabaseへ移行する
async function initializeFavoriteLearningsFromCloud(userId) {
  const { data: rows, error } = await window.sb
    .from("favorite_learnings")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("学んだことの読み込みに失敗しました：", error);
    cachedFavoriteLearnings = [];
    return;
  }

  if (rows.length === 0) {
    const migrationSucceeded = await migrateLegacyFavoriteLearningsToCloud(userId);
    if (!migrationSucceeded) {
      // 失敗した分があれば、次回ログイン時にもう一度試せるよう旧データは消さずに残す
      return;
    }
  } else {
    cachedFavoriteLearnings = rows.map(supabaseRowToFavoriteLearning);
  }

  localStorage.removeItem(LEGACY_FAVORITE_LEARNINGS_KEY);
}

// このブラウザのlocalStorage、無ければ以前の同期先だったapp_dataテーブルから、
// 旧形式の学んだこと一覧（reading-app-favorite-learnings）を探す
async function findLegacyFavoriteLearnings(userId) {
  const localRaw = localStorage.getItem(LEGACY_FAVORITE_LEARNINGS_KEY);
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
    .eq("data_key", LEGACY_FAVORITE_LEARNINGS_KEY)
    .maybeSingle();

  if (error || !data) {
    return [];
  }
  return data.data_value || [];
}

// 旧データ（reading-app-favorite-learnings）をSupabaseのfavorite_learningsテーブルへ移行する。
// bookIdは、本棚のSupabase移行（js/models/booksModel.js）のときにすでに新しいidへ書き換え済みのため、
// ここではそのまま使える。
// 戻り値：すべて移行できればtrue。1件でも失敗すればfalse
// （呼び出し元は、falseのときは旧データを消さずに残す＝次回ログイン時にもう一度試せるようにする）
async function migrateLegacyFavoriteLearningsToCloud(userId) {
  const legacyLearnings = await findLegacyFavoriteLearnings(userId);
  if (legacyLearnings.length === 0) {
    cachedFavoriteLearnings = [];
    return true;
  }

  const migrated = legacyLearnings
    .filter(function (legacy) {
      return legacy.bookId !== null && legacy.bookId !== undefined; // book_idはnot nullのため、無ければ移行できない
    })
    .map(function (legacy) {
      return {
        id: generateFavoriteLearningId(),
        bookId: legacy.bookId,
        text: legacy.text,
        createdAt: legacy.createdAt || Date.now()
      };
    });

  let hasError = false;
  for (const learning of migrated) {
    const { error } = await window.sb.from("favorite_learnings").insert(favoriteLearningToSupabaseRow(learning));
    if (error) {
      console.error("学んだことの移行に失敗しました：", learning.text, error);
      hasError = true;
    }
  }

  cachedFavoriteLearnings = migrated;
  return !hasError;
}
