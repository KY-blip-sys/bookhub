// ---------- 本のデータ（localStorageへの保存・読み込み） ----------

const BOOKS_KEY = "reading-app-books";

// 保存されている本の形が古い場合に、今の形へ補う
// （例：カテゴリが無い本は、これまで通り「実用書」として扱う）
function normalizeBook(book) {
  if (!book.category) {
    book.category = "practical";
  }
  return book;
}

// 本の一覧をlocalStorageから読み込む（カテゴリを問わず、すべての本を返す）
function loadBooks() {
  const books = loadJSON(BOOKS_KEY, []);
  return books.map(normalizeBook);
}

// 本の一覧をlocalStorageに保存する
function saveBooks(books) {
  saveJSON(BOOKS_KEY, books);
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
