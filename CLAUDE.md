# Adrastea — プロジェクト固有の指示

## プロジェクト概要

TRPGオンラインセッション支援ツール。React 19 + Supabase + Cloudflare Workers。

## アーキテクチャ

- **フロントエンド**: React 19 + TypeScript + Vite。SPA (`appType: 'spa'`)
- **状態管理**: AdrasteaContext (God Context) が Room 内の全状態を集約。hooks/ に分離されたカスタムフック群が実際のロジックを持つ
- **盤面**: Konva.js (react-konva)。LayerPanel でレイヤー管理、BoardPanel で描画
- **UI レイアウト**: dockview でパネル自由配置。dock-panels/ にラッパー実装
- **認証**: Supabase Auth (Google OAuth)。AuthContext で管理
- **DB**: Supabase PostgreSQL + Realtime。useSupabaseQuery でリアルタイム同期
- **アセット**: Cloudflare R2。Worker (adrastea-r2-proxy) 経由でアップロード/配信
- **Worker**: Cloudflare Workers + D1。チャット永続化、R2 プロキシ、ルーム管理 API

## ディレクトリ構成

```
src/
├── pages/          Adrastea (メイン), AdrasteaDemo, AdrasteaAdmin
├── components/     UIコンポーネント（30+）
│   ├── dock-panels/  dockview パネルラッパー
│   └── ui/           共通UIパーツ (AdButton, AdModal, AdInput 等)
├── contexts/       AdrasteaContext, AuthContext, MockAdrasteaProvider 等
├── hooks/          カスタムフック群 (useScenes, useCharacters, useAdrasteaChat 等)
├── services/       supabase, diceRoller, assetService, layoutStorage 等
├── types/          型定義
├── styles/         theme.ts (CSS変数ベースのテーマトークン)
├── config/         permissions, dockPanelRegistry
└── utils/          ユーティリティ
worker/             Cloudflare Worker (adrastea-r2-proxy)
supabase/           Supabase ローカル設定 + migrations
```

## 開発ルール

### ビルド・テスト

```bash
npm install --legacy-peer-deps   # react-helmet-async の peer dep 問題あり
npm run build                    # vite build
npm run test                     # vitest
npx tsc -b                       # 型チェック
```

### スタイリング

- CSS変数ベースのテーマシステム。`src/styles/theme.ts` のトークンを使う
- インラインスタイル中心（Tailwind も一部使用）
- 色はハードコードせず `theme.xxx` を参照

### コンポーネント設計

- 共通UIは `src/components/ui/AdComponents.tsx` に集約 (AdButton, AdInput, AdModal, ConfirmModal 等)
- パネルは `src/components/dock-panels/` に dockview ラッパーとして実装
- 新パネル追加時は `src/config/dockPanelRegistry.ts` にも登録

### デモモード

- `VITE_PUBLIC_MODE=demo` でデモモード有効
- `MockAdrasteaProvider` がモックデータを提供（Supabase 不要）
- デモモードでは `/demo` 以外は 404 にリダイレクト

### バージョン管理

- `package.json` の `version` が正本。Vite ビルド時に `__APP_VERSION__` として注入
- `src/config/adrastea.ts` の `ADRASTEA_VERSION` が自動取得。手動編集不要
- セマンティックバージョニング: 破壊的変更=major、機能追加=minor、バグ修正=patch
- バージョンアップは `npm version patch/minor/major` で行う

### ブランチ・PR

- `develop` ブランチで開発、`main` へ PR でマージ
- タグ push でデプロイ（`npm version` がタグも自動作成）

### デプロイ

- Cloudflare Pages。GitHub Actions でタグ push 時にデプロイ
- タグ名に `demo` を含むとデモモードでビルド
- SPA フォールバックは `public/_redirects` で制御

### ローカル開発

- `./scripts/dev-local.sh` で Supabase + Worker + Vite を一括起動
- Worker は `.dev.vars` でローカル Supabase を参照
- Google OAuth のローカル動作には `supabase/.env` に クライアントID/シークレット、GCP Console にリダイレクトURI登録が必要
- Supabase ローカルと他プロジェクトの Supabase は同じポートを使うため同時起動不可
