// ---------- 本のデータ（Supabaseのbooks・book_recordsテーブルへの保存・読み込み） ----------
// 本棚（本そのもの：タイトル・著者・表紙・ページ数など）はbooksテーブルに、
// 読書記録（本ごとのrecords配列）はbook_recordsテーブルに、それぞれ保存する。
//
// loadBooks()・saveBooks()は、他の画面から見れば以前と同じ「同期的な関数」のまま使えるように、
// メモリ上のキャッシュ（cachedBooks。本の中にrecords配列も含めて丸ごと持つ）を介して
// Supabaseとやり取りする：
// ・loadBooks()は、キャッシュの複製を返す（呼び出し側が中身を直接書き換えても、
//   キャッシュ自体は変わらないようにするため。以前のlocalStorage版もJSON.parseのたびに
//   新しいオブジェクトを返していたので、その挙動に合わせている）
// ・saveBooks(books)は、渡された配列をキャッシュ（＝直前の状態）と見比べて、
//   本自体・本ごとのrecords配列それぞれについて、追加・変更・削除された分だけを
//   Supabaseへ反映する（結果を待たない「投げっぱなし」）

const LEGACY_BOOKS_KEY = "reading-app-books"; // 移行前の旧データ（ローカル。本と記録がひとつの配列に同居していた形）
const INTERIM_LOCAL_RECORDS_KEY = "reading-app-book-records"; // 本の移行後・記録の移行前に、一時的に記録だけを置いていたキー

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
// 本自体はbooksテーブルへ、本ごとのrecords配列はbook_recordsテーブルへ、
// それぞれ追加・変更・削除された分だけを反映する
function saveBooks(books) {
  const previousById = {};
  cachedBooks.forEach(function (book) {
    previousById[book.id] = book;
  });

  const nextIds = {};

  books.forEach(function (book) {
    nextIds[book.id] = true;

    const previous = previousById[book.id];
    if (!previous) {
      queueBookInsert(book);
      queueRecordsDiff(book.id, [], book.records || []);
    } else {
      if (bookCoreSnapshot(previous) !== bookCoreSnapshot(book)) {
        queueBookUpdate(book);
      }
      queueRecordsDiff(book.id, previous.records || [], book.records || []);
    }
  });

  Object.keys(previousById).forEach(function (id) {
    if (!nextIds[id]) {
      // 本自体を削除すると、book_records側もon delete cascadeで自動的に消えるため、
      // ここから記録ごとの削除を個別に呼ぶ必要はない
      queueBookDelete(previousById[id].id);
    }
  });

  cachedBooks = books;
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

// Supabaseのbooks行 → アプリ内で使う本の形（recordsは呼び出し側でbook_recordsから組み立てて渡す）
function bookRowToAppBook(row, records) {
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
    records: records || []
  });
}

// 新しい本のidを発行する（Supabaseのbooks.idがuuid型のため、ここでもUUIDを使う。
// 追加した直後から画面遷移などに使えるよう、サーバーへの保存を待たずに先に発行する）
function generateBookId() {
  return crypto.randomUUID();
}

// ---------- 読書記録（book_records）の変換・読み書き ----------

// タイムスタンプ（ミリ秒）から、Postgresのdate型に入れるための「YYYY-MM-DD」を、
// UTCへ変換せずローカルの暦日のまま作る（タイムゾーンによる日付のずれを防ぐ）
function timestampToIsoDateString(timestamp) {
  const d = new Date(timestamp);
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return d.getFullYear() + "-" + month + "-" + day;
}

// Postgresのdate型（「YYYY-MM-DD」文字列）を、これまでの表示形式（例：2026/8/30）に戻す。
// new Date("YYYY-MM-DD")はUTC扱いになりタイムゾーンによっては前日にずれるため、年月日を直接組み立てる
function isoDateStringToDisplayLabel(isoDateString) {
  const parts = isoDateString.split("-").map(Number);
  return new Date(parts[0], parts[1] - 1, parts[2]).toLocaleDateString("ja-JP");
}

// 新しい記録のidを発行する（book_records.idがuuid型のため）
function generateRecordId() {
  return crypto.randomUUID();
}

// 記録の内容を比べるためのスナップショット（idを除く。中身が同じならSupabaseへの更新を発生させない）
function recordSnapshot(record) {
  return JSON.stringify({
    pages: record.pages || 0,
    minutes: record.minutes || 0,
    date: record.date,
    timestamp: record.timestamp || 0,
    impression: record.impression || "",
    memorableQuote: record.memorableQuote || "",
    favoriteCharacter: record.favoriteCharacter || "",
    notes: record.notes || "",
    learning: record.learning || "",
    quote: record.quote || ""
  });
}

// アプリ内で使う記録の形 → Supabaseのbook_records行の形
function recordToSupabaseRow(bookId, record) {
  return {
    id: record.id,
    book_id: bookId,
    user_id: currentUserId, // js/services/cloudSync.js（ログイン中ユーザーのauth.uid()）
    recorded_date: timestampToIsoDateString(record.timestamp || Date.now()),
    recorded_at: new Date(record.timestamp || Date.now()).toISOString(),
    minutes: record.minutes || 0,
    pages: record.pages || 0,
    impression: record.impression || null,
    memorable_quote: record.memorableQuote || null,
    favorite_character: record.favoriteCharacter || null,
    notes: record.notes || null,
    learning: record.learning || null,
    quote: record.quote || null
  };
}

// Supabaseのbook_records行 → アプリ内で使う記録の形
function supabaseRowToRecord(row) {
  return {
    id: row.id,
    date: isoDateStringToDisplayLabel(row.recorded_date),
    timestamp: new Date(row.recorded_at).getTime(),
    minutes: row.minutes,
    pages: row.pages,
    impression: row.impression || "",
    memorableQuote: row.memorable_quote || "",
    favoriteCharacter: row.favorite_character || "",
    notes: row.notes || "",
    learning: row.learning || "",
    quote: row.quote || ""
  };
}

// js/services/cloudSync.jsの共通CRUD（ログイン確認・投げっぱなし送信・エラーログを1箇所にまとめたもの）
const bookRecordsCrud = createCloudCrud("book_records", "読書記録");

// 指定した本の記録を新規保存する
function queueRecordInsert(bookId, record) {
  bookRecordsCrud.insert(recordToSupabaseRow(bookId, record));
}

// 指定した記録の変更をSupabaseへ反映する
function queueRecordUpdate(bookId, record) {
  bookRecordsCrud.update(record.id, recordToSupabaseRow(bookId, record));
}

// 指定した記録をSupabaseから削除する
function queueRecordDelete(recordId) {
  bookRecordsCrud.remove(recordId);
}

// 指定した本の記録一覧について、直前の状態（previousRecords）と見比べて、
// 追加・変更・削除された記録だけをSupabaseのbook_recordsテーブルへ反映する
function queueRecordsDiff(bookId, previousRecords, newRecords) {
  const previousById = {};
  previousRecords.forEach(function (record) {
    previousById[record.id] = record;
  });

  const nextIds = {};
  newRecords.forEach(function (record) {
    nextIds[record.id] = true;

    const previous = previousById[record.id];
    if (!previous) {
      queueRecordInsert(bookId, record);
    } else if (recordSnapshot(previous) !== recordSnapshot(record)) {
      queueRecordUpdate(bookId, record);
    }
  });

  Object.keys(previousById).forEach(function (id) {
    if (!nextIds[id]) {
      queueRecordDelete(id);
    }
  });
}

// js/services/cloudSync.jsの共通CRUD（ログイン確認・投げっぱなし送信・エラーログを1箇所にまとめたもの）
const booksCrud = createCloudCrud("books", "本");

// 指定した本をSupabaseへ新規保存する
function queueBookInsert(book) {
  booksCrud.insert(bookToSupabaseRow(book), book.title);
}

// 指定した本の変更をSupabaseへ反映する
function queueBookUpdate(book) {
  booksCrud.update(book.id, bookToSupabaseRow(book), book.title);
}

// 指定した本をSupabaseから削除する
function queueBookDelete(bookId) {
  booksCrud.remove(bookId);
}

// ---------- 起動時の読み込み・旧データからの移行 ----------

// ログイン直後に1回だけ呼ぶ：Supabaseのbooks・book_recordsテーブルから本一覧を読み込んでキャッシュする。
// booksがまだ1件も無ければ（このアカウントで本棚機能を初めて使う）、ローカルに残っている
// 旧データ（reading-app-books。他の端末で使っていた分はapp_dataテーブルにあるかもしれないので、
// そちらも確認する）があればSupabaseへ移行する
async function initializeBooksFromCloud(userId) {
  const { data: bookRows, error: booksError } = await window.sb
    .from("books")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (booksError) {
    console.error("本棚の読み込みに失敗しました：", booksError);
    cachedBooks = [];
    return;
  }

  if (bookRows.length === 0) {
    const migrationSucceeded = await migrateLegacyBooksToCloud(userId);
    if (migrationSucceeded) {
      localStorage.removeItem(LEGACY_BOOKS_KEY);
      localStorage.removeItem(INTERIM_LOCAL_RECORDS_KEY);
    }
    // 失敗した分があれば、次回ログイン時にもう一度試せるよう旧データは消さずに残す
    return;
  }

  // 本の移行は済んでいるが、記録がまだ移行前の一時置き場に残っている場合はここで移す
  await migrateInterimLocalRecordsToCloud(userId);

  const { data: recordRows, error: recordsError } = await window.sb
    .from("book_records")
    .select("*")
    .eq("user_id", userId)
    .order("recorded_at", { ascending: true });

  if (recordsError) {
    console.error("読書記録の読み込みに失敗しました：", recordsError);
  }

  const recordsByBookId = {};
  (recordRows || []).forEach(function (row) {
    if (!recordsByBookId[row.book_id]) {
      recordsByBookId[row.book_id] = [];
    }
    recordsByBookId[row.book_id].push(supabaseRowToRecord(row));
  });

  cachedBooks = bookRows.map(function (row) {
    return bookRowToAppBook(row, recordsByBookId[row.id]);
  });

  localStorage.removeItem(LEGACY_BOOKS_KEY);
}

// 前回（本棚のSupabase移行時）に一時的にローカルへ置いていた読書記録（reading-app-book-records）を、
// book_recordsテーブルへ移す。何も残っていなければ何もしない
// 戻り値：すべての記録を移行できればtrue。1件でも失敗すればfalse
// （呼び出し元は、falseのときは旧データを消さずに残す＝次回ログイン時にもう一度試せるようにする）
async function migrateInterimLocalRecordsToCloud(userId) {
  const recordsByBookId = loadJSON(INTERIM_LOCAL_RECORDS_KEY, {});
  const bookIds = Object.keys(recordsByBookId);
  if (bookIds.length === 0) {
    return true;
  }

  let hasError = false;
  for (const bookId of bookIds) {
    const records = recordsByBookId[bookId] || [];
    for (const localRecord of records) {
      const record = Object.assign({}, localRecord);
      if (!record.id) {
        record.id = generateRecordId();
      }
      const { error } = await window.sb.from("book_records").insert(recordToSupabaseRow(bookId, record));
      if (error) {
        console.error("読書記録の移行に失敗しました：", bookId, error);
        hasError = true;
      }
    }
  }

  if (hasError) {
    return false;
  }

  localStorage.removeItem(INTERIM_LOCAL_RECORDS_KEY);

  // app_data側にも同じキーの行が残っており、消しておかないと次回ログイン時に
  // pullCloudDataOrMigrate（js/services/cloudSync.js）が無条件で復元してしまい、
  // 移行のたびに記録が重複してしまうため、クラウド側の行も削除しておく
  await window.sb.from("app_data").delete().eq("user_id", userId).eq("data_key", INTERIM_LOCAL_RECORDS_KEY);
  return true;
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

// 旧データ（reading-app-books。本と記録がひとつの配列に同居していた形）を、
// Supabaseのbooks・book_recordsテーブルへ移行する。
// 戻り値：すべての本・記録を移行できればtrue。1件でも失敗すればfalse
// （呼び出し元は、falseのときは旧データを消さずに残す＝次回ログイン時にもう一度試せるようにする）
async function migrateLegacyBooksToCloud(userId) {
  const legacyBooks = await findLegacyBooks(userId);
  if (legacyBooks.length === 0) {
    cachedBooks = [];
    return true;
  }

  const oldIdToNewId = {};
  legacyBooks.forEach(function (legacyBook) {
    oldIdToNewId[legacyBook.id] = generateBookId();
  });
  remapLegacyBookIdReferences(oldIdToNewId);

  const migratedBooks = [];
  let hasError = false;

  for (const legacyBook of legacyBooks) {
    const newId = oldIdToNewId[legacyBook.id];
    const records = (legacyBook.records || []).map(function (legacyRecord) {
      const record = Object.assign({}, legacyRecord);
      if (!record.id) {
        record.id = generateRecordId();
      }
      return record;
    });

    const migratedBook = normalizeBook({
      id: newId,
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
      records: records
    });

    migratedBooks.push(migratedBook);

    const { error: bookError } = await window.sb.from("books").insert(bookToSupabaseRow(migratedBook));
    if (bookError) {
      console.error("本の移行に失敗しました：", legacyBook.title, bookError);
      hasError = true;
      continue; // 本自体が保存できなければ、記録も紐づけようがないので次の本へ進む
    }

    for (const record of records) {
      const { error: recordError } = await window.sb.from("book_records").insert(recordToSupabaseRow(newId, record));
      if (recordError) {
        console.error("読書記録の移行に失敗しました：", legacyBook.title, recordError);
        hasError = true;
      }
    }
  }

  cachedBooks = migratedBooks;
  return !hasError;
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
