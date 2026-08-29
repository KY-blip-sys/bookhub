// BookHub: 料金プランの一覧を返すサーバー関数（Vercelが自動で動かす）。
//
// 料金プラン画面（js/screens/pricing.js）は、価格・機能一覧・月間AIクレジットなどを
// このAPI経由でapi/_lib/aiCredits.jsのPLAN_CATALOGから取得して描画する
// （プラン名・価格・付与クレジットなどを画面側とサーバー側で二重管理しないため）。
// ログイン確認は行わない（料金プラン自体は誰が見てもよい情報のため）。
//
// 呼び出し方：
//   GET /api/plans を送ると { "plans": [ { key, label, priceYen, monthlyCredits, aiEnabled, ... }, ... ] } が返る。

const { PLAN_CATALOG } = require("./_lib/aiCredits");

module.exports = function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "GET") {
    res.status(405).json({ error: "このAPIはGETメソッドのみ対応しています。" });
    return;
  }

  res.status(200).json({ plans: PLAN_CATALOG });
};
