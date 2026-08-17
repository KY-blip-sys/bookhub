// ---------- AI読書コーチ ViewModel ----------
// View（js/screens/aiCoach.js＝画面の表示・入力）と
// AIService（js/services/aiService.js＝実際の通信）の間を仲介する層。
// 入力チェックや、エラー種別を利用者向けの日本語メッセージに変換する処理をここにまとめることで、
// 画面側は「表示すること」だけに専念でき、通信の中身が変わっても画面のコードは直さずに済む。

const AiCoachViewModel = {
  // ユーザーの入力文章を受け取り、AIへの送信〜結果の受け渡しまでをまとめて行う。
  // callbacksには onStart / onSuccess(replyText) / onError(displayMessage) を渡す。
  sendUserMessage: function (userText, callbacks) {
    const trimmed = (userText || "").trim();
    if (!trimmed) {
      callbacks.onError("メッセージを入力してください。");
      return;
    }

    callbacks.onStart();

    AIService.sendMessage(
      trimmed,
      function (replyText) {
        callbacks.onSuccess(replyText);
      },
      function (error) {
        callbacks.onError(AiCoachViewModel.toDisplayMessage(error));
      }
    );
  },

  // AIServiceが返すエラー種別を、利用者向けの分かりやすい日本語メッセージに変換する
  toDisplayMessage: function (error) {
    if (error.type === "no-api-key") {
      return "OpenAI APIキーが設定されていないか、正しくありません。設定画面からAPIキーを登録してください。";
    }
    if (error.type === "timeout") {
      return "通信がタイムアウトしました。時間をおいて再度お試しください。";
    }
    if (error.type === "network") {
      return "通信に失敗しました。インターネット接続を確認してください。";
    }
    return "AIとの通信でエラーが発生しました。時間をおいて再度お試しください。";
  }
};
