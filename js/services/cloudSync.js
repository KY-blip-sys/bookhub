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
// 本そのもの（reading-app-books）・読書記録（reading-app-book-records）は、
// js/models/booksModel.jsからSupabaseのbooks・book_recordsテーブルへ直接保存するようになったため、
// 実践・実績（reading-app-actions・reading-app-achievements）は、
// js/models/actionsModel.jsからSupabaseのactionsテーブルへ直接保存するようになったため、
// レビュー（reading-app-reviews）は、js/models/reviewsModel.jsからSupabaseのreviewsテーブルへ、
// 好きな言葉（reading-app-favorite-quotes）は、js/models/favoriteQuotesModel.jsから
// Supabaseのfavorite_quotesテーブルへ、学んだこと（reading-app-favorite-learnings）は、
// js/models/favoriteLearningsModel.jsからSupabaseのfavorite_learningsテーブルへ
// 直接保存するようになったため、いずれもここには含めない
const CLOUD_SYNCED_KEYS = [
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

// insert・update・deleteのSupabase呼び出しを1件送り、エラーがあればconsole.errorに出す
// （結果を待たない「投げっぱなし」。detailが指定されていれば、エラーメッセージに続けて出す）
function fireAndForgetCloudWrite(promise, message, detail) {
  promise
    .then(function (result) {
      if (result.error) {
        if (detail === undefined) {
          console.error(message, result.error);
        } else {
          console.error(message, detail, result.error);
        }
      }
    })
    .catch(function (error) {
      if (detail === undefined) {
        console.error(message, error);
      } else {
        console.error(message, detail, error);
      }
    });
}

// 指定したSupabaseテーブルへのinsert・update・deleteを、共通の「投げっぱなし」パターンでまとめる。
// 「ログインしていなければ何もしない」「エラー時はconsole.errorに出す」という、
// js/models/*.js（books・book_records・actions・reviews・favorite_quotes・favorite_learnings）で
// 重複していた処理をここに集約する。呼び出し側は、各モデルのXxxToSupabaseRow()で変換済みの
// 行データを渡すだけでよい（テーブルごとの列の違いはtoRow側の責務のまま残す）。
function createCloudCrud(table, entityLabel) {
  return {
    // detail：エラーログに添える識別情報（本のタイトルなど）。無くてもよい
    insert: function (row, detail) {
      if (!currentUserId || !window.sb) {
        return;
      }
      fireAndForgetCloudWrite(
        window.sb.from(table).insert(row),
        entityLabel + "の追加をクラウドへ保存できませんでした：",
        detail
      );
    },
    update: function (id, row, detail) {
      if (!currentUserId || !window.sb) {
        return;
      }
      fireAndForgetCloudWrite(
        window.sb.from(table).update(row).eq("id", id),
        entityLabel + "の更新をクラウドへ保存できませんでした：",
        detail
      );
    },
    // detailを省略した場合はidをそのままログに出す（既存の各モデルの削除ログと同じ挙動）
    remove: function (id, detail) {
      if (!currentUserId || !window.sb) {
        return;
      }
      fireAndForgetCloudWrite(
        window.sb.from(table).delete().eq("id", id),
        entityLabel + "の削除をクラウドへ反映できませんでした：",
        detail !== undefined ? detail : id
      );
    }
  };
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
    })
    .catch(function (error) {
      console.error("クラウドへの保存に失敗しました：", key, error);
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
