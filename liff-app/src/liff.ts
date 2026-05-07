import liff from '@line/liff'

const LIFF_ID = import.meta.env.VITE_LIFF_ID as string

export interface LiffUser {
  userId: string
  displayName: string
  pictureUrl?: string
}

let initialized = false

export async function initLiff(): Promise<void> {
  if (initialized) return
  await liff.init({ liffId: LIFF_ID })
  initialized = true

  if (!liff.isLoggedIn()) {
    liff.login()
    return
  }

  // ログイン済みでもトークンが取得できない場合は再ログイン
  if (!liff.getAccessToken()) {
    initialized = false
    liff.login()
  }
}

export async function getLiffUser(): Promise<LiffUser> {
  const profile = await liff.getProfile()
  return {
    userId: profile.userId,
    displayName: profile.displayName,
    pictureUrl: profile.pictureUrl,
  }
}

export function closeLiff(): void {
  if (liff.isInClient()) {
    liff.closeWindow()
  }
}

/**
 * LINEトークにテキストを送信したあとLIFFを閉じる。
 * `chat_message.write` スコープが必要（LINE Developers Console で有効化）。
 * スコープ未付与・送信失敗時はエラーを飲み込み、closeWindowだけ実行する。
 */
export async function sendMessageAndCloseLiff(text: string): Promise<void> {
  if (!liff.isInClient()) {
    closeLiff()
    return
  }
  try {
    await liff.sendMessages([{ type: 'text', text }])
  } catch (err) {
    console.warn('[liff.sendMessages] failed (likely scope missing):', err)
  } finally {
    closeLiff()
  }
}

export { liff }
