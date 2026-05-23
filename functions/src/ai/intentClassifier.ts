/**
 * ユーザーメッセージの意図分類
 * Claude APIを使わずにキーワードベースで高速分類し、
 * 曖昧な場合のみAIにフォールバックする
 */

import { getAIJsonResponse } from "./client";
import { INTENT_CLASSIFICATION_PROMPT } from "./prompts";

export type Intent =
  | "record"
  | "menu_request"
  | "form_question"
  | "progress"
  | "nutrition"
  | "general"
  | "greeting"
  | "other";

export interface ClassificationResult {
  intent: Intent;
  confidence: number;
  exerciseName: string | null;
}

// 数字を含む文でも「記録報告」ではなく相談・質問とみなすべきガード語。
// 例:「ベンチ60kgのフォーム見直したい」「100kg目指すメニュー作って」「10回で腰が痛い」
// これに該当する場合は record パターンをスキップし、後段（menu/form/progress/general）の評価に流す。
const RECORD_GUARD = /(メニュー|プログラム|フォーム|やり方|効か|痛い|違和感|怪我|目指|狙|組ん|組む|作っ|何セット|何回|何キロ|おすすめ|どうやって|アドバイス|相談|教えて)/;

// キーワードベースの高速分類パターン
// 上から順に評価されるため、衝突しやすいものほど上に並べる（記録 > メニュー > 進捗 > フォーム > 栄養 > 挨拶）
const PATTERNS: { intent: Intent; keywords: RegExp }[] = [
  {
    // 数字 + 単位を含む = 記録報告と判断（メニュー要求の前に評価）
    // ただし RECORD_GUARD で「相談文の中の数字」は除外する
    intent: "record",
    keywords:
      /(\d+\s*(kg|キロ|KG)|\d+\s*(回|rep|レップ)|\d+\s*(セット|set|SET)|今日.*(やった|した|トレ|筋トレ))/i,
  },
  {
    // 「メニュー〇〇」「〇〇メニュー」+依頼動詞 / 「何やれば」「次の練習」/ 「胸の日」「脚の日」 など
    intent: "menu_request",
    keywords:
      /(メニュー|プログラム|めにゅー).*(作|組|考|お願い|ちょうだい|教|よろしく|頂戴|ください|くれ|どう|は\?|は？)|(作って|組んで|考えて|お願い).*(メニュー|プログラム)|(何|なに).*(やれ|やろ|やる|すれ|しよ|トレすれ|鍛え)|次の.*(練習|トレ|メニュー)|今日.*(何|なに|メニュー).*(する|やる|トレ|は)|(胸|背中|脚|肩|腕|腹).*の日|今日.*の.*メニュー/,
  },
  {
    // 進捗・履歴・成長・調子確認系。「強くなって」「停滞」「伸び悩」も拾う
    intent: "progress",
    keywords:
      /(記録|履歴|進捗|推移|伸び|成長|振り返|最近|前回|見せて|確認|調子|どんな感じ|どうなって|ペース|どれくらい上|強くなって|停滞|伸び悩|上がって|頑張れて)/,
  },
  {
    // フォーム・痛み・違和感はここに集約（form_question に医療相談注意を出させる）
    intent: "form_question",
    keywords:
      /(フォーム|やり方|効かせ方|効かない|コツ|ポイント|正しい.*(方法|姿勢)|どうやって|どう動か|意識.*(ポイント|こと)|痛い|違和感|張る|つる|怪我)/,
  },
  {
    intent: "nutrition",
    keywords:
      /(プロテイン|タンパク質|PFC|カロリー|食事|栄養|サプリ|炭水化物|脂質|クレアチン|BCAA|減量食|増量食|カーボ|マクロ|食べ物|食べる|何を食|間食|チートデイ)/,
  },
  {
    intent: "greeting",
    keywords:
      /^(こんにちは|こんばんは|おはよう|お疲れ|おつかれ|はじめまして|ども|やあ|hey|hello|hi)[。！!～ー…]*$/i,
  },
];

// 種目名の抽出パターン
const EXERCISE_NAMES = [
  "ベンチプレス", "ベンチ", "BP",
  "スクワット", "スク", "スクワ",
  "デッドリフト", "デッド", "DL",
  "オーバーヘッドプレス", "ショルプレ", "OHP",
  "ラットプルダウン", "ラットプル",
  "チンニング", "懸垂",
  "サイドレイズ", "サイレ",
  "レッグプレス", "レグプレ",
  "バイセプスカール", "カール", "アームカール",
  "プッシュアップ", "腕立て",
  "クランチ", "腹筋",
  "ダンベルプレス", "ダンベルベンチ",
  "インクライン",
  "ディップス",
  "ローイング", "ロウ",
  "レッグカール", "レッグエクステンション",
  "ブルガリアンスクワット",
  "フロントスクワット",
];

/**
 * キーワードベースの高速分類を試みる
 */
function classifyByKeywords(message: string): ClassificationResult | null {
  const trimmed = message.trim();
  const hasRecordGuard = RECORD_GUARD.test(trimmed);

  for (const pattern of PATTERNS) {
    // 数字を含む文でも「相談語」を含む場合は record として扱わない
    if (pattern.intent === "record" && hasRecordGuard) continue;

    if (pattern.keywords.test(trimmed)) {
      const exerciseName = extractExerciseName(trimmed);
      return {
        intent: pattern.intent,
        confidence: 0.8,
        exerciseName,
      };
    }
  }

  return null;
}

/**
 * メッセージから種目名を抽出
 */
function extractExerciseName(message: string): string | null {
  for (const name of EXERCISE_NAMES) {
    if (message.includes(name)) {
      return name;
    }
  }
  return null;
}

/**
 * ユーザーメッセージの意図を分類する
 * まずキーワードベースで高速分類し、マッチしなければAIにフォールバック
 */
export async function classifyIntent(
  message: string
): Promise<ClassificationResult> {
  // 1. キーワードベースで高速分類を試みる
  const keywordResult = classifyByKeywords(message);
  if (keywordResult) {
    return keywordResult;
  }

  // 2. AIによる分類にフォールバック
  try {
    const jsonStr = await getAIJsonResponse(
      INTENT_CLASSIFICATION_PROMPT,
      message,
      "intent"
    );
    const parsed = JSON.parse(jsonStr) as ClassificationResult;

    // バリデーション
    const validIntents: Intent[] = [
      "record", "menu_request", "form_question",
      "progress", "nutrition", "general", "greeting", "other",
    ];
    if (!validIntents.includes(parsed.intent)) {
      return { intent: "general", confidence: 0.5, exerciseName: null };
    }

    return {
      intent: parsed.intent,
      confidence: parsed.confidence ?? 0.7,
      exerciseName: parsed.exerciseName ?? null,
    };
  } catch {
    // AIの分類も失敗した場合は一般質問として扱う
    return { intent: "general", confidence: 0.3, exerciseName: null };
  }
}
