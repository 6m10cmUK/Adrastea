/**
 * Adrastea テーマトークン定義
 *
 * 全コンポーネントはここから色を参照する。
 * CSS Custom Properties (`var(--xxx)`) 経由なので、
 * .adrastea-root のクラスを切り替えるだけでテーマ変更可能。
 */

/** セマンティックトークン名 → CSS変数参照 */
export const theme = {
  // ── 背景 ──
  bgDeep: 'var(--ad-bg-deep)',           // 最奥（ロビー等）
  bgBase: 'var(--ad-bg-base)',           // メイン背景
  bgSurface: 'var(--ad-bg-surface)',     // カード・パネル背景
  bgToolbar: 'var(--ad-bg-toolbar)',     // ツールバー背景
  bgInput: 'var(--ad-bg-input)',         // 入力フィールド背景（凹み用）
  bgElevated: 'var(--ad-bg-elevated)',   // ドロップダウン・モーダル・ポップアップ
  bgOverlay: 'var(--ad-bg-overlay)',     // モーダルオーバーレイ背景
  bgHover: 'var(--ad-bg-hover)',         // ホバー背景

  // ── テキスト ──
  textPrimary: 'var(--ad-text-primary)',     // 主テキスト
  textSecondary: 'var(--ad-text-secondary)', // 副テキスト
  textMuted: 'var(--ad-text-muted)',         // 薄いテキスト・無効状態
  textOnAccent: 'var(--ad-text-on-accent)',  // アクセント色上のテキスト

  // ── ボーダー ──
  border: 'var(--ad-border)',               // 標準ボーダー
  borderInput: 'var(--ad-border-input)',     // 入力フィールドボーダー
  borderSubtle: 'var(--ad-border-subtle)',   // 薄いセパレーター

  // ── アクセント ──
  accent: 'var(--ad-accent)',               // プライマリアクセント（青）
  accentHover: 'var(--ad-accent-hover)',     // アクセントホバー
  accentBgSubtle: 'var(--ad-accent-bg-subtle)',       // タグチップ背景等
  accentBorderSubtle: 'var(--ad-accent-border-subtle)', // タグチップボーダー等
  accentHighlight: 'var(--ad-accent-highlight)',       // ドロップダウンハイライト
  accentGradientFrom: 'var(--ad-accent-gradient-from)', // サムネイルグラデーション開始
  accentGradientTo: 'var(--ad-accent-gradient-to)',     // サムネイルグラデーション終了

  // ── セマンティック ──
  danger: 'var(--ad-danger)',               // 削除・エラー
  dangerHover: 'var(--ad-danger-hover)',     // 削除ホバー
  dangerBgSubtle: 'var(--ad-danger-bg-subtle)', // 危険操作ボタン背景（誤操作防止）
  success: 'var(--ad-success)',             // 成功・有効
  warning: 'var(--ad-warning)',             // 警告・ハイライト

  // ── カラー ──
  green: 'var(--ad-green)',
  greenBgSubtle: 'var(--ad-green-bg-subtle)',       // ダイスシステムタグ背景
  greenBorderSubtle: 'var(--ad-green-border-subtle)', // ダイスシステムタグボーダー

  // ── ステータス ──
  statusRed: 'var(--ad-status-red)',
  statusBlue: 'var(--ad-status-blue)',
  statusGreen: 'var(--ad-status-green)',
  statusYellow: 'var(--ad-status-yellow)',

  // ── シャドウ ──
  shadowSm: 'var(--ad-shadow-sm)',             // 小さいシャドウ
  shadowMd: 'var(--ad-shadow-md)',             // 中シャドウ
  shadowLg: 'var(--ad-shadow-lg)',             // モーダル・フローティング
} as const;

export type ThemeTokens = typeof theme;
