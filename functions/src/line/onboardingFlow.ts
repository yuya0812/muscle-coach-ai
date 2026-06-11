import * as admin from "firebase-admin";
import * as line from "@line/bot-sdk";
import { replyMessages, pushMessages } from "./messages";
import { updateUserProfile } from "../user/manager";

// LINE メッセージの送信者表示名（旧トレーナーキャラ名は廃止）
const APP_SENDER_NAME = "マッスルコーチ";

type OnboardingStep =
  | "nickname"
  | "goal"
  | "height"
  | "weight"
  | "frequency"
  | "confirm";

interface OnboardingState {
  step: OnboardingStep;
  editingFromConfirm?: boolean;
  nickname?: string;
  goal?: string;
  heightRange?: string;
  weightRange?: string;
  frequency?: string;
}

const STEP_ORDER: OnboardingStep[] = [
  "nickname",
  "goal",
  "height",
  "weight",
  "frequency",
  "confirm",
];

const db = admin.firestore;

function buildQuickReply(
  text: string,
  items: string[],
  sender?: { name: string }
): line.messagingApi.TextMessage {
  const msg: Record<string, unknown> = {
    type: "text",
    text,
    quickReply: {
      items: items.map((label) => ({
        type: "action",
        action: { type: "message", label, text: label },
      })),
    },
  };
  if (sender) msg.sender = sender;
  return msg as line.messagingApi.TextMessage;
}

function buildText(text: string, sender?: { name: string }): line.messagingApi.TextMessage {
  const msg: Record<string, unknown> = { type: "text", text };
  if (sender) msg.sender = sender;
  return msg as line.messagingApi.TextMessage;
}

async function getOnboardingState(userId: string): Promise<OnboardingState | null> {
  const doc = await db().collection("users").doc(userId).get();
  return (doc.data()?.onboardingState as OnboardingState) ?? null;
}

async function setOnboardingState(userId: string, state: OnboardingState): Promise<void> {
  await db().collection("users").doc(userId).update({ onboardingState: state });
}

async function clearOnboardingState(userId: string): Promise<void> {
  await db()
    .collection("users")
    .doc(userId)
    .update({ onboardingState: admin.firestore.FieldValue.delete() });
}

function getSender(_state: OnboardingState): { name: string } {
  return { name: APP_SENDER_NAME };
}

// editingFromConfirm時: step="confirm"として保存しconfirmカードを返す
async function finishEditAndConfirm(
  userId: string,
  replyToken: string,
  state: OnboardingState
): Promise<boolean> {
  const confirmState: OnboardingState = { ...state, step: "confirm", editingFromConfirm: false };
  await setOnboardingState(userId, confirmState);
  await sendConfirmCard(userId, replyToken, confirmState);
  return true;
}

export async function isInOnboarding(userId: string): Promise<boolean> {
  const state = await getOnboardingState(userId);
  return state !== null;
}

export async function startOnboarding(userId: string, replyToken: string): Promise<void> {
  await setOnboardingState(userId, { step: "nickname" });
  const msg = buildText(
    "マッスルコーチへようこそ。まずプロフィールを教えてください。\n\n" +
      "ニックネームを教えてください（1/5）\n例：たろう、田中さん など",
    { name: APP_SENDER_NAME }
  );
  await replyMessages(replyToken, [msg]);
}

export async function handleOnboardingStep(
  userId: string,
  replyToken: string,
  text: string
): Promise<boolean> {
  const state = await getOnboardingState(userId);
  if (!state) return false;

  if (text === "やり直し" || text === "戻る") {
    return handleGoBack(userId, replyToken, state);
  }

  switch (state.step) {
    case "nickname":     return handleNickname(userId, replyToken, text, state);
    case "goal":         return handleGoal(userId, replyToken, text, state);
    case "height":       return handleHeight(userId, replyToken, text, state);
    case "weight":       return handleWeight(userId, replyToken, text, state);
    case "frequency":    return handleFrequency(userId, replyToken, text, state);
    case "confirm":      return handleConfirm(userId, replyToken, text, state);
    default:             return false;
  }
}

async function handleGoBack(
  userId: string,
  replyToken: string,
  state: OnboardingState
): Promise<boolean> {
  const idx = STEP_ORDER.indexOf(state.step);
  if (idx <= 0) {
    await replyMessages(replyToken, [
      buildText("最初のステップです。そのまま続けましょう！", getSender(state)),
    ]);
    return true;
  }
  const prevStep = STEP_ORDER[idx - 1];
  const newState: OnboardingState = { ...state, step: prevStep };
  await setOnboardingState(userId, newState);
  await sendStepQuestion(replyToken, newState);
  return true;
}

async function sendStepQuestion(
  replyToken: string,
  state: OnboardingState
): Promise<void> {
  const sender = getSender(state);
  const stepNum = STEP_ORDER.indexOf(state.step) + 1;
  const total = 5;

  switch (state.step) {
    case "nickname":
      await replyMessages(replyToken, [
        buildText(`ニックネームを教えてください！（${stepNum}/${total}）`, sender),
      ]);
      break;
    case "goal":
      await replyMessages(replyToken, [
        buildQuickReply(
          `目標は何ですか？（${stepNum}/${total}）`,
          ["筋肥大", "引き締め", "体力向上"],
          sender
        ),
      ]);
      break;
    case "height":
      await replyMessages(replyToken, [
        buildQuickReply(
          `身長を教えてください（${stepNum}/${total}）`,
          ["〜160cm", "160-170cm", "170-180cm", "180cm〜"],
          sender
        ),
      ]);
      break;
    case "weight":
      await replyMessages(replyToken, [
        buildQuickReply(
          `体重を教えてください（${stepNum}/${total}）`,
          ["〜60kg", "60-70kg", "70-80kg", "80kg〜"],
          sender
        ),
      ]);
      break;
    case "frequency":
      await replyMessages(replyToken, [
        buildQuickReply(
          `週何回トレーニングできますか？（${stepNum}/${total}）`,
          ["週1-2回", "週3-4回", "週5回+"],
          sender
        ),
      ]);
      break;
  }
}

async function handleNickname(
  userId: string, replyToken: string, text: string, state: OnboardingState
): Promise<boolean> {
  const nickname = text.trim().slice(0, 20);
  const newState: OnboardingState = { ...state, nickname };

  if (state.editingFromConfirm) return finishEditAndConfirm(userId, replyToken, newState);

  const savedState: OnboardingState = { ...newState, step: "goal" };
  await setOnboardingState(userId, savedState);
  await replyMessages(replyToken, [
    buildQuickReply(
      `${nickname}さんですね。\n\n目標は何ですか？（2/5）`,
      ["筋肥大", "引き締め", "体力向上"],
      getSender(savedState)
    ),
  ]);
  return true;
}

async function handleGoal(
  userId: string, replyToken: string, text: string, state: OnboardingState
): Promise<boolean> {
  let goal: string;
  if (text.includes("筋肥大"))    goal = "muscle";
  else if (text.includes("引き締め")) goal = "slim";
  else if (text.includes("体力")) goal = "fitness";
  else {
    await replyMessages(replyToken, [
      buildQuickReply("目標を選んでください（2/5）", ["筋肥大", "引き締め", "体力向上"], getSender(state)),
    ]);
    return true;
  }

  const newState: OnboardingState = { ...state, goal };

  if (state.editingFromConfirm) return finishEditAndConfirm(userId, replyToken, newState);

  const savedState: OnboardingState = { ...newState, step: "height" };
  await setOnboardingState(userId, savedState);
  await replyMessages(replyToken, [
    buildQuickReply(
      "身長を教えてください（3/5）",
      ["〜160cm", "160-170cm", "170-180cm", "180cm〜"],
      getSender(savedState)
    ),
  ]);
  return true;
}

async function handleHeight(
  userId: string, replyToken: string, text: string, state: OnboardingState
): Promise<boolean> {
  const valid = ["〜160cm", "160-170cm", "170-180cm", "180cm〜"];
  if (!valid.includes(text)) {
    await replyMessages(replyToken, [buildQuickReply("身長を選んでください（3/5）", valid, getSender(state))]);
    return true;
  }

  const newState: OnboardingState = { ...state, heightRange: text };

  if (state.editingFromConfirm) return finishEditAndConfirm(userId, replyToken, newState);

  const savedState: OnboardingState = { ...newState, step: "weight" };
  await setOnboardingState(userId, savedState);
  await replyMessages(replyToken, [
    buildQuickReply(
      "体重を教えてください（4/5）",
      ["〜60kg", "60-70kg", "70-80kg", "80kg〜"],
      getSender(savedState)
    ),
  ]);
  return true;
}

async function handleWeight(
  userId: string, replyToken: string, text: string, state: OnboardingState
): Promise<boolean> {
  const valid = ["〜60kg", "60-70kg", "70-80kg", "80kg〜"];
  if (!valid.includes(text)) {
    await replyMessages(replyToken, [buildQuickReply("体重を選んでください（4/5）", valid, getSender(state))]);
    return true;
  }

  const newState: OnboardingState = { ...state, weightRange: text };

  if (state.editingFromConfirm) return finishEditAndConfirm(userId, replyToken, newState);

  const savedState: OnboardingState = { ...newState, step: "frequency" };
  await setOnboardingState(userId, savedState);
  await replyMessages(replyToken, [
    buildQuickReply(
      "週何回トレーニングできますか？（5/5）",
      ["週1-2回", "週3-4回", "週5回+"],
      getSender(savedState)
    ),
  ]);
  return true;
}

async function handleFrequency(
  userId: string, replyToken: string, text: string, state: OnboardingState
): Promise<boolean> {
  const valid = ["週1-2回", "週3-4回", "週5回+"];
  if (!valid.includes(text)) {
    await replyMessages(replyToken, [buildQuickReply("頻度を選んでください（5/5）", valid, getSender(state))]);
    return true;
  }

  const savedState: OnboardingState = { ...state, step: "confirm", frequency: text };
  await setOnboardingState(userId, savedState);
  await sendConfirmCard(userId, replyToken, savedState);
  return true;
}

async function sendConfirmCard(
  userId: string,
  replyToken: string,
  state: OnboardingState
): Promise<void> {
  const goalLabel =
    state.goal === "muscle" ? "筋肥大" :
    state.goal === "slim"   ? "引き締め" : "体力向上";

  const confirmFlex: line.messagingApi.FlexMessage = {
    type: "flex",
    altText: "設定内容の確認",
    contents: {
      type: "bubble",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#1DB446",
        contents: [{ type: "text", text: "設定内容の確認", weight: "bold", color: "#ffffff", size: "md" }],
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        contents: [
          buildConfirmRow("ニックネーム", state.nickname ?? ""),
          buildConfirmRow("目標", goalLabel),
          buildConfirmRow("身長", state.heightRange ?? ""),
          buildConfirmRow("体重", state.weightRange ?? ""),
          buildConfirmRow("頻度", state.frequency ?? ""),
        ],
      },
      footer: {
        type: "box",
        layout: "horizontal",
        spacing: "sm",
        contents: [
          {
            type: "button",
            action: { type: "message", label: "始める！", text: "この内容で始める" },
            style: "primary",
            color: "#1DB446",
          },
          {
            type: "button",
            action: { type: "message", label: "修正する", text: "修正する" },
            style: "secondary",
          },
        ],
      },
    },
  };

  await replyMessages(replyToken, [confirmFlex]);
}

function buildConfirmRow(label: string, value: string): line.messagingApi.FlexBox {
  return {
    type: "box",
    layout: "horizontal",
    contents: [
      { type: "text", text: label, size: "sm", color: "#888888", flex: 2 },
      { type: "text", text: value, size: "sm", flex: 3, weight: "bold" },
    ],
  };
}

async function handleConfirm(
  userId: string, replyToken: string, text: string, state: OnboardingState
): Promise<boolean> {
  if (text === "修正する") {
    await replyMessages(replyToken, [
      buildQuickReply(
        "どの項目を修正しますか？",
        ["ニックネーム", "目標", "身長", "体重", "頻度"],
        getSender(state)
      ),
    ]);
    return true;
  }

  const editMap: Record<string, OnboardingStep> = {
    ニックネーム: "nickname",
    目標: "goal",
    身長: "height",
    体重: "weight",
    頻度: "frequency",
  };
  if (editMap[text]) {
    const editState: OnboardingState = { ...state, step: editMap[text], editingFromConfirm: true };
    await setOnboardingState(userId, editState);
    await sendStepQuestion(replyToken, editState);
    return true;
  }

  if (text !== "この内容で始める") {
    await sendConfirmCard(userId, replyToken, state);
    return true;
  }

  // 完了処理
  const freqMap: Record<string, number> = { "週1-2回": 2, "週3-4回": 3, "週5回+": 5 };
  const goalMap: Record<string, string> = { muscle: "筋肥大", slim: "引き締め", fitness: "体力向上" };

  await updateUserProfile(userId, {
    name: state.nickname ?? "ユーザー",
    goal: goalMap[state.goal ?? ""] ?? state.goal ?? "",
    level: "beginner",
    equipment: "",
    frequency: freqMap[state.frequency ?? "週3-4回"] ?? 3,
    heightRange: state.heightRange ?? "",
    weightRange: state.weightRange ?? "",
  });
  await clearOnboardingState(userId);

  const sender = { name: APP_SENDER_NAME };

  await replyMessages(replyToken, [
    buildText(
      `設定が完了しました。${state.nickname}さん、ここから一緒に積み上げていきましょう。`,
      sender
    ),
  ]);

  // 方針転換後: 初回メニュー生成は廃止。記録の使い方を案内する。
  await pushMessages(userId, [{
    type: "text",
    text:
      "さっそく今日のトレーニングを記録してみましょう。\n\n" +
      "・ベンチプレス 60kg 10回 3セット\n" +
      "・今日はスクワット80キロ5回を3セット\n\n" +
      "このように送るだけで記録できます。\n" +
      "記録がたまったら「分析して」と送ると、部位のバランスや伸びている種目をまとめます。",
    sender,
  } as line.messagingApi.Message]);

  return true;
}
