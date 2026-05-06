import axios from "axios";
import sharp from "sharp";

const LINE_API = "https://api.line.me/v2/bot";
const LINE_DATA_API = "https://api-data.line.me/v2/bot";

function getJsonHeaders() {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) throw new Error("LINE_CHANNEL_ACCESS_TOKEN not set");
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

function getImageHeaders() {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) throw new Error("LINE_CHANNEL_ACCESS_TOKEN not set");
  return { Authorization: `Bearer ${token}`, "Content-Type": "image/png" };
}

/**
 * リッチメニュー用画像をSVGから生成してPNGバッファとして返す
 * 2500x843px: 2列×2行の4ボタン構成
 */
async function generateRichMenuImage(): Promise<Buffer> {
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="2500" height="843" xmlns="http://www.w3.org/2000/svg">

  <!-- Dashboard (top-left) - Primary Green -->
  <rect x="0" y="0" width="1250" height="421" fill="#06C755"/>
  <!-- Bar chart icon -->
  <rect x="450" y="210" width="65" height="105" rx="6" fill="rgba(255,255,255,0.9)"/>
  <rect x="535" y="160" width="65" height="155" rx="6" fill="rgba(255,255,255,0.9)"/>
  <rect x="620" y="115" width="65" height="200" rx="6" fill="rgba(255,255,255,0.9)"/>
  <rect x="705" y="175" width="65" height="140" rx="6" fill="rgba(255,255,255,0.9)"/>
  <line x1="430" y1="315" x2="800" y2="315" stroke="white" stroke-width="8" stroke-linecap="round"/>
  <!-- Label -->
  <text x="625" y="388" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="52" fill="white" font-weight="bold">Dashboard</text>

  <!-- Workout Log (top-right) - Dark Green -->
  <rect x="1250" y="0" width="1250" height="421" fill="#04a847"/>
  <!-- Calendar icon -->
  <rect x="1695" y="125" width="225" height="200" rx="14" fill="rgba(255,255,255,0.95)"/>
  <rect x="1695" y="125" width="225" height="62" rx="14" fill="rgba(0,0,0,0.18)"/>
  <rect x="1730" y="100" width="24" height="56" rx="8" fill="white"/>
  <rect x="1871" y="100" width="24" height="56" rx="8" fill="white"/>
  <rect x="1714" y="215" width="30" height="28" rx="4" fill="#04a847"/>
  <rect x="1758" y="215" width="30" height="28" rx="4" fill="#04a847"/>
  <rect x="1802" y="215" width="30" height="28" rx="4" fill="#04a847"/>
  <rect x="1846" y="215" width="30" height="28" rx="4" fill="#04a847"/>
  <rect x="1714" y="260" width="30" height="28" rx="4" fill="#04a847"/>
  <rect x="1758" y="260" width="30" height="28" rx="4" fill="#04a847"/>
  <rect x="1802" y="260" width="30" height="28" rx="4" fill="#04a847"/>
  <!-- Label -->
  <text x="1875" y="388" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="52" fill="white" font-weight="bold">Workout Log</text>

  <!-- Profile (bottom-left) - Blue -->
  <rect x="0" y="421" width="1250" height="422" fill="#2196F3"/>
  <!-- Person icon -->
  <circle cx="625" cy="570" r="78" fill="rgba(255,255,255,0.95)"/>
  <path d="M 420 810 Q 425 695 625 695 Q 825 695 830 810 Z" fill="rgba(255,255,255,0.95)"/>
  <!-- Label -->
  <text x="625" y="835" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="52" fill="white" font-weight="bold">Profile</text>

  <!-- Premium Plan (bottom-right) - Orange -->
  <rect x="1250" y="421" width="1250" height="422" fill="#FF9800"/>
  <!-- Crown icon -->
  <polygon points="1875,505 1915,615 2015,615 1935,672 1965,782 1875,722 1785,782 1815,672 1735,615 1835,615" fill="rgba(255,255,255,0.95)"/>
  <!-- Label -->
  <text x="1875" y="835" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="52" fill="white" font-weight="bold">Premium Plan</text>

  <!-- Divider lines -->
  <line x1="1250" y1="0" x2="1250" y2="843" stroke="white" stroke-width="5"/>
  <line x1="0" y1="421" x2="2500" y2="421" stroke="white" stroke-width="5"/>
</svg>`;

  return sharp(Buffer.from(svg)).png().toBuffer();
}

export async function createAndSetDefaultRichMenu(): Promise<string> {
  const liffId = process.env.LIFF_ID;
  if (!liffId) throw new Error("LIFF_ID not set");
  const liffBase = `https://liff.line.me/${liffId}`;

  // 1. 既存のデフォルトリッチメニューを削除
  try {
    const existing = await axios.get(`${LINE_API}/user/all/richmenu`, { headers: getJsonHeaders() });
    if (existing.data?.richMenuId) {
      await axios.delete(`${LINE_API}/richmenu/${existing.data.richMenuId}`, { headers: getJsonHeaders() });
    }
  } catch { /* 既存メニューなければスキップ */ }

  // 2. リッチメニュー作成（レイアウト定義）
  const menuRes = await axios.post(`${LINE_API}/richmenu`, {
    size: { width: 2500, height: 843 },
    selected: true,
    name: "Muscle Coach Menu",
    chatBarText: "メニューを開く",
    areas: [
      { bounds: { x: 0, y: 0, width: 1250, height: 421 }, action: { type: "uri", label: "ダッシュボード", uri: `${liffBase}/dashboard` } },
      { bounds: { x: 1250, y: 0, width: 1250, height: 421 }, action: { type: "uri", label: "トレーニング記録", uri: `${liffBase}/workout-log` } },
      { bounds: { x: 0, y: 421, width: 1250, height: 422 }, action: { type: "uri", label: "プロフィール", uri: `${liffBase}/profile` } },
      { bounds: { x: 1250, y: 421, width: 1250, height: 422 }, action: { type: "uri", label: "プランを見る", uri: `${liffBase}/subscribe` } },
    ],
  }, { headers: getJsonHeaders() });

  const richMenuId = menuRes.data.richMenuId;

  // 3. 画像生成 → アップロード
  const pngBuffer = await generateRichMenuImage();
  await axios.post(
    `${LINE_DATA_API}/richmenu/${richMenuId}/content`,
    pngBuffer,
    { headers: getImageHeaders(), maxBodyLength: Infinity }
  );

  // 4. 全ユーザーのデフォルトとして設定
  await axios.post(`${LINE_API}/user/all/richmenu/${richMenuId}`, {}, { headers: getJsonHeaders() });

  return richMenuId;
}
