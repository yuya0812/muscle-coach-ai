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

export { liff }
