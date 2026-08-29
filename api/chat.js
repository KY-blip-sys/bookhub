// BookHub: OpenAI APIとチャットするためのサーバー関数（Vercelが自動で動かす）。
// AIチャット・AIおすすめ本・AIクイズ・AI要約・AI学習コーチなど、AIを使うすべての機能は
// このエンドポイント1つだけを共通で利用する（機能ごとに通信処理を作り直さない）。
//
// APIキーはGitHubに公開しているコードには書かず、Vercelの環境変数として保存し、
// この関数経由（サーバー側）でのみ読み込む。ブラウザには一切渡さない。
//
// 必要なVercelの環境変数：
//   OPENAI_API_KEY … OpenAIのAPIキー（https://platform.openai.com/api-keys で発行）
//
// 呼び出し方：
//   POST /api/chat  に  { "message": "こんにちは" }  を送ると
//   { "reply": "こんにちは！" }  のようにOpenAIの返答が返る。
//
//   単純な会話文だけでなく、機能ごとの役割（instructions）を伝えたい場合や、
//   カード表示・クイズ表示のためにAIの返答をJSONの形で受け取りたい場合は、
//   { "message": "...", "instructions": "...", "schema": { "name": "...", "schema": {...} } }
//   のように追加のフィールドを渡す（js/services/aiChat.jsのsendChatMessage参照）。
//   schemaを渡すと、replyには文字列として整形済みのJSON文字列が入って返る。

const OpenAI = require("openai");

let client = null;
function getClient() {
  if (!client) {
    client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return client;
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.status(405).json({ error: "このAPIはPOSTメソッドのみ対応しています。" });
    return;
  }

  if (!process.env.OPENAI_API_KEY) {
    res.status(500).json({
      error: "OpenAIの環境変数（OPENAI_API_KEY）がVercelに設定されていません。"
    });
    return;
  }

  const { message, instructions, schema } = req.body || {};
  if (!message || typeof message !== "string") {
    res.status(400).json({ error: "message（文字列）を指定してください。" });
    return;
  }

  try {
    const openai = getClient();

    const request = {
      model: "gpt-5-mini",
      input: message
    };

    if (instructions && typeof instructions === "string") {
      request.instructions = instructions;
    }

    // schema（{ name, schema }）が指定されたときだけ、AIの返答をJSON構造で受け取る
    // （おすすめ本のカード・クイズの問題・要約・学習コーチなど、表示側で組み立てが必要な機能で使う）
    if (schema && typeof schema === "object" && schema.name && schema.schema) {
      request.text = {
        format: {
          type: "json_schema",
          name: schema.name,
          schema: schema.schema,
          strict: true
        }
      };
    }

    const response = await openai.responses.create(request);

    const reply = response.output_text ?? "";
    res.status(200).json({ reply });
  } catch (error) {
    console.error("OpenAI API呼び出しエラー:", error);
    res.status(500).json({
      error: "OpenAIとの通信中にエラーが発生しました。しばらくしてから再試行してください。"
    });
  }
};
