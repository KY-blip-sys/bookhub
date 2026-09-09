// ---------- ログイン・新規登録・ログアウト ----------
// BookHubはログインしなくても、そのままlocalStorageだけで使える（js/services/cloudSync.js参照）。
// ログインは必須の入口ではなく、設定画面の「アカウント」欄から任意で行う機能という位置づけにしている。
// 起動時はここで裏側でSupabaseへの接続とログイン状態の確認だけを行い（アプリ本体の表示は待たせない）、
// 既にログイン済みのセッションが見つかった場合だけ、設定画面のアカウント欄をログイン済み表示に切り替え、
// クラウドのデータを読み込む。

const accountStatusLoadingEl = document.getElementById("account-status-loading");
const accountLoggedInSection = document.getElementById("account-logged-in-section");
const accountLoggedOutSection = document.getElementById("account-logged-out-section");

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

  if (!window.sb) {
    showAuthMessage("ログイン機能を利用できませんでした。時間をおいて再度お試しください。", "error");
    return;
  }

  const email = authEmailInput.value.trim();
  const password = authPasswordInput.value;

  if (authMode === "signup" && password !== authPasswordConfirmInput.value) {
    showAuthMessage("パスワードが一致しません。", "error");
    return;
  }

  authSubmitButton.disabled = true;
  authSubmitButton.textContent = authMode === "signup" ? "登録しています…" : "ログインしています…";
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
    authSubmitButton.textContent = authMode === "signup" ? "登録する" : "ログイン";
  }
});

// ログアウトボタン（設定画面）
logoutButton.addEventListener("click", async function () {
  await window.sb.auth.signOut();
  location.reload(); // 一番確実にログイン前の状態へ戻すため、そのまま再読み込みする
});

// 設定画面のアカウント欄を、ログイン済み表示に切り替える
function showLoggedInAccountUI(user) {
  accountStatusLoadingEl.hidden = true;
  accountLoggedOutSection.hidden = true;
  accountEmailEl.textContent = user.email;
  accountLoggedInSection.hidden = false;
}

// 設定画面のアカウント欄を、未ログイン表示（ログイン・新規登録フォーム）に切り替える
function showLoggedOutAccountUI() {
  accountStatusLoadingEl.hidden = true;
  accountLoggedInSection.hidden = true;
  accountLoggedOutSection.hidden = false;
}

// ログインが確認できたときの共通処理（ログインフォームからの成功時／起動時のセッション確認、どちらからも呼ぶ）
async function onSignedIn(user) {
  setCurrentUserId(user.id); // js/services/cloudSync.js：以後の保存を自動でクラウドにも反映する
  showLoggedInAccountUI(user);

  // 現在のプラン・AIクレジット残高をここで一度取得しておく（js/services/planStatus.js）。
  // 広告表示（js/services/ads.js）はこの結果を待たずに反映され、AI画面・設定画面・料金プラン画面は
  // 開いたときに改めて最新化されるが、ここで先に取得しておくことで広告の出し分けがログイン直後から効く
  await fetchPlanStatus();

  await pullCloudDataOrMigrate(user.id); // js/services/cloudSync.js
  await initializeBooksFromCloud(user.id); // js/models/booksModel.js：本棚はSupabaseのbooksテーブルから読み込む
  await initializeActionsFromCloud(user.id); // js/models/actionsModel.js：実践・実績はSupabaseのactionsテーブルから読み込む
  await initializeReviewsFromCloud(user.id); // js/models/reviewsModel.js：レビューはSupabaseのreviewsテーブルから読み込む
  await initializeFavoriteLearningsFromCloud(user.id); // js/models/favoriteLearningsModel.js：学んだことはSupabaseのfavorite_learningsテーブルから読み込む

  // クラウドから読み込んだ最新のデータで、画面を描画し直す
  // （ここまでの表示は、ログイン確認前のlocalStorageの内容で行われていたため）
  document.documentElement.classList.toggle("dark-mode", loadDarkModePreference());
  darkModeToggle.checked = loadDarkModePreference(); // app.jsで定義済みのグローバル変数

  // ログイン中に既に開いていた画面を、最新のデータで開き直す（別の画面へ移動させない）
  goToNavPage(currentNavKey);
}

// Stripe Checkoutの決済ページから戻ってきたときの処理（js/screens/pricing.jsのhandlePlanButtonClick参照）。
// URLの?checkout=success/cancelを見て、料金プラン画面へ遷移しつつ結果を案内する。
function handleCheckoutRedirect() {
  const params = new URLSearchParams(location.search);
  const checkoutResult = params.get("checkout");
  if (checkoutResult !== "success" && checkoutResult !== "cancel") {
    return false;
  }

  // 同じURLのままリロードしても再度案内が出ないよう、クエリパラメータだけを取り除く
  history.replaceState(null, "", location.pathname);

  goToNavPage("pricing");

  if (checkoutResult === "success") {
    showToast("お支払いが完了しました。プランの反映まで少し時間がかかる場合があります。");
  } else {
    showToast("決済がキャンセルされました。");
  }

  return true;
}

// Stripe Customer Portal（サブスクリプション管理）から戻ってきたときの処理
// （js/screens/settings.jsのsettingsSubscriptionButton参照）。
// URLの?portal=returnを見て、設定画面へ遷移しつつ案内する。
function handlePortalRedirect() {
  const params = new URLSearchParams(location.search);
  if (params.get("portal") !== "return") {
    return false;
  }

  // 同じURLのままリロードしても再度案内が出ないよう、クエリパラメータだけを取り除く
  history.replaceState(null, "", location.pathname);

  goToNavPage("settings");
  showToast("サブスクリプションの管理を終了しました。プランの反映まで少し時間がかかる場合があります。");

  return true;
}

// ---------- 起動時の処理 ----------
// アプリ本体（.app-shell）は最初から表示されており、ここでの処理を待たずに（localStorageの内容で）
// 使い始められる。ここでは裏側でログイン状態だけを確認し、結果を設定画面のアカウント欄に反映する。
async function initAuth() {
  let config;
  try {
    const response = await fetch("/api/config");
    config = await response.json();
    if (!config.supabaseUrl || !config.supabaseAnonKey) {
      throw new Error(config.error || "設定の取得に失敗しました。");
    }
  } catch (e) {
    accountStatusLoadingEl.textContent =
      "ログイン機能を利用できませんでした（Supabaseの接続設定を読み込めませんでした）。ログインなしでそのままお使いいただけます。";
    return;
  }

  window.sb = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);

  const { data } = await window.sb.auth.getSession();
  if (data.session) {
    await onSignedIn(data.session.user);
  } else {
    setAuthMode("login");
    showLoggedOutAccountUI();
  }

  handleCheckoutRedirect() || handlePortalRedirect();
}

initAuth();
