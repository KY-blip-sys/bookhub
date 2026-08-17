// ---------- AssistViewModel ----------
// 「読書アシスタント」として、各画面に差し込むAI提案（Step5）をまとめて担当するViewModel。
// どの画面（books.js／records.js／app.jsのダッシュボード）から呼ばれても、
// 「AIを呼んでよい状態か」の判断と、AIServiceへの橋渡しはすべてここを経由する。
//
// これらはユーザーが明示的にボタンを押して呼び出すAI読書コーチ（Step1〜3）とは違い、
// 画面のついでに自動で表示される「おまけ」の提案のため、
// APIキー未設定や通信エラーのときは、画面を邪魔しないよう静かに諦める
// （エラーメッセージを表に出すのはonErrorを使う呼び出し側の判断に任せるが、
// 基本的には各Viewでカードをそのまま閉じる想定）。

// "2026/8/16" のような日付文字列をDateに変換する（読み取れなければnull）
function parseJaDate(dateString) {
  if (!dateString) {
    return null;
  }
  const parts = dateString.split("/").map(Number);
  if (parts.length !== 3 || parts.some(function (n) {
    return isNaN(n);
  })) {
    return null;
  }
  return new Date(parts[0], parts[1] - 1, parts[2]);
}

const AssistViewModel = {
  // AIアシスト機能を自動で動かしてよい状態か（OpenAI APIキーが設定されているか）
  isAvailable: function () {
    return !!loadOpenAiApiKey();
  },

  // 1. 本を追加したときの「読む目的」提案
  suggestPurpose: function (book, callbacks) {
    if (!AssistViewModel.isAvailable()) {
      return;
    }
    callbacks.onStart();
    AIService.suggestReadingPurpose(book, callbacks.onSuccess, function (error) {
      callbacks.onError(AiCoachViewModel.toDisplayMessage(error));
    });
  },

  // 2. 読書記録を保存したときの振り返り（学び整理・要点・実践アイデア）
  reflectOnRecord: function (context, callbacks) {
    if (!AssistViewModel.isAvailable()) {
      return;
    }
    callbacks.onStart();
    AIService.reflectOnRecord(context, callbacks.onSuccess, function (error) {
      callbacks.onError(AiCoachViewModel.toDisplayMessage(error));
    });
  },

  // 3・4. 読了したときの振り返り＋おすすめ本
  generateFinishedInsights: function (bookId, callbacks) {
    if (!AssistViewModel.isAvailable()) {
      return;
    }
    const context = ReadingRepository.getReadingContext(bookId);
    if (!context) {
      return;
    }
    callbacks.onStart();
    AIService.generateFinishedBookInsights(context, callbacks.onSuccess, function (error) {
      callbacks.onError(AiCoachViewModel.toDisplayMessage(error));
    });
  },

  // 5. 読書目標サポート（1日1回だけ生成し、同じ日にダッシュボードを再訪問しても再送信しない）
  lastGoalEncouragement: null,
  lastGoalEncouragementDateKey: null,

  // 今月の読書目標に対する進捗を、実データから機械的に計算する（AIには数値の計算をさせない）
  computeGoalProgress: function (goalCount) {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth(); // 0〜11

    const overview = ReadingRepository.getLibraryOverview();
    const finishedThisMonth = overview.filter(function (book) {
      if (!book.isFinished || !book.finishedDate) {
        return false;
      }
      const parsed = parseJaDate(book.finishedDate);
      return !!parsed && parsed.getFullYear() === year && parsed.getMonth() === month;
    }).length;

    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysRemainingInMonth = daysInMonth - now.getDate() + 1;
    const remaining = Math.max(0, goalCount - finishedThisMonth);
    const onTrack = remaining === 0 || remaining <= daysRemainingInMonth;

    return {
      goalCount: goalCount,
      finishedThisMonth: finishedThisMonth,
      remaining: remaining,
      daysRemainingInMonth: daysRemainingInMonth,
      onTrack: onTrack
    };
  },

  getGoalEncouragement: function (callbacks) {
    const goalCount = loadMonthlyReadingGoal();
    if (!goalCount || !AssistViewModel.isAvailable()) {
      return;
    }

    const todayKey = new Date().toDateString();
    if (AssistViewModel.lastGoalEncouragement && AssistViewModel.lastGoalEncouragementDateKey === todayKey) {
      callbacks.onSuccess(AssistViewModel.lastGoalEncouragement);
      return;
    }

    const progress = AssistViewModel.computeGoalProgress(goalCount);

    callbacks.onStart();
    AIService.generateGoalEncouragement(
      progress,
      function (messages) {
        AssistViewModel.lastGoalEncouragement = messages;
        AssistViewModel.lastGoalEncouragementDateKey = todayKey;
        callbacks.onSuccess(messages);
      },
      function (error) {
        callbacks.onError(AiCoachViewModel.toDisplayMessage(error));
      }
    );
  }
};
