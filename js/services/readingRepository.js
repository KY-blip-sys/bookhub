// ---------- ReadingRepository ----------
// 本・読書記録のデータ（booksModel.jsに保存されている生データ）から、
// AI読書コーチが使いやすい形（1冊ぶんの読書データ）を取り出す層。
// 「どのデータをAIへ渡すか・どう集計するか」はここだけを直せばよいようにし、
// AIServiceやViewModelが直接localStorageの形を意識しなくて済むようにしている。

const ReadingRepository = {
  // 指定したidの本を取得する（無ければnull）
  findBook: function (bookId) {
    const books = loadBooks();
    return (
      books.find(function (book) {
        return book.id === bookId;
      }) || null
    );
  },

  // その本に、AIへ渡せる読書記録が1件でもあるかどうか
  hasRecords: function (bookId) {
    const book = ReadingRepository.findBook(bookId);
    return !!(book && book.records && book.records.length > 0);
  },

  // AI読書コーチへ渡す、この本についての読書データをまとめる（本や記録が無ければnull）
  getReadingContext: function (bookId) {
    const book = ReadingRepository.findBook(bookId);
    if (!book || !book.records || book.records.length === 0) {
      return null;
    }

    const isNovel = book.category === "novel";
    const currentPage = getComputedCurrentPage(book);
    const isFinished = !!(book.pageCount && currentPage >= book.pageCount);

    // 学び・気づき（実用書：今日学んだこと／小説：感想）をまとめる
    const learningNotes = book.records
      .map(function (record) {
        return isNovel ? record.impression : record.learning;
      })
      .filter(Boolean);

    // 読書メモ（小説の、学び以外の自由記述：印象に残ったセリフ・考察メモ）をまとめる
    const memoNotes = book.records
      .map(function (record) {
        if (!isNovel) {
          return "";
        }
        return [record.memorableQuote, record.notes].filter(Boolean).join(" / ");
      })
      .filter(Boolean);

    return {
      id: book.id,
      title: book.title,
      author: book.author || "",
      category: book.category,
      pageCount: book.pageCount || null,
      currentPage: currentPage,
      isFinished: isFinished,
      recordCount: book.records.length,
      learningNotes: learningNotes,
      memoNotes: memoNotes
    };
  },

  // AI分析（読書履歴全体の傾向分析）へ渡す、すべての本の読書データをまとめる。
  // 1冊ごとの詳細はgetReadingContextと同じ考え方だが、こちらは「全冊ぶん」を返す点が異なる。
  // どのデータをAIへ送るか絞り込む（要約・圧縮する）のはAIService側の責務とし、
  // ここでは実際に保存されている生データをそのまま（絞り込まずに）返す。
  getLibraryOverview: function () {
    const books = loadBooks();
    const actions = loadActions();

    return books.map(function (book) {
      const isNovel = book.category === "novel";
      const records = book.records || [];
      const currentPage = getComputedCurrentPage(book);
      const isFinished = !!(book.pageCount && currentPage >= book.pageCount);
      const review = getReviewForBook(book.id);

      const learningNotes = records
        .map(function (record) {
          return isNovel ? record.impression : record.learning;
        })
        .filter(Boolean);

      const memoNotes = records
        .map(function (record) {
          if (!isNovel) {
            return "";
          }
          return [record.memorableQuote, record.notes].filter(Boolean).join(" / ");
        })
        .filter(Boolean);

      // 読了日は記録していないため、読了済みの本は最後の読書記録の日付を目安として使う
      const lastRecord = records[records.length - 1];
      const finishedDate = isFinished && lastRecord ? lastRecord.date : null;

      const actionContents = actions
        .filter(function (action) {
          return action.bookId === book.id;
        })
        .map(function (action) {
          return action.content;
        })
        .filter(Boolean);

      return {
        id: book.id,
        title: book.title,
        author: book.author || "",
        category: book.category,
        rating: review ? review.rating : null,
        isFinished: isFinished,
        finishedDate: finishedDate,
        recordCount: records.length,
        learningNotes: learningNotes,
        memoNotes: memoNotes,
        actionContents: actionContents
      };
    });
  }
};
