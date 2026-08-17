// ---------- ReadingCoachViewModel ----------
// 「本の詳細画面」から本の文脈つきで開いたAI読書コーチを担当するViewModel。
// ReadingRepositoryから読書データを取り出し、AIへの依頼文を組み立てたうえで、
// 実際の送信・エラーメッセージへの変換はAiCoachViewModel（Step2までの汎用チャット）にそのまま委ねる。
// こうしておくと、AIServiceや通信エラーの扱いを二重に持たずに済む。
//
// 今後「おすすめ本の提案」「学びの整理結果の保存」のような機能を増やす場合も、
// READING_COACH_ACTIONSに項目を足すか、buildContextSummaryの内容を増やすだけでよい。

const READING_COACH_ACTIONS = {
  organize: {
    label: "学びを整理する",
    instruction:
      "この本から学んだ内容を、「①学んだ内容」「②特に重要なポイント」「③印象的だった考え」の3つに分けて整理してください。"
  },
  actionList: {
    label: "実践リストを作る",
    instruction:
      "この学びをもとに、明日からできる行動を3〜5個、箇条書きで提案してください。実践しやすい小さな行動から優先してください。"
  },
  summarize: {
    label: "学んだことを要約する",
    instruction: "この本の読書メモをもとに、内容を3〜5行程度で要約してください。"
  },
  deepen: {
    label: "内容を深掘りする",
    instruction:
      "この本の内容について、ユーザー自身がさらに考えを深められるような質問を2〜3個、答えを押し付けずに提示してください。"
  }
};

const ReadingCoachViewModel = {
  // 今、AI読書コーチが読み込んでいる本の文脈（本の詳細画面から開いたときだけ設定される）
  bookContext: null,

  // 本の詳細画面の「AI読書コーチ」ボタンから呼ばれる。読書データを読み込み、bookContextへ保持する。
  loadBookContext: function (bookId) {
    ReadingCoachViewModel.bookContext = ReadingRepository.getReadingContext(bookId);
    return ReadingCoachViewModel.bookContext;
  },

  // サイドバーから直接AI画面を開いたときなど、本の文脈をクリアして汎用モードに戻す
  clearBookContext: function () {
    ReadingCoachViewModel.bookContext = null;
  },

  hasBookContext: function () {
    return !!ReadingCoachViewModel.bookContext;
  },

  getActionDefinitions: function () {
    return READING_COACH_ACTIONS;
  },

  // 本の読書データを、AIへ渡す文章としてまとめる
  buildContextSummary: function (context) {
    const lines = [];
    lines.push("書名：" + context.title);
    if (context.author) {
      lines.push("著者：" + context.author);
    }
    if (context.pageCount) {
      lines.push(
        "進捗：" + context.currentPage + " / " + context.pageCount + "ページ（" + (context.isFinished ? "読了" : "読書中") + "）"
      );
    } else {
      lines.push("状況：" + (context.isFinished ? "読了" : "読書中"));
    }
    if (context.learningNotes.length > 0) {
      lines.push("学び・気づき：");
      context.learningNotes.forEach(function (note) {
        lines.push("・" + note);
      });
    }
    if (context.memoNotes.length > 0) {
      lines.push("読書メモ：");
      context.memoNotes.forEach(function (note) {
        lines.push("・" + note);
      });
    }
    return lines.join("\n");
  },

  // クイックアクション（学びを整理する 等）が押されたときの処理。
  // 読書データ入りのプロンプトを組み立て、AiCoachViewModel経由でAIへ自動送信する。
  runAction: function (actionKey, callbacks) {
    const context = ReadingCoachViewModel.bookContext;
    if (!context) {
      callbacks.onError("この本の読書記録が見つかりませんでした。本一覧から本を選び直してください。");
      return;
    }

    const action = READING_COACH_ACTIONS[actionKey];
    if (!action) {
      return;
    }

    const prompt =
      "以下は、ユーザーが読んでいる本の読書データです。この内容をもとに読書コーチとして答えてください。\n\n" +
      ReadingCoachViewModel.buildContextSummary(context) +
      "\n\n依頼内容：" +
      action.instruction;

    AiCoachViewModel.sendUserMessage(prompt, callbacks);
  }
};
