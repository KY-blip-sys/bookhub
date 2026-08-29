// BookHub: OpenAI APIとチャットするためのサーバー関数（Vercelが自動で動かす）。
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

  const { message } = req.body || {};
  if (!message || typeof message !== "string") {
    res.status(400).json({ error: "message（文字列）を指定してください。" });
    return;
  }

  try {
    const openai = getClient();
    const response = await openai.responses.create({
      model: "gpt-5-mini",
      input: message
    });

    const reply = response.output_text ?? "";
    res.status(200).json({ reply });
  } catch (error) {
    console.error("OpenAI API呼び出しエラー:", error);
    res.status(500).json({
      error: "OpenAIとの通信中にエラーが発生しました。しばらくしてから再試行してください。"
    });
  }
};
