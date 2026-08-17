// ---------- AIService ----------
// OpenAI APIとの通信だけをまとめて担当する層。
// APIキーは js/models/settingsModel.js（設定画面でlocalStorageに保存したもの）から読み込み、
// コードの中には一切書き込まない。
// 将来、別のAIプロバイダーに差し替えたり、記録データを一緒に送るように拡張する場合も、
// この中身（fetchする先とリクエスト内容）を書き換えるだけでよく、
// 呼び出す側（ViewModel）は変更しなくて済むようにしている。

const AI_CHAT_API_URL = "https://api.openai.com/v1/chat/completions";
const AI_CHAT_MODEL = "gpt-4o-mini";
const AI_REQUEST_TIMEOUT_MS = 30000;

// OpenAI Chat Completions APIを呼ぶ、共通の下位処理。
// sendMessage（読書コーチとの対話）・analyzeReadingHistory（読書履歴の分析）の両方から使う。
// 成功時はAIの返答文字列（テキスト）をonSuccessへ、失敗時は種類つきのエラー情報（{type, message}）をonErrorへ渡す。
function requestChatCompletion(requestBody, onSuccess, onError) {
  const apiKey = loadOpenAiApiKey();
  if (!apiKey) {
    onError({ type: "no-api-key", message: "OpenAI APIキーが設定されていません。" });
    return;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(function () {
    controller.abort();
  }, AI_REQUEST_TIMEOUT_MS);

  fetch(AI_CHAT_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + apiKey
    },
    body: JSON.stringify(requestBody),
    signal: controller.signal
  })
    .then(function (response) {
      if (!response.ok) {
        // 401/403はAPIキーが間違っている可能性が高いので、専用のエラー種別にする
        const errorType = response.status === 401 || response.status === 403 ? "no-api-key" : "api";
        return response
          .json()
          .catch(function () {
            return {};
          })
          .then(function (body) {
            const detail = body.error && body.error.message ? body.error.message : "";
            return Promise.reject({
              type: errorType,
              message: "APIエラー（ステータスコード: " + response.status + "）" + (detail ? "：" + detail : "")
            });
          });
      }
      return response.json();
    })
    .then(function (data) {
      const reply = data.choices && data.choices[0] && data.choices[0].message
        ? data.choices[0].message.content
        : "";
      if (!reply) {
        return Promise.reject({ type: "unknown", message: "AIからの返答を取得できませんでした。" });
      }
      onSuccess(reply);
    })
    .catch(function (error) {
      if (error && error.type) {
        onError(error);
        return;
      }
      if (error && error.name === "AbortError") {
        onError({ type: "timeout", message: "通信がタイムアウトしました。" });
        return;
      }
      onError({ type: "network", message: "通信に失敗しました。" + (error && error.message ? error.message : "") });
    })
    .finally(function () {
      clearTimeout(timeoutId);
    });
}

// ---------- 読書コーチとの対話（Step1〜3） ----------

// AIに持たせる役割（読書コーチ）を定義するシステムプロンプト。
// 「学びの整理」「実践提案」「おすすめ本」など、今後コーチ機能を増やす場合も、
// ここか buildChatMessages の中身を調整するだけで対応でき、
// ViewModel・View側の変更は不要になるようにしている。
const AI_SYSTEM_PROMPT = [
  "あなたは「読書コーチ」です。ユーザーが読書で得た学びを深め、実際の行動につなげる手助けをします。",
  "",
  "心がけること：",
  "・ユーザーの考えや気づきを否定せず、まず受け止める",
  "・答えを一方的に押し付けず、ユーザー自身が考えられるような問いかけを交える",
  "・学びを整理する手助けをしたり、明日からできる小さな行動につながる提案をする",
  "・回答は常に前向きで、実践しやすい内容にする",
  "",
  "話し方のルール：",
  "・箇条書きを適度に使い、読みやすく整理する（多用しすぎない）",
  "・長すぎる回答は避け、簡潔にまとめる",
  "・難しい専門用語はできるだけ使わず、やさしい言葉で伝える",
  "・回答の最後に、考えを深めるための質問を1〜2個添える（すでに十分深掘りできている場合は省いてよい）"
].join("\n");

// OpenAI Chat APIへ送るmessages配列を組み立てる。
// 会話履歴やユーザーの読書データを渡すようになった場合も、この関数の中だけを拡張すればよい。
function buildChatMessages(userText) {
  return [
    { role: "system", content: AI_SYSTEM_PROMPT },
    { role: "user", content: userText }
  ];
}

// ---------- 読書履歴の分析（Step4） ----------
// 分析処理（送信データの要約・圧縮、システムプロンプト、AIへのリクエスト生成）は、
// すべてこのAIService内にまとめる。今後「月間分析」「年間分析」「読書ランキング」のような
// 分析の種類を増やす場合も、専用のシステムプロンプト・圧縮ルール・normalize関数を追加するだけでよい。

const AI_ANALYSIS_SYSTEM_PROMPT = [
  "あなたは「読書履歴分析AI」です。ユーザーのこれまでの読書データ（本のタイトル・著者・カテゴリー・評価・読了日・学び・メモ・実践内容）をもとに、読書の傾向を分析します。",
  "",
  "分析結果は、必ず次の形のJSON（日本語の文章を値に持つJSONオブジェクト）だけで返してください。説明文やマークダウンのコードブロックは付けないでください。",
  "{",
  '  "trends": ["読書傾向を表す短い文を2〜4個"],',
  '  "strengths": ["読書における強みを表す短い文を2〜4個"],',
  '  "gaps": ["読んでいる本の偏り・少ないジャンルを表す短い文を1〜3個"],',
  '  "nextTheme": "次に読むと良いテーマの提案を1〜2文で",',
  '  "recommendations": [',
  '    { "title": "本のタイトル", "author": "著者名", "reason": "おすすめする理由（2〜3行程度）" }',
  "  ]",
  "}",
  "",
  "心がけること：",
  "・ユーザーのこれまでの読書を否定せず、前向きな言葉で伝える",
  "・recommendationsは3〜5冊、実在しそうな書籍名・著者名で提案する（読書データに既に出てきた本は避ける）",
  "・データが少ない場合も、分かる範囲で誠実に分析する"
].join("\n");

// AIへ送るデータの上限（読書履歴が多い場合でも軽く送信できるようにするための要約・圧縮ルール）
const ANALYSIS_MAX_BOOKS = 40;
const ANALYSIS_MAX_NOTES_PER_BOOK = 3;
const ANALYSIS_NOTE_MAX_LENGTH = 60;

function truncateText(text, maxLength) {
  if (!text) {
    return "";
  }
  return text.length > maxLength ? text.slice(0, maxLength) + "…" : text;
}

// ReadingRepository.getLibraryOverview()の生データを、AIへ送るのに必要な項目だけの軽い形に絞り込む
function compressLibraryOverviewForAnalysis(libraryOverview) {
  return libraryOverview.slice(0, ANALYSIS_MAX_BOOKS).map(function (book) {
    const notes = book.learningNotes
      .concat(book.memoNotes)
      .slice(0, ANALYSIS_MAX_NOTES_PER_BOOK)
      .map(function (note) {
        return truncateText(note, ANALYSIS_NOTE_MAX_LENGTH);
      });

    const actions = book.actionContents.slice(0, ANALYSIS_MAX_NOTES_PER_BOOK).map(function (action) {
      return truncateText(action, ANALYSIS_NOTE_MAX_LENGTH);
    });

    const compressed = {
      title: book.title,
      author: book.author,
      category: book.category === "novel" ? "小説" : "実用書",
      finished: book.isFinished
    };
    if (book.rating) {
      compressed.rating = book.rating;
    }
    if (book.finishedDate) {
      compressed.finishedDate = book.finishedDate;
    }
    if (notes.length > 0) {
      compressed.notes = notes;
    }
    if (actions.length > 0) {
      compressed.actions = actions;
    }
    return compressed;
  });
}

// ---------- AIの返答（JSON）を、画面が扱いやすい安全な形に整えるための共通ヘルパー ----------
// AIの返答は形式が少しでも崩れることがあるため、どの機能のnormalize関数もここを経由させて、
// 期待と違う形が来ても画面が壊れない（空配列・空文字として扱われる）ようにする。

function toStringArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(function (item) {
    return typeof item === "string" && item.trim();
  });
}

function toSafeString(value) {
  return typeof value === "string" ? value : "";
}

// おすすめ本のリスト（{title, author, reason}の配列）を安全な形に整える。
// analyzeReadingHistory（Step4）・generateFinishedBookInsights（Step5）の両方で使う。
function normalizeRecommendations(value) {
  const list = Array.isArray(value) ? value : [];
  return list
    .map(function (item) {
      return {
        title: (item && item.title) || "",
        author: (item && item.author) || "",
        reason: (item && item.reason) || ""
      };
    })
    .filter(function (item) {
      return item.title;
    });
}

// AIの返答（JSON）が期待した形と少しでも違っても画面が壊れないよう、安全な形に整える
function normalizeAnalysisResult(parsed) {
  return {
    trends: toStringArray(parsed.trends),
    strengths: toStringArray(parsed.strengths),
    gaps: toStringArray(parsed.gaps),
    nextTheme: toSafeString(parsed.nextTheme),
    recommendations: normalizeRecommendations(parsed.recommendations)
  };
}

// ---------- 読書アシスタント（Step5）：各画面に差し込む、その場その場のAI提案 ----------
// 「本を追加したとき」「記録を保存したとき」「読了したとき」「読書目標」など、
// 画面ごとに違うタイミング・データを扱うため、プロンプトや返答の形もここで機能ごとに分けて持つ。
// 呼び出す側（AssistViewModel）は、渡すデータを揃えてこれらの関数を呼ぶだけでよい。

// ---- 1. 本を追加したときの「読む目的」提案 ----

const AI_PURPOSE_SYSTEM_PROMPT = [
  "あなたは読書サポートAIです。ユーザーが登録した本のタイトル・著者・ジャンルから、",
  "「この本を読む目的」の候補を提案します。",
  "",
  "必ず次の形のJSONだけで返してください（説明文は付けないでください）。",
  '{ "purposes": ["目的の候補を3〜4個、それぞれ15文字程度までの短い言葉で"] }',
  "",
  "例：「知識を増やしたい」「仕事で活かしたい」「教養を身につけたい」「楽しみたい」",
  "本のジャンルや雰囲気に合わせて、具体的な候補にしてください。"
].join("\n");

function buildPurposeUserMessage(book) {
  const lines = ["書名：" + book.title];
  if (book.author) {
    lines.push("著者：" + book.author);
  }
  lines.push("カテゴリー：" + (book.category === "novel" ? "小説" : "実用書"));
  return lines.join("\n");
}

// ---- 2. 読書記録を保存したときの振り返り ----

const AI_RECORD_REFLECTION_SYSTEM_PROMPT = [
  "あなたは「読書コーチ」です。ユーザーが今書いたばかりの読書メモをもとに、その場で短い振り返りを返します。",
  "",
  "必ず次の形のJSONだけで返してください。",
  "{",
  '  "summary": "学びの整理（1〜2文）",',
  '  "keyPoints": ["要点を1〜3個、短い文で"],',
  '  "actionIdeas": ["明日から試せる実践アイデアを1〜2個"]',
  "}",
  "",
  "心がけること：",
  "・ユーザーが書いた内容を否定せず、前向きに受け止める",
  "・短く、読みやすくまとめる"
].join("\n");

function buildRecordReflectionUserMessage(context) {
  return [
    "書名：" + context.bookTitle,
    "カテゴリー：" + (context.category === "novel" ? "小説" : "実用書"),
    "今回の読書メモ：" + context.noteText
  ].join("\n");
}

// ---- 3・4. 読了したときの振り返り＋おすすめ本 ----

const AI_FINISHED_BOOK_SYSTEM_PROMPT = [
  "あなたは「読書コーチ」です。ユーザーが読み終えた本について、振り返りと次に読む本を提案します。",
  "",
  "必ず次の形のJSONだけで返してください。",
  "{",
  '  "mostImportant": "この本で最も重要だったことを1〜2文で",',
  '  "tomorrowAction": "明日からできる行動を1つ、具体的に",',
  '  "reflectionQuestion": "振り返りを深める質問を1つ",',
  '  "recommendations": [',
  '    { "title": "本のタイトル", "author": "著者名", "reason": "おすすめする理由（1〜2行）" }',
  "  ]",
  "}",
  "",
  "recommendationsは3冊、実在しそうな書籍名・著者名で、この本の内容と関連づけて提案してください（この本自体は含めないでください）。"
].join("\n");

function buildFinishedBookUserMessage(context) {
  const lines = ["書名：" + context.title];
  if (context.author) {
    lines.push("著者：" + context.author);
  }
  lines.push("カテゴリー：" + (context.category === "novel" ? "小説" : "実用書"));
  if (context.learningNotes.length > 0) {
    lines.push("学び・気づき：");
    context.learningNotes.forEach(function (note) {
      lines.push("・" + note);
    });
  }
  if (context.memoNotes.length > 0) {
    lines.push("読書メモ：");
    context.memoNotes.forEach(function (note) {
      lines.push("・" + note);
    });
  }
  return lines.join("\n");
}

function normalizeFinishedBookInsights(parsed) {
  return {
    mostImportant: toSafeString(parsed.mostImportant),
    tomorrowAction: toSafeString(parsed.tomorrowAction),
    reflectionQuestion: toSafeString(parsed.reflectionQuestion),
    recommendations: normalizeRecommendations(parsed.recommendations)
  };
}

// ---- 5. 読書目標サポート ----
// 目標冊数・今月の実績・残り日数などの「数値そのもの」はAIには計算させず、
// AssistViewModelが実データから機械的に計算したものをそのまま渡す。AIの役割は、その数値を前向きな言葉にすることだけ。

const AI_GOAL_ENCOURAGEMENT_SYSTEM_PROMPT = [
  "あなたは「読書コーチ」です。ユーザーの今月の読書目標の進み具合をもとに、前向きな一言を伝えます。",
  "",
  "必ず次の形のJSONだけで返してください。",
  '{ "messages": ["前向きな一言を2〜3個、それぞれ短く"] }',
  "",
  "・与えられた数値（目標冊数・今月読んだ冊数・残り冊数・残り日数）は変えずにそのまま使ってください",
  "・押し付けがましくならないよう、やさしい言葉で伝えてください",
  "・ペースに余裕があれば労い、厳しめであれば「今日10分だけ読みませんか？」のような小さな一歩を提案してください"
].join("\n");

function buildGoalEncouragementUserMessage(progress) {
  return [
    "今月の目標冊数：" + progress.goalCount + "冊",
    "今月すでに読み終えた冊数：" + progress.finishedThisMonth + "冊",
    "目標まで残り：" + progress.remaining + "冊",
    "今月の残り日数：" + progress.daysRemainingInMonth + "日",
    "ペース：" + (progress.onTrack ? "順調" : "やや遅れ気味")
  ].join("\n");
}

const AIService = {
  // ユーザーの文章をAIへ送り、返答の文章をonSuccessへ、
  // 失敗したときは種類つきのエラー情報（{type, message}）をonErrorへ渡す
  sendMessage: function (userText, onSuccess, onError) {
    requestChatCompletion(
      {
        model: AI_CHAT_MODEL,
        messages: buildChatMessages(userText)
      },
      onSuccess,
      onError
    );
  },

  // 読書履歴全体（ReadingRepository.getLibraryOverview()の結果）をAIへ送り、
  // 傾向・強み・偏り・次に読むべきテーマ・おすすめ本をまとめたオブジェクトをonSuccessへ渡す
  analyzeReadingHistory: function (libraryOverview, onSuccess, onError) {
    const compressed = compressLibraryOverviewForAnalysis(libraryOverview);
    const userMessage =
      "以下は、ユーザーのこれまでの読書データ（JSON形式、" + compressed.length + "冊ぶん）です。このデータをもとに読書傾向を分析してください。\n\n" +
      JSON.stringify(compressed);

    requestChatCompletion(
      {
        model: AI_CHAT_MODEL,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: AI_ANALYSIS_SYSTEM_PROMPT },
          { role: "user", content: userMessage }
        ]
      },
      function (rawReply) {
        let parsed;
        try {
          parsed = JSON.parse(rawReply);
        } catch (parseError) {
          onError({ type: "unknown", message: "AIの返答を読み取れませんでした。" });
          return;
        }
        onSuccess(normalizeAnalysisResult(parsed));
      },
      onError
    );
  },

  // 本のタイトル・著者・カテゴリーから、「読む目的」の候補（文字列の配列）をonSuccessへ渡す
  suggestReadingPurpose: function (book, onSuccess, onError) {
    requestChatCompletion(
      {
        model: AI_CHAT_MODEL,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: AI_PURPOSE_SYSTEM_PROMPT },
          { role: "user", content: buildPurposeUserMessage(book) }
        ]
      },
      function (rawReply) {
        let parsed;
        try {
          parsed = JSON.parse(rawReply);
        } catch (parseError) {
          onError({ type: "unknown", message: "AIの返答を読み取れませんでした。" });
          return;
        }
        onSuccess(toStringArray(parsed.purposes));
      },
      onError
    );
  },

  // 今回保存された1件の読書メモをもとに、その場の振り返り（学びの整理・要点・実践アイデア）をonSuccessへ渡す
  reflectOnRecord: function (context, onSuccess, onError) {
    requestChatCompletion(
      {
        model: AI_CHAT_MODEL,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: AI_RECORD_REFLECTION_SYSTEM_PROMPT },
          { role: "user", content: buildRecordReflectionUserMessage(context) }
        ]
      },
      function (rawReply) {
        let parsed;
        try {
          parsed = JSON.parse(rawReply);
        } catch (parseError) {
          onError({ type: "unknown", message: "AIの返答を読み取れませんでした。" });
          return;
        }
        onSuccess({
          summary: toSafeString(parsed.summary),
          keyPoints: toStringArray(parsed.keyPoints),
          actionIdeas: toStringArray(parsed.actionIdeas)
        });
      },
      onError
    );
  },

  // 読み終えた本の読書データ（ReadingRepository.getReadingContext()の結果）をもとに、
  // 振り返り（最も重要だったこと・明日の行動・振り返りの質問）とおすすめ本をonSuccessへ渡す
  generateFinishedBookInsights: function (context, onSuccess, onError) {
    requestChatCompletion(
      {
        model: AI_CHAT_MODEL,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: AI_FINISHED_BOOK_SYSTEM_PROMPT },
          { role: "user", content: buildFinishedBookUserMessage(context) }
        ]
      },
      function (rawReply) {
        let parsed;
        try {
          parsed = JSON.parse(rawReply);
        } catch (parseError) {
          onError({ type: "unknown", message: "AIの返答を読み取れませんでした。" });
          return;
        }
        onSuccess(normalizeFinishedBookInsights(parsed));
      },
      onError
    );
  },

  // 今月の読書目標の進み具合（AssistViewModelが計算した数値）をもとに、
  // 前向きな一言（文字列の配列）をonSuccessへ渡す
  generateGoalEncouragement: function (progress, onSuccess, onError) {
    requestChatCompletion(
      {
        model: AI_CHAT_MODEL,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: AI_GOAL_ENCOURAGEMENT_SYSTEM_PROMPT },
          { role: "user", content: buildGoalEncouragementUserMessage(progress) }
        ]
      },
      function (rawReply) {
        let parsed;
        try {
          parsed = JSON.parse(rawReply);
        } catch (parseError) {
          onError({ type: "unknown", message: "AIの返答を読み取れませんでした。" });
          return;
        }
        onSuccess(toStringArray(parsed.messages));
      },
      onError
    );
  }
};
