// ---------- クラウド同期（Supabaseへの保存・読み込み） ----------
// BookHubは元々、すべてのデータをブラウザのlocalStorageだけに保存していた。
// ここでは「ログインしているときだけ」、localStorageへの保存と同時にSupabaseへも保存し、
// 別の端末からログインしたときはSupabase側のデータをlocalStorageへ読み込むことで、
// 同じアカウントならどの端末でも同じデータが使えるようにする。
//
// テーブルは1つ（app_data）だけで、localStorageの各キー（本一覧・実践…）を
// そのまま「1行」として保存する（supabase/schema.sql参照）。
// ログインしていない間は何もしない＝これまで通りlocalStorageだけで動く。

// クラウドと同期する対象のlocalStorageキー一覧
// （js/models/*.js で定義されている定数と同じ文字列。settingsModel.js・categoryModel.jsの
//   単純な文字列の設定値も、同じ仕組みでそのまま同期する）
const CLOUD_SYNCED_KEYS = [
  "reading-app-books",
  "reading-app-actions",
  "reading-app-achievements",
  "reading-app-reviews",
  "reading-app-favorite-quotes",
  "reading-app-favorite-learnings",
  "reading-app-active-category",
  "reading-app-dark-mode",
  "reading-app-daily-goal-minutes"
];

// 今ログインしているユーザーのid（未ログイン時はnull）。js/screens/auth.jsが設定する
let currentUserId = null;

function setCurrentUserId(userId) {
  currentUserId = userId;
}

// localStorageの生の文字列を、保存時と同じ型に戻す（JSONとして読めなければ文字列のまま扱う）
function parseRawLocalStorageValue(raw) {
  try {
    return JSON.parse(raw);
  } catch (e) {
    return raw;
  }
}

// Supabaseから読み込んだ値を、localStorageに書き戻せる文字列に変換する
function cloudValueToLocalStorageString(value) {
  return typeof value === "string" ? value : JSON.stringify(value);
}

// 指定したキーの値をSupabaseに保存する（ログインしていなければ何もしない）
// 呼び出し元の操作を待たせないよう、結果を待たない「投げっぱなし」にしている
function queueCloudSync(key, value) {
  if (!currentUserId || !window.sb) {
    return;
  }
  window.sb
    .from("app_data")
    .upsert({
      user_id: currentUserId,
      data_key: key,
      data_value: value,
      updated_at: new Date().toISOString()
    })
    .then(function (result) {
      if (result.error) {
        console.error("クラウドへの保存に失敗しました：", key, result.error);
      }
    });
}

// ログイン直後に1回だけ呼ぶ：
// ・クラウドにまだ何もデータが無ければ（このアカウントで初めてログイン）、
//   今この端末にあるデータをそのままクラウドへアップロードする（初回の移行）
// ・クラウドに既にデータがあれば、それをlocalStorageへ読み込んで上書きする
//   （別の端末で使っていたデータを、この端末でもそのまま使えるようにする）
// どちらの場合も、既存のlocalStorageのデータを勝手に消すことはしない
async function pullCloudDataOrMigrate(userId) {
  const { data: rows, error } = await window.sb
    .from("app_data")
    .select("data_key, data_value")
    .eq("user_id", userId);

  if (error) {
    console.error("クラウドからの読み込みに失敗しました：", error);
    return;
  }

  if (!rows || rows.length === 0) {
    // 初めてのログイン：今の端末のデータをクラウドへアップロードする
    CLOUD_SYNCED_KEYS.forEach(function (key) {
      const raw = localStorage.getItem(key);
      if (raw === null) {
        return; // まだ一度も保存されていない項目はアップロードしない
      }
      queueCloudSync(key, parseRawLocalStorageValue(raw));
    });
    return;
  }

  // 2回目以降のログイン：クラウド側のデータをこの端末に反映する
  rows.forEach(function (row) {
    localStorage.setItem(row.data_key, cloudValueToLocalStorageString(row.data_value));
  });
}
