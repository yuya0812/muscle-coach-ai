import * as line from "@line/bot-sdk";

function getLineClient(): line.messagingApi.MessagingApiClient {
  const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!channelAccessToken) {
    throw new Error("LINE_CHANNEL_ACCESS_TOKEN is not set");
  }
  return new line.messagingApi.MessagingApiClient({ channelAccessToken });
}

export async function replyText(
  replyToken: string,
  text: string
): Promise<void> {
  const client = getLineClient();
  await client.replyMessage({
    replyToken,
    messages: [{ type: "text", text }],
  });
}

export async function replyMessages(
  replyToken: string,
  messages: line.messagingApi.Message[]
): Promise<void> {
  const client = getLineClient();
  await client.replyMessage({ replyToken, messages });
}

export async function pushText(userId: string, text: string): Promise<void> {
  const client = getLineClient();
  await client.pushMessage({
    to: userId,
    messages: [{ type: "text", text }],
  });
}

export async function pushMessages(
  userId: string,
  messages: line.messagingApi.Message[]
): Promise<void> {
  const client = getLineClient();
  await client.pushMessage({ to: userId, messages });
}

export function createMenuFlexMessage(): line.messagingApi.FlexMessage {
  const liffId = process.env.LIFF_ID;
  const liffUrl = liffId ? `https://liff.line.me/${liffId}` : null;

  const aiButtons: line.messagingApi.FlexComponent[] = [
    createMenuButton("トレーニングを記録する", "記録"),
    createMenuButton("記録を分析する", "分析"),
    createMenuButton("記録の履歴を見る", "履歴"),
  ];

  if (liffUrl) {
    aiButtons.push({
      type: "box",
      layout: "vertical",
      contents: [
        {
          type: "button",
          action: {
            type: "uri",
            label: "アプリで記録・管理する",
            uri: liffUrl,
          },
          style: "secondary",
          height: "sm",
        },
      ],
    });
  }

  return {
    type: "flex",
    altText: "メニュー",
    contents: {
      type: "bubble",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#1DB446",
        contents: [
          {
            type: "text",
            text: "マッスルコーチ",
            weight: "bold",
            size: "lg",
            color: "#ffffff",
          },
          {
            type: "text",
            text: "記録して、分析する",
            size: "xs",
            color: "#d4f5d4",
            margin: "xs",
          },
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "md",
        contents: aiButtons,
      },
    },
  };
}

function createMenuButton(
  label: string,
  text: string
): line.messagingApi.FlexBox {
  return {
    type: "box",
    layout: "vertical",
    contents: [
      {
        type: "button",
        action: {
          type: "message",
          label,
          text,
        },
        style: "primary",
        color: "#1DB446",
        height: "sm",
      },
    ],
  };
}

export function createWelcomeMessages(liffId: string | undefined): line.messagingApi.Message[] {
  const liffUrl = liffId ? `https://liff.line.me/${liffId}` : null;

  const bubbleContents: line.messagingApi.FlexComponent[] = [
    {
      type: "text",
      text: "このLINEでできること",
      weight: "bold",
      size: "md",
      color: "#1DB446",
    },
    {
      type: "separator",
      margin: "sm",
    },
    {
      type: "box",
      layout: "vertical",
      margin: "md",
      spacing: "sm",
      contents: [
        createFeatureRow("記録", "雑に送るだけで記録", "「ベンチ60kg 10回 3セット」のように送るだけ"),
        createFeatureRow("補完", "足りない情報は聞き返し", "回数やセット数が抜けてもその場で確認"),
        createFeatureRow("分析", "AIが伸び・継続を言語化", "たまった記録を集計して言葉でまとめる"),
      ],
    },
    {
      type: "separator",
      margin: "md",
    },
    {
      type: "text",
      text: "記録・管理はアプリで",
      weight: "bold",
      size: "sm",
      margin: "md",
    },
    {
      type: "text",
      text: "トレーニングの記録入力・履歴確認・プロフィール設定はアプリから行えます。",
      size: "xs",
      color: "#888888",
      wrap: true,
      margin: "xs",
    },
  ];

  if (liffUrl) {
    bubbleContents.push({
      type: "button",
      action: {
        type: "uri",
        label: "アプリを開く",
        uri: liffUrl,
      },
      style: "secondary",
      margin: "md",
      height: "sm",
    });
  }

  const flexMessage: line.messagingApi.FlexMessage = {
    type: "flex",
    altText: "マッスルコーチへようこそ",
    contents: {
      type: "bubble",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#1DB446",
        contents: [
          {
            type: "text",
            text: "マッスルコーチへようこそ",
            weight: "bold",
            size: "md",
            color: "#ffffff",
          },
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        contents: bubbleContents,
      },
    },
  };

  return [
    {
      type: "text",
      text: "はじめまして、マッスルコーチです。\n\nトレーニングはこのLINEに雑に送るだけで記録できます。「ベンチプレス 60kg 10回 3セット」のように送ってみてください。\n\n記録がたまったら「分析」と送ると、伸びている種目や続けられている種目をまとめます。",
    },
    flexMessage,
  ];
}

function createFeatureRow(
  tag: string,
  title: string,
  desc: string
): line.messagingApi.FlexBox {
  return {
    type: "box",
    layout: "horizontal",
    spacing: "sm",
    contents: [
      {
        type: "text",
        text: tag,
        size: "xxs",
        weight: "bold",
        color: "#1DB446",
        flex: 0,
      },
      {
        type: "box",
        layout: "vertical",
        flex: 1,
        contents: [
          {
            type: "text",
            text: title,
            size: "sm",
            weight: "bold",
          },
          {
            type: "text",
            text: desc,
            size: "xxs",
            color: "#888888",
            wrap: true,
          },
        ],
      },
    ],
  };
}

export function createWorkoutConfirmFlexMessage(
  summary: string
): line.messagingApi.FlexMessage {
  return {
    type: "flex",
    altText: "トレーニング記録完了",
    contents: {
      type: "bubble",
      header: {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "text",
            text: "記録完了",
            weight: "bold",
            size: "lg",
            color: "#1DB446",
          },
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "text",
            text: summary,
            wrap: true,
            size: "sm",
          },
        ],
      },
    },
  };
}
