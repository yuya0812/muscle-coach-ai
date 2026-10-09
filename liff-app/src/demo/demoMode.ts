// ポートフォリオ公開用のデモモード。
// /demo で開くと LINE ログインを経由せず、サンプルデータで本体の画面を操作できる。
// フラグはタブ単位（sessionStorage）で保持し、通常利用のユーザーには影響しない。

const DEMO_FLAG = 'demo_mode'

export const DEMO_USER_ID = 'demo-user'

// デモでは課金・個人ステータスに関わる画面を出さない（動きを見せることが目的のため）
export const DEMO_HIDDEN_PATHS = ['/profile', '/subscribe']

let demo: boolean | null = null

function readFlag(): boolean {
  try {
    return sessionStorage.getItem(DEMO_FLAG) === '1'
  } catch {
    return false
  }
}

/**
 * アプリ起動時に1回だけ呼ぶ。/demo への直アクセスならフラグを立てて /dashboard に置き換える。
 * BrowserRouter の初期化より前に URL を書き換える必要があるため、App のレンダリング前に実行する。
 */
export function bootstrapDemoMode(): void {
  if (window.location.pathname === '/demo') {
    demo = true
    try {
      sessionStorage.setItem(DEMO_FLAG, '1')
    } catch {
      // sessionStorage が使えない環境でも、このページ表示中はデモとして動かす
    }
    try {
      // デモ利用者は規約同意・オンボーディングを済ませた状態から始める
      localStorage.setItem(`onboarded_${DEMO_USER_ID}`, 'true')
    } catch {
      // 保存できなくてもオンボーディング画面から始まるだけで動作に支障はない
    }
    window.history.replaceState(null, '', '/dashboard')
    return
  }
  demo = readFlag()
}

export function isDemoMode(): boolean {
  // bootstrapDemoMode より先に評価されるモジュール（ツアー定義など）からも呼べるよう遅延評価する
  if (demo === null) demo = window.location.pathname === '/demo' || readFlag()
  return demo
}
