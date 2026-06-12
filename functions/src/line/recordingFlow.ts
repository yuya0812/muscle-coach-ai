import * as admin from "firebase-admin";
import * as line from "@line/bot-sdk";
import { replyMessages, pushMessages, createWorkoutConfirmFlexMessage } from "./messages";
import {
  saveWorkoutDirectly,
  saveWorkout,
  getTotalWorkoutCount,
  Exercise,
  MissingField,
} from "../workout/recorder";
import { buildAnalysis } from "../ai/analysis";

// LINE メッセージの送信者表示名（旧トレーナーキャラ名の代わりに固定のサービス名）
const APP_SENDER_NAME = "マッスルコーチ";

/** 自然文パースの聞き返し中に保留しているレコード（離脱時は破棄され保存されない） */
interface PendingClarification {
  exercises: Exercise[];
  notes: string;
  /** 残りの質問キュー（先頭が現在の質問） */
  questions: MissingField[];
}

interface RecordingState {
  step: "category" | "exercise" | "weight" | "reps" | "sets" | "clarify";
  category?: string;
  exercise?: string;
  weight?: number | null;
  reps?: number | null;
  pending?: PendingClarification;
  updatedAt: FirebaseFirestore.Timestamp;
}

const EXERCISES_BY_CATEGORY: Record<string, string[]> = {
  "胸": ["ベンチプレス", "ダンベルフライ", "インクラインベンチ", "腕立て伏せ", "チェストプレス"],
  "背中": ["デッドリフト", "ラットプルダウン", "懸垂", "ベントオーバーロウ", "シーテッドロウ"],
  "脚": ["スクワット", "レッグプレス", "レッグカール", "レッグエクステンション", "ランジ"],
  "肩": ["ショルダープレス", "サイドレイズ", "フロントレイズ", "リアレイズ"],
  "腕": ["バイセップスカール", "ハンマーカール", "トライセップスプッシュダウン", "ディップス"],
  "腹": ["クランチ", "プランク", "レッグレイズ", "アブローラー"],
};

const db = admin.firestore;

const MILESTONES = [
  { count: 5, name: "弱点部位レポート" },
  { count: 15, name: "成長トレンド分析" },
  { count: 30, name: "プログラム最適化" },
];

/**
 * マイルストーン到達時の分析本文を生成する。
 * 旧実装は履歴JSONを丸ごとLLMに渡して自由生成させていたが、
 * 現在は analysis.ts（コード集計 + AI言語化）に委譲する。
 * 集計はコード、言語化のみAIなので「同じ記録なら同じ評価」が返る。
 */
async function generateMilestoneContent(
  userId: string,
  milestoneCount: number
): Promise<string | null> {
  try {
    return await buildAnalysis(userId, milestoneCount);
  } catch (err) {
    console.error("Milestone content generation error:", err);
    return null;
  }
}

export async function checkAndPushMilestone(userId: string): Promise<void> {
  const totalCount = await getTotalWorkoutCount(userId);
  const reached = MILESTONES.find((m) => m.count === totalCount);
  if (!reached) return;

  const achievedMsg = buildMilestoneMessage(totalCount);
  if (achievedMsg) await pushMessages(userId, [achievedMsg]);

  const content = await generateMilestoneContent(userId, totalCount);
  if (content) {
    await pushMessages(userId, [
      { type: "text", text: content, sender: { name: APP_SENDER_NAME } } as line.messagingApi.Message,
    ]);
  }
}

function buildMilestoneMessage(count: number): line.messagingApi.TextMessage | null {
  const reached = MILESTONES.find((m) => m.count === count);
  if (reached) {
    return {
      type: "text",
      text: `累計${count}回到達。「${reached.name}」をお届けします。少しお待ちください。`,
      sender: { name: APP_SENDER_NAME },
    } as line.messagingApi.TextMessage;
  }

  for (const m of MILESTONES) {
    if (count < m.count) {
      const remaining = m.count - count;
      return {
        type: "text",
        text: `累計${count}回記録達成。あと${remaining}回で「${m.name}」が届きます。`,
        sender: { name: APP_SENDER_NAME },
      } as line.messagingApi.TextMessage;
    }
  }
  return null;
}

function buildTextWithQuickReply(
  text: string,
  items: string[]
): line.messagingApi.TextMessage {
  return {
    type: "text",
    text,
    quickReply: {
      items: items.map((label) => ({
        type: "action",
        action: { type: "message", label, text: label },
      })),
    },
  };
}

export async function getRecordingState(
  userId: string
): Promise<RecordingState | null> {
  const doc = await db().collection("users").doc(userId).get();
  const data = doc.data();
  return (data?.recordingState as RecordingState) ?? null;
}

export async function setRecordingState(
  userId: string,
  state: Omit<RecordingState, "updatedAt">
): Promise<void> {
  await db()
    .collection("users")
    .doc(userId)
    .update({
      recordingState: {
        ...state,
        updatedAt: admin.firestore.Timestamp.now(),
      },
    });
}

export async function clearRecordingState(userId: string): Promise<void> {
  await db()
    .collection("users")
    .doc(userId)
    .update({
      recordingState: admin.firestore.FieldValue.delete(),
    });
}

export async function startRecordingFlow(
  userId: string,
  replyToken: string
): Promise<void> {
  await setRecordingState(userId, { step: "category" });

  const categories = Object.keys(EXERCISES_BY_CATEGORY);
  const msg = buildTextWithQuickReply("部位を選んでください", [
    ...categories,
    "キャンセル",
  ]);
  await replyMessages(replyToken, [msg]);
}

export async function handleRecordingStep(
  userId: string,
  replyToken: string,
  text: string
): Promise<boolean> {
  const state = await getRecordingState(userId);
  if (!state) return false;

  if (text === "キャンセル") {
    await clearRecordingState(userId);
    await replyMessages(replyToken, [
      { type: "text", text: "キャンセルしました" },
    ]);
    return true;
  }

  switch (state.step) {
    case "category":
      return handleCategory(userId, replyToken, text);
    case "exercise":
      return handleExercise(userId, replyToken, text, state);
    case "weight":
      return handleWeight(userId, replyToken, text, state);
    case "reps":
      return handleReps(userId, replyToken, text, state);
    case "sets":
      return handleSets(userId, replyToken, text, state);
    case "clarify":
      return handleClarifyStep(userId, replyToken, text, state);
    default:
      return false;
  }
}

// ============================================================
// 自然文パースの聞き返し（不足情報の補完）
// ============================================================

/** 1メッセージあたりの聞き返し上限。これを超える欠損は聞き返さず案内に倒す。 */
export const MAX_CLARIFY_QUESTIONS = 2;

/**
 * 聞き返しフローを開始する。保留レコードをステートに置き、最初の質問を push する。
 * （webhook の record 経路は進捗 reply で replyToken を消費済みのため push を使う）
 */
export async function startClarification(
  userId: string,
  exercises: Exercise[],
  notes: string,
  questions: MissingField[]
): Promise<void> {
  await setRecordingState(userId, {
    step: "clarify",
    pending: { exercises, notes, questions },
  });
  await pushMessages(userId, [buildClarifyQuestion(questions[0])]);
}

function buildClarifyQuestion(q: MissingField): line.messagingApi.TextMessage {
  switch (q.field) {
    case "weight":
      return buildTextWithQuickReply(
        `「${q.exerciseName}」の重量は何kgでしたか？\n数字で送ってください（例: 60）。自重ならボタンを押してください。`,
        ["自重", "キャンセル"]
      );
    case "reps":
      return buildTextWithQuickReply(`「${q.exerciseName}」は何回やりましたか？`, [
        "5回", "8回", "10回", "12回", "15回", "20回", "キャンセル",
      ]);
    case "sets":
      return buildTextWithQuickReply(`「${q.exerciseName}」は何セットやりましたか？`, [
        "1セット", "2セット", "3セット", "4セット", "5セット", "キャンセル",
      ]);
  }
}

/**
 * 聞き返しへの回答を解釈する。
 * - 解釈できた場合: weight は number | null（「自重」→ null）、reps/sets は number
 * - 解釈できない場合: undefined（= 離脱とみなして保留を破棄する）
 */
function interpretClarifyAnswer(
  field: MissingField["field"],
  text: string
): number | null | undefined {
  const trimmed = text.trim();
  if (field === "weight" && trimmed === "自重") return null;

  // 単位表記（kg/キロ/回/セット）を取り除き、純粋な数値だけを回答として受け付ける。
  // 文章中の数字（例「昨日60kgの話だけど」や新しい記録報告）を誤って回答扱いしないため。
  const stripped = trimmed.replace(/(kg|キロ|回|レップ|rep|セット|set)$/i, "").trim();
  if (!/^\d+(\.\d+)?$/.test(stripped)) return undefined;

  const n = Number(stripped);
  const max = field === "weight" ? 1000 : field === "reps" ? 1000 : 100;
  if (!Number.isFinite(n) || n <= 0 || n > max) return undefined;

  return field === "weight" ? n : Math.floor(n);
}

/**
 * 聞き返しの1ステップを処理する。
 * 回答なら保留レコードに反映し、次の質問 or 完了保存へ。
 * 回答と解釈できないメッセージなら保留を黙って破棄し false を返す
 * （webhook 側がそのメッセージを通常処理に流す。中途半端な記録は保存しない）。
 */
async function handleClarifyStep(
  userId: string,
  replyToken: string,
  text: string,
  state: RecordingState
): Promise<boolean> {
  const pending = state.pending;
  if (!pending || pending.questions.length === 0) {
    await clearRecordingState(userId);
    return false;
  }

  const q = pending.questions[0];
  const answer = interpretClarifyAnswer(q.field, text);
  if (answer === undefined) {
    // 離脱: 保留レコードを破棄（保存しない・警告も出さない）
    await clearRecordingState(userId);
    return false;
  }

  const group = pending.exercises[q.exerciseIndex]?.setGroups?.[q.groupIndex];
  if (!group) {
    await clearRecordingState(userId);
    return false;
  }
  group[q.field] = answer;

  const rest = pending.questions.slice(1);
  if (rest.length > 0) {
    await setRecordingState(userId, {
      step: "clarify",
      pending: { ...pending, questions: rest },
    });
    await replyMessages(replyToken, [buildClarifyQuestion(rest[0])]);
    return true;
  }

  // 全質問に回答済み → 保存（「記録しました」は保存成功時のみ送る）
  const { message } = await saveWorkout(userId, pending.exercises, pending.notes);
  await clearRecordingState(userId);
  await replyMessages(replyToken, [
    { type: "text", text: message, sender: { name: APP_SENDER_NAME } } as line.messagingApi.Message,
  ]);
  await checkAndPushMilestone(userId);
  return true;
}

async function handleCategory(
  userId: string,
  replyToken: string,
  text: string
): Promise<boolean> {
  const exercises = EXERCISES_BY_CATEGORY[text];
  if (!exercises) {
    const categories = Object.keys(EXERCISES_BY_CATEGORY);
    const msg = buildTextWithQuickReply("部位を選んでください", [
      ...categories,
      "キャンセル",
    ]);
    await replyMessages(replyToken, [msg]);
    return true;
  }

  await setRecordingState(userId, { step: "exercise", category: text });

  const msg = buildTextWithQuickReply(`${text}の種目を選んでください`, [
    ...exercises,
    "キャンセル",
  ]);
  await replyMessages(replyToken, [msg]);
  return true;
}

async function handleExercise(
  userId: string,
  replyToken: string,
  text: string,
  state: RecordingState
): Promise<boolean> {
  await setRecordingState(userId, {
    step: "weight",
    category: state.category,
    exercise: text,
  });

  const msg = buildTextWithQuickReply(`${text} の重量は？`, [
    "20kg",
    "30kg",
    "40kg",
    "50kg",
    "60kg",
    "70kg",
    "80kg",
    "100kg",
    "スキップ",
  ]);
  await replyMessages(replyToken, [msg]);
  return true;
}

async function handleWeight(
  userId: string,
  replyToken: string,
  text: string,
  state: RecordingState
): Promise<boolean> {
  let weight: number | null = null;
  if (text === "スキップ") {
    weight = null;
  } else {
    const parsed = parseFloat(text.replace(/kg$/i, ""));
    weight = isNaN(parsed) ? null : parsed;
  }

  await setRecordingState(userId, {
    step: "reps",
    category: state.category,
    exercise: state.exercise,
    weight,
  });

  const msg = buildTextWithQuickReply("回数は？", [
    "5回",
    "8回",
    "10回",
    "12回",
    "15回",
    "20回",
  ]);
  await replyMessages(replyToken, [msg]);
  return true;
}

async function handleReps(
  userId: string,
  replyToken: string,
  text: string,
  state: RecordingState
): Promise<boolean> {
  let reps = parseInt(text.replace(/回$/, ""), 10);
  if (isNaN(reps)) {
    reps = parseInt(text, 10);
  }
  if (isNaN(reps)) {
    const msg = buildTextWithQuickReply("回数を選んでください", [
      "5回",
      "8回",
      "10回",
      "12回",
      "15回",
      "20回",
    ]);
    await replyMessages(replyToken, [msg]);
    return true;
  }

  await setRecordingState(userId, {
    step: "sets",
    category: state.category,
    exercise: state.exercise,
    weight: state.weight,
    reps,
  });

  const msg = buildTextWithQuickReply("セット数は？", [
    "1セット",
    "2セット",
    "3セット",
    "4セット",
    "5セット",
  ]);
  await replyMessages(replyToken, [msg]);
  return true;
}

async function handleSets(
  userId: string,
  replyToken: string,
  text: string,
  state: RecordingState
): Promise<boolean> {
  let sets = parseInt(text.replace(/セット$/, ""), 10);
  if (isNaN(sets)) {
    sets = parseInt(text, 10);
  }
  if (isNaN(sets)) {
    const msg = buildTextWithQuickReply("セット数を選んでください", [
      "1セット",
      "2セット",
      "3セット",
      "4セット",
      "5セット",
    ]);
    await replyMessages(replyToken, [msg]);
    return true;
  }

  const exercise: Exercise = {
    name: state.exercise!,
    setGroups: [
      {
        weight: state.weight ?? null,
        reps: state.reps ?? null,
        sets,
      },
    ],
  };

  await saveWorkoutDirectly(userId, [exercise]);
  await clearRecordingState(userId);

  const g = exercise.setGroups[0];
  const parts = [exercise.name];
  if (g.weight) parts.push(`${g.weight}kg`);
  if (g.reps) parts.push(`${g.reps}回`);
  if (g.sets) parts.push(`${g.sets}セット`);
  const summary = parts.join(" ");

  const confirmMsg = createWorkoutConfirmFlexMessage(summary);
  const continueMsg: line.messagingApi.TextMessage = {
    type: "text",
    text: "もう1種目記録しますか？",
    sender: { name: APP_SENDER_NAME } as Record<string, unknown>,
    quickReply: {
      items: [
        { type: "action", action: { type: "message", label: "はい", text: "記録" } },
        { type: "action", action: { type: "message", label: "終わり", text: "終わり" } },
      ],
    },
  } as line.messagingApi.TextMessage;

  const messages: line.messagingApi.Message[] = [confirmMsg, continueMsg];

  // マイルストーンチェック
  const totalCount = await getTotalWorkoutCount(userId);
  const milestoneMsg = buildMilestoneMessage(totalCount);
  if (milestoneMsg) messages.push(milestoneMsg);

  await pushMessages(userId, messages);

  // マイルストーン達成時はAI分析コンテンツを生成して追送
  const reachedMilestone = MILESTONES.find((m) => m.count === totalCount);
  if (reachedMilestone) {
    const content = await generateMilestoneContent(userId, totalCount);
    if (content) {
      await pushMessages(userId, [
        { type: "text", text: content, sender: { name: APP_SENDER_NAME } } as line.messagingApi.Message,
      ]);
    }
  }

  return true;
}
