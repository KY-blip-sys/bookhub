// ---------- ログイン・新規登録・ログアウト ----------
// BookHubの起動時、まずここでSupabaseへの接続とログイン状態の確認を行う。
// ・ログイン済みなら、クラウドのデータを読み込んでからアプリ本体（.app-shell）を表示する
// ・未ログインなら、ログイン・新規登録画面（#auth-screen）を表示したままにする
// アプリ本体の他のスクリプト（js/models・js/screens/*）は、このファイルより先に読み込まれ、
// 通常通りページを組み立てているが、#auth-screenの裏に隠れているだけなので問題ない。

const authScreen = document.getElementById("auth-screen");
const authLoadingEl = document.getElementById("auth-loading");
const authFormSection = document.getElementById("auth-form-section");
const authForm = document.getElementById("auth-form");
const authEmailInput = document.getElementById("auth-email");
const authPasswordInput = document.getElementById("auth-password");
const authPasswordConfirmField = document.getElementById("auth-password-confirm-field");
const authPasswordConfirmInput = document.getElementById("auth-password-confirm");
const authSubmitButton = document.getElementById("auth-submit-button");
const authSubtitleEl = document.getElementById("auth-subtitle");
const authMessageEl = document.getElementById("auth-message");
const authSwitchToSignupButton = document.getElementById("auth-switch-to-signup");
const authSwitchToLoginButton = document.getElementById("auth-switch-to-login");
const authSwitchRowSignup = document.getElementById("auth-switch-row-signup");
const authSwitchRowLogin = document.getElementById("auth-switch-row-login");

const accountEmailEl = document.getElementById("account-email");
const logoutButton = document.getElementById("logout-button");

let authMode = "login"; // "login" | "signup"

function showAuthMessage(text, type) {
  authMessageEl.textContent = text;
  authMessageEl.className = "auth-message auth-message-" + (type || "error");
  authMessageEl.hidden = false;
}

function clearAuthMessage() {
  authMessageEl.hidden = true;
}

// Supabase Authのエラー（英語）を、ユーザー向けの日本語メッセージに変換する
function translateAuthError(error, mode) {
  const code = error && error.code;
  const message = (error && error.message) || "";

  if (code === "user_already_exists" || /already registered/i.test(message)) {
    return "このメールアドレスは既に登録されています。";
  }
  if (code === "weak_password" || /password/i.test(message) && /(short|weak|at least)/i.test(message)) {
    return "パスワードは6文字以上で設定してください。";
  }
  if (code === "invalid_credentials" || /invalid login credentials/i.test(message)) {
    return "メールアドレスまたはパスワードが違います。";
  }
  if (code === "email_not_confirmed" || /email not confirmed/i.test(message)) {
    return "メール認証が完了していません。届いた確認メール内のリンクを開いてください。";
  }
  if (code === "invalid_email" || /invalid email/i.test(message)) {
    return "メールアドレスの形式が正しくありません。";
  }
  if (code === "over_email_send_rate_limit" || code === "over_request_rate_limit" || /rate limit/i.test(message)) {
    return "しばらく時間をおいてから、もう一度お試しください。";
  }
  if (code === "signup_disabled") {
    return "現在、新規登録を受け付けていません。";
  }
  return mode === "signup"
    ? "登録に失敗しました。時間をおいて再度お試しください。"
    : "ログインに失敗しました。時間をおいて再度お試しください。";
}

function setAuthMode(mode) {
  authMode = mode;
  clearAuthMessage();
  const isSignup = mode === "signup";
  authSubtitleEl.textContent = isSignup
    ? "新規登録：メールアドレスとパスワードを入力してください"
    : "ログイン：メールアドレスとパスワードを入力してください";
  authSubmitButton.textContent = isSignup ? "登録する" : "ログイン";
  authPasswordConfirmField.hidden = !isSignup;
  authPasswordConfirmInput.required = isSignup;
  authSwitchRowSignup.hidden = isSignup;
  authSwitchRowLogin.hidden = !isSignup;
}

authSwitchToSignupButton.addEventListener("click", function () {
  setAuthMode("signup");
});
authSwitchToLoginButton.addEventListener("click", function () {
  setAuthMode("login");
});

// ログイン・新規登録フォームの送信
authForm.addEventListener("submit", async function (event) {
  event.preventDefault();
  clearAuthMessage();

  const email = authEmailInput.value.trim();
  const password = authPasswordInput.value;

  if (authMode === "signup" && password !== authPasswordConfirmInput.value) {
    showAuthMessage("パスワードが一致しません。", "error");
    return;
  }

  authSubmitButton.disabled = true;
  try {
    if (authMode === "signup") {
      // display_nameはprofilesテーブルのトリガー（supabase/ai_credits.sql）が
      // raw_user_meta_dataから読み取り、新規登録時のプロフィール行に保存する
      const { data, error } = await window.sb.auth.signUp({
        email,
        password,
        options: { data: { display_name: email.split("@")[0] } }
      });
      if (error) {
        showAuthMessage(translateAuthError(error, "signup"), "error");
        return;
      }
      if (!data.session) {
        // Supabase側で「メール確認」が有効な設定の場合、ここではまだログインできない
        setAuthMode("login");
        showAuthMessage(
          "確認メールを送りました。メール内のリンクを開いてから、ログインしてください。",
          "success"
        );
        return;
      }
      // メール確認が無効な設定なら、登録と同時にログイン済みになっている
      await onSignedIn(data.session.user);
    } else {
      const { data, error } = await window.sb.auth.signInWithPassword({ email, password });
      if (error) {
        showAuthMessage(translateAuthError(error, "login"), "error");
        return;
      }
      await onSignedIn(data.session.user);
    }
  } catch (e) {
    showAuthMessage("通信エラーが発生しました。インターネット接続を確認して、もう一度お試しください。", "error");
  } finally {
    authSubmitButton.disabled = false;
  }
});

// ログアウトボタン（設定画面）
logoutButton.addEventListener("click", async function () {
  await window.sb.auth.signOut();
  location.reload(); // 一番確実にログイン前の状態へ戻すため、そのまま再読み込みする
});

// ログインが確認できたときの共通処理（ログインフォームからの成功時／起動時のセッション確認、どちらからも呼ぶ）
async function onSignedIn(user) {
  setCurrentUserId(user.id); // js/services/cloudSync.js：以後の保存を自動でクラウドにも反映する
  accountEmailEl.textContent = user.email;

  authLoadingEl.hidden = false;
  authFormSection.hidden = true;
  authLoadingEl.textContent = "データを読み込んでいます…";

  await pullCloudDataOrMigrate(user.id); // js/services/cloudSync.js
  await initializeBooksFromCloud(user.id); // js/models/booksModel.js：本棚はSupabaseのbooksテーブルから読み込む
  await initializeActionsFromCloud(user.id); // js/models/actionsModel.js：実践・実績はSupabaseのactionsテーブルから読み込む
  await initializeReviewsFromCloud(user.id); // js/models/reviewsModel.js：レビューはSupabaseのreviewsテーブルから読み込む
  await initializeFavoriteQuotesFromCloud(user.id); // js/models/favoriteQuotesModel.js：好きな言葉はSupabaseのfavorite_quotesテーブルから読み込む
  await initializeFavoriteLearningsFromCloud(user.id); // js/models/favoriteLearningsModel.js：学んだことはSupabaseのfavorite_learningsテーブルから読み込む

  // クラウドから読み込んだ最新のデータで、画面を描画し直す
  // （ここまでの初期表示は、ログイン確認前のlocalStorageの内容で行われていたため）
  document.documentElement.classList.toggle("dark-mode", loadDarkModePreference());
  darkModeToggle.checked = loadDarkModePreference(); // app.jsで定義済みのグローバル変数
  if (!loadActiveCategory()) {
    saveActiveCategory("practical");
  }
  updateCategorySwitcherUI();
  updateNavVisibility();
  goToNavPage("dashboard");

  authScreen.hidden = true;
  document.querySelector(".app-shell").hidden = false;
}

// ---------- 起動時の処理 ----------
async function initAuth() {
  let config;
  try {
    const response = await fetch("/api/config");
    config = await response.json();
    if (!config.supabaseUrl || !config.supabaseAnonKey) {
      throw new Error(config.error || "設定の取得に失敗しました。");
    }
  } catch (e) {
    authLoadingEl.hidden = false;
    authFormSection.hidden = true;
    authLoadingEl.textContent =
      "Supabaseの接続設定を読み込めませんでした。Vercelの環境変数（SUPABASE_URL / SUPABASE_ANON_KEY）を確認してください。";
    return;
  }

  window.sb = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);

  const { data } = await window.sb.auth.getSession();
  if (data.session) {
    await onSignedIn(data.session.user);
  } else {
    setAuthMode("login");
    authLoadingEl.hidden = true;
    authFormSection.hidden = false;
  }
}

initAuth();
