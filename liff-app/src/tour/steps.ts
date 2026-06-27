export interface TourStep {
  path: string
  target: string
  title: string
  body: string
}

export const TOUR_STEPS: TourStep[] = [
  // Dashboard
  { path: '/dashboard', target: 'dashboard-summary', title: '今週・今月の状況', body: '今週のトレーニング回数と、今月のAI分析の残り回数がここに表示されます。' },
  { path: '/dashboard', target: 'dashboard-record-cta', title: 'LINEでサッと記録', body: '「ベンチプレス 60kg 10回 3セット」のようにLINEへ送るだけで記録されます。足りない情報はその場で聞き返します。' },
  { path: '/dashboard', target: 'dashboard-analysis', title: '分析サマリー', body: '伸びている種目・続けられている種目・伸び悩み・次の一歩を、記録の集計から自動でまとめます。文章での分析はLINEで「分析して」と送ると届きます。' },
  { path: '/dashboard', target: 'dashboard-milestone', title: 'マイルストーン', body: '記録を続けるほど、成長トレンド分析や、記録全体の傾向が解放されます。' },
  { path: '/dashboard', target: 'dashboard-charts', title: 'グラフで成長を見る', body: '部位別バランスと重量推移をグラフで確認できます。期間タブで表示範囲を切り替えられます。' },

  // Workout Input
  { path: '/workout-input', target: 'input-date', title: '日付を選択', body: 'まずはトレーニングを行った日を選びます。デフォルトは今日です。' },
  { path: '/workout-input', target: 'input-tags', title: 'よく使う種目', body: 'タップで素早く種目名を入力できます。リストにない種目は下のテキスト欄に直接入力してください。' },
  { path: '/workout-input', target: 'input-fields', title: '重量・回数・セット数', body: '数値を入力します。空欄の項目は記録に含まれません。' },
  { path: '/workout-input', target: 'input-save', title: '保存', body: '入力が終わったら保存。保存後はそのままAI分析にも進めます。' },

  // Workout Log
  { path: '/workout-log', target: 'log-month-nav', title: '月切替', body: '左右のボタンで月を切り替えられます。' },
  { path: '/workout-log', target: 'log-calendar', title: 'カレンダー', body: '記録のある日には緑のドットが付きます。日付をタップすると、その日の詳細が下に表示されます。' },

  // Profile
  { path: '/profile', target: 'profile-options', title: '目標・レベル・器具', body: '記録の分析をあなたに最適化するための情報です。途中でも変更できます。' },
  { path: '/profile', target: 'profile-notifications', title: '通知設定', body: '日次リマインダーと週次レポートのオン/オフを切り替えられます。' },
  { path: '/profile', target: 'profile-save', title: '設定を保存', body: '変更したら必ず保存ボタンをタップしてください。' },

  // Subscribe
  { path: '/subscribe', target: 'subscribe-plan', title: '現在のプラン', body: '今のあなたのプラン状態がここに表示されます。' },
  { path: '/subscribe', target: 'subscribe-cta', title: 'プレミアムを試す', body: '最初の1週間は無料でお試し可能。AI分析無制限・週次レポートなどが解放されます。' },

  // BottomNav (last)
  { path: '/dashboard', target: 'nav-bar', title: '画面切替はここから', body: '5つのタブで画面を切り替えられます。次回からあなた専用のホーム画面として使ってください。' },
]
