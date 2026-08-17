// ---------- AnalysisViewModel ----------
// 「AI分析」画面を担当するViewModel。
// ReadingRepositoryから読書履歴全体を取り出し、分析対象がなければその場でエラーにする。
// 実際の分析（要約・送信・JSONの解釈）はAIService.analyzeReadingHistoryにそのまま委ね、
// エラーメッセージの日本語化はAiCoachViewModel.toDisplayMessageを再利用する
// （エラーの種類の扱いをAI読書コーチと二重に持たないようにするため）。

const AnalysisViewModel = {
  // 直近の分析結果（画面を離れて戻ってきたときに、再送信せず表示だけ復元するために覚えておく）
  lastResult: null,

  // 読書履歴全体を分析する。callbacksには onStart / onSuccess(result) / onError(displayMessage) を渡す。
  runAnalysis: function (callbacks) {
    // 記録が1件も無い（登録しただけの）本は、傾向分析の対象から外す
    const overview = ReadingRepository.getLibraryOverview().filter(function (book) {
      return book.recordCount > 0;
    });

    if (overview.length === 0) {
      callbacks.onError("分析できる読書記録がまだありません。まずは本を読んで、記録を残してみましょう。");
      return;
    }

    callbacks.onStart();

    AIService.analyzeReadingHistory(
      overview,
      function (result) {
        AnalysisViewModel.lastResult = result;
        callbacks.onSuccess(result);
      },
      function (error) {
        callbacks.onError(AiCoachViewModel.toDisplayMessage(error));
      }
    );
  }
};
