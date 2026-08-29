// ---------- 本のデータ（Supabaseのbooksテーブルへの保存・読み込み） ----------
// 本棚（本そのもの：タイトル・著者・表紙・ページ数など）は、Supabaseのbooksテーブルに保存する。
// 読書記録（本ごとのrecords配列）はbook_recordsテーブルへの移行がまだのため、
// これまで通りlocalStorage（ただしreading-app-booksとは別のキー）に保存し、
// 本の中身と組み合わせて、これまでと同じ形（book.records）で扱えるようにしている。
//
// loadBooks()・saveBooks()は、他の画面から見れば以前と同じ「同期的な関数」のまま使えるように、
// メモリ上のキャッシュ（cachedBooks）を介してSupabaseとやり取りする：
// ・loadBooks()は、キャッシュの複製を返す（呼び出し側が中身を直接書き換えても、
//   キャッシュ自体は変わらないようにするため。以前のlocalStorage版もJSON.parseのたびに
//   新しいオブジェクトを返していたので、その挙動に合わせている）
// ・saveBooks(books)は、渡された配列をキャッシュ（＝直前の状態）と見比べて、
//   追加・変更・削除された本だけをSupabaseへ反映する（結果を待たない「投げっぱなし」）

const LEGACY_BOOKS_KEY = "reading-app-books"; // 移行前の旧データ（ローカル）
const BOOK_RECORDS_KEY = "reading-app-book-records"; // 本ごとの読書記録（{ [bookId]: record[] }）

let cachedBooks = [];

// 保存されている本の形が古い場合に、今の形へ補う
// （例：カテゴリが無い本は、これまで通り「実用書」として扱う）
function normalizeBook(book) {
  if (!book.category) {
    book.category = "practical";
  }
  return book;
}

// 本の一覧をメモリ上のキャッシュから読み込む（カテゴリを問わず、すべての本を返す）
// 呼び出し側が中身を書き換えてもキャッシュに影響しないよう、複製を返す
function loadBooks() {
  return cachedBooks.map(function (book) {
    return normalizeBook(JSON.parse(JSON.stringify(book)));
  });
}

// 本の一覧を保存する：直前の状態（cachedBooks）と見比べて、
// 追加・変更・削除された本だけをSupabaseのbooksテーブルへ反映する
function saveBooks(books) {
  const previousById = {};
  cachedBooks.forEach(function (book) {
    previousById[book.id] = book;
  });

  const recordsMap = loadAllBookRecordsMap();
  const nextIds = {};

  books.forEach(function (book) {
    nextIds[book.id] = true;
    recordsMap[book.id] = book.records || [];

    const previous = previousById[book.id];
    if (!previous) {
      queueBookInsert(book);
    } else if (bookCoreSnapshot(previous) !== bookCoreSnapshot(book)) {
      queueBookUpdate(book);
    }
  });

  Object.keys(previousById).forEach(function (id) {
    if (!nextIds[id]) {
      queueBookDelete(previousById[id].id);
      delete recordsMap[id];
    }
  });

  saveAllBookRecordsMap(recordsMap);
  cachedBooks = books;
}

// ---------- 本ごとの読書記録（book_recordsテーブルへの移行がまだのため、ローカルに保存） ----------

function loadAllBookRecordsMap() {
  return loadJSON(BOOK_RECORDS_KEY, {});
}

function saveAllBookRecordsMap(map) {
  saveJSON(BOOK_RECORDS_KEY, map);
}

function loadRecordsForBook(bookId) {
  return loadAllBookRecordsMap()[bookId] || [];
}

// ---------- Supabaseとの変換・読み書き ----------

// records・pageAdjustmentの補正など、記録以外の「本そのもの」の項目だけを比べるためのスナップショット
// （recordsが変わっただけではSupabaseへの更新を発生させないようにする）
function bookCoreSnapshot(book) {
  return JSON.stringify({
    category: book.category,
    title: book.title,
    author: book.author || "",
    coverImage: book.coverImage || null,
    pageCount: book.pageCount || null,
    pageAdjustment: book.pageAdjustment || 0,
    publisher: book.publisher || "",
    publishedDate: book.publishedDate || "",
    isbn: book.isbn || "",
    wantToRead: !!book.wantToRead
  });
}

// アプリ内で使う本の形 → Supabaseのbooks行の形
function bookToSupabaseRow(book) {
  return {
    id: book.id,
    user_id: currentUserId, // js/services/cloudSync.js（ログイン中ユーザーのauth.uid()）
    category: book.category,
    title: book.title,
    author: book.author || null,
    cover_image_url: book.coverImage || null,
    page_count: book.pageCount || null,
    page_adjustment: book.pageAdjustment || 0,
    publisher: book.publisher || null,
    published_date: book.publishedDate || null,
    isbn: book.isbn || null,
    want_to_read: !!book.wantToRead
  };
}

// Supabaseのbooks行 → アプリ内で使う本の形（記録はローカルの記録ストアから組み立てる）
function bookRowToAppBook(row) {
  return normalizeBook({
    id: row.id,
    category: row.category,
    title: row.title,
    author: row.author || "",
    coverImage: row.cover_image_url || null,
    pageCount: row.page_count,
    pageAdjustment: row.page_adjustment || 0,
    publisher: row.publisher || "",
    publishedDate: row.published_date || "",
    isbn: row.isbn || "",
    wantToRead: !!row.want_to_read,
    createdAt: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
    records: loadRecordsForBook(row.id)
  });
}

// 新しい本のidを発行する（Supabaseのbooks.idがuuid型のため、ここでもUUIDを使う。
// 追加した直後から画面遷移などに使えるよう、サーバーへの保存を待たずに先に発行する）
function generateBookId() {
  return crypto.randomUUID();
}

// 指定した本をSupabaseへ新規保存する（ログインしていなければ何もしない。結果を待たない「投げっぱなし」）
function queueBookInsert(book) {
  if (!currentUserId || !window.sb) {
    return;
  }
  window.sb
    .from("books")
    .insert(bookToSupabaseRow(book))
    .then(function (result) {
      if (result.error) {
        console.error("本の追加をクラウドへ保存できませんでした：", book.title, result.error);
      }
    });
}

// 指定した本の変更をSupabaseへ反映する（ログインしていなければ何もしない。結果を待たない「投げっぱなし」）
function queueBookUpdate(book) {
  if (!currentUserId || !window.sb) {
    return;
  }
  window.sb
    .from("books")
    .update(bookToSupabaseRow(book))
    .eq("id", book.id)
    .then(function (result) {
      if (result.error) {
        console.error("本の更新をクラウドへ保存できませんでした：", book.title, result.error);
      }
    });
}

// 指定した本をSupabaseから削除する（ログインしていなければ何もしない。結果を待たない「投げっぱなし」）
function queueBookDelete(bookId) {
  if (!currentUserId || !window.sb) {
    return;
  }
  window.sb
    .from("books")
    .delete()
    .eq("id", bookId)
    .then(function (result) {
      if (result.error) {
        console.error("本の削除をクラウドへ反映できませんでした：", bookId, result.error);
      }
    });
}

// ---------- 起動時の読み込み・旧データからの移行 ----------

// ログイン直後に1回だけ呼ぶ：Supabaseのbooksテーブルから本一覧を読み込んでキャッシュする。
// まだ1件も無ければ（このアカウントで本棚機能を初めて使う）、ローカルに残っている
// 旧データ（reading-app-books。他の端末で使っていた分はapp_dataテーブルにあるかもしれないので、
// そちらも確認する）があればSupabaseへ移行する
async function initializeBooksFromCloud(userId) {
  const { data: rows, error } = await window.sb
    .from("books")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("本棚の読み込みに失敗しました：", error);
    cachedBooks = [];
    return;
  }

  if (rows.length === 0) {
    await migrateLegacyBooksToCloud(userId);
  } else {
    cachedBooks = rows.map(bookRowToAppBook);
  }

  // 移行後・通常の読み込み後、いずれの場合も旧データはもう使わないので消しておく
  localStorage.removeItem(LEGACY_BOOKS_KEY);
}

// このブラウザのlocalStorage、無ければ以前の同期先だったapp_dataテーブルから、
// 旧形式の本一覧（reading-app-books）を探す
async function findLegacyBooks(userId) {
  const localRaw = localStorage.getItem(LEGACY_BOOKS_KEY);
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
    .eq("data_key", LEGACY_BOOKS_KEY)
    .maybeSingle();

  if (error || !data) {
    return [];
  }
  return data.data_value || [];
}

// 実践・実績・レビュー・好きな言葉・学んだこと、それぞれに保存されているbookIdを、
// 移行で新しく発行したidに合わせて書き換える（本の移行前後で紐づけが外れないようにするため）
function remapLegacyBookIdReferences(oldIdToNewId) {
  ["reading-app-actions", "reading-app-achievements", "reading-app-reviews",
    "reading-app-favorite-quotes", "reading-app-favorite-learnings"].forEach(function (key) {
    const items = loadJSON(key, []);
    let changed = false;
    items.forEach(function (item) {
      if (item.bookId !== undefined && item.bookId !== null && Object.prototype.hasOwnProperty.call(oldIdToNewId, item.bookId)) {
        item.bookId = oldIdToNewId[item.bookId];
        changed = true;
      }
    });
    if (changed) {
      saveJSON(key, items);
    }
  });
}

// 旧データ（reading-app-books）をSupabaseのbooksテーブルへ移行する
async function migrateLegacyBooksToCloud(userId) {
  const legacyBooks = await findLegacyBooks(userId);
  if (legacyBooks.length === 0) {
    cachedBooks = [];
    return;
  }

  const oldIdToNewId = {};
  legacyBooks.forEach(function (legacyBook) {
    oldIdToNewId[legacyBook.id] = generateBookId();
  });
  remapLegacyBookIdReferences(oldIdToNewId);

  const recordsMap = loadAllBookRecordsMap();
  const migratedBooks = [];

  for (const legacyBook of legacyBooks) {
    const migratedBook = normalizeBook({
      id: oldIdToNewId[legacyBook.id],
      category: legacyBook.category,
      title: legacyBook.title,
      author: legacyBook.author || "",
      coverImage: legacyBook.coverImage || null,
      pageCount: legacyBook.pageCount || null,
      pageAdjustment: legacyBook.pageAdjustment || 0,
      publisher: legacyBook.publisher || "",
      publishedDate: legacyBook.publishedDate || "",
      isbn: legacyBook.isbn || "",
      wantToRead: !!legacyBook.wantToRead,
      createdAt: Date.now(),
      records: legacyBook.records || []
    });

    recordsMap[migratedBook.id] = migratedBook.records;
    migratedBooks.push(migratedBook);

    const { error } = await window.sb.from("books").insert(bookToSupabaseRow(migratedBook));
    if (error) {
      console.error("本の移行に失敗しました：", legacyBook.title, error);
    }
  }

  saveAllBookRecordsMap(recordsMap);
  cachedBooks = migratedBooks;
}

// 指定したカテゴリ（"practical" | "novel"）の本だけを返す
// 一覧・ダッシュボード・記録・統計など、複数の本をまとめて表示する画面で使う
function getBooksByCategory(category) {
  return loadBooks().filter(function (book) {
    return book.category === category;
  });
}

// 今日読んだ時間の合計（分）を、カテゴリを問わずすべての本の記録から集計する
// （サイドバーの読書時間リングで使う。record.dateと同じ形式で今日の日付を比べる）
function getTodayTotalMinutes() {
  const todayLabel = new Date().toLocaleDateString("ja-JP");
  return loadBooks().reduce(function (sum, book) {
    return sum + book.records.reduce(function (recordSum, record) {
      return recordSum + (record.date === todayLabel ? record.minutes : 0);
    }, 0);
  }, 0);
}

// 何日連続で読書記録を付けられているか（連続読書日数）を返す。
// カテゴリを問わず、すべての本の記録日（record.date）を対象にする。
// 今日はまだ記録していなくても、昨日までの連続記録が続いていれば「継続中」として数える
// （日付が変わった瞬間に0へ戻ってしまうと、その日読む前に達成感が失われてしまうため）。
function getReadingStreakDays() {
  const recordedDateLabels = new Set();
  loadBooks().forEach(function (book) {
    book.records.forEach(function (record) {
      if (record.date) {
        recordedDateLabels.add(record.date);
      }
    });
  });

  if (recordedDateLabels.size === 0) {
    return 0;
  }

  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  if (!recordedDateLabels.has(cursor.toLocaleDateString("ja-JP"))) {
    cursor.setDate(cursor.getDate() - 1); // 今日の分がまだ無ければ、昨日から遡って数える
  }

  let streakDays = 0;
  while (recordedDateLabels.has(cursor.toLocaleDateString("ja-JP"))) {
    streakDays += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streakDays;
}

// 渡された本の記録をすべて合計した読書時間（分）を返す（「記録」ページの集計で使う）
function getTotalMinutes(books) {
  return books.reduce(function (sum, book) {
    return sum + book.records.reduce(function (recordSum, record) {
      return recordSum + record.minutes;
    }, 0);
  }, 0);
}

// 指定したタイムスタンプが「今週」（月曜始まり〜次の月曜の直前まで）に含まれるかどうかを判定する
// （ダッシュボードの「今週の記録」集計で使う。timestampが無い古い記録は今週分には含めない）
function isInCurrentWeek(timestamp) {
  if (!timestamp) {
    return false;
  }

  const now = new Date();
  const startOfWeek = new Date(now);
  const day = startOfWeek.getDay(); // 0(日)〜6(土)
  const diffToMonday = day === 0 ? 6 : day - 1;
  startOfWeek.setDate(startOfWeek.getDate() - diffToMonday);
  startOfWeek.setHours(0, 0, 0, 0);

  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(endOfWeek.getDate() + 7);

  const date = new Date(timestamp);
  return date >= startOfWeek && date < endOfWeek;
}

// ---------- 本の記録・進捗にまつわる、純粋な計算 ----------

// この本の読書記録に記入された「今日読んだページ」を、すべて合計する
function getRecordPagesSum(book) {
  return book.records.reduce(function (sum, record) {
    return sum + (record.pages || 0);
  }, 0);
}

// 記録の合計ページ数と、実際の現在ページとのズレ（手動での補正分）を求める
function getPageAdjustment(book) {
  if (typeof book.pageAdjustment === "number") {
    return book.pageAdjustment;
  }
  // pageAdjustmentがまだない本（古いデータ）は、これまでのcurrentPageと
  // 記録の合計との差分を、補正値として初回だけ引き継ぐ
  return (book.currentPage || 0) - getRecordPagesSum(book);
}

// 記録の合計ページ数に、手動での補正を足した「現在のページ」を求める（0〜総ページ数に収める）
function getComputedCurrentPage(book) {
  const rawCurrentPage = getRecordPagesSum(book) + getPageAdjustment(book);
  return Math.max(0, Math.min(rawCurrentPage, book.pageCount));
}

// 現在のページ÷総ページ数の進捗率（%）を求める。総ページ数が未登録の本は0%として扱う。
// 本棚カード・「今読んでいる本」カード・詳細画面の進捗リングなど、進捗を表示する場所ならどこでも使う。
function getBookProgressPercent(book) {
  if (!book.pageCount) {
    return 0;
  }
  return Math.min(100, Math.round((getComputedCurrentPage(book) / book.pageCount) * 100));
}

// この本の読書ステータス（読みたい・読書中・読了）を判定する。
// 「読了」は既存のページ数ロジックをそのまま利用し、挙動は変えない。
// 「読みたい」は追加時に選べる任意フラグで、記録が1件でも付けば自動的に外れる（読書中になる）。
function getBookStatusInfo(book) {
  const isFinished = book.pageCount && getComputedCurrentPage(book) >= book.pageCount;
  if (isFinished) {
    return { key: "done", label: "読了" };
  }
  if (book.wantToRead && book.records.length === 0) {
    return { key: "want", label: "読みたい" };
  }
  return { key: "reading", label: "読書中" };
}
