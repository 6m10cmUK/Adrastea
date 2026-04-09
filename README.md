# Adrastea

TRPG オンラインセッション支援ツール。リアルタイムの盤面共有、チャット、ダイスロール、BGM再生などセッションに必要な機能を一つの画面に統合しています。

**Demo**: https://adrastea.app/demo

## 主な機能

- **2D盤面** — Konva.js による自由配置キャンバス。マップ・トークン・立ち絵をレイヤー管理
- **シーン管理** — 複数シーンを作成・切り替え。シーンごとにマップや配置を保持
- **チャット** — チャンネル対応チャット。ダイスロール（BCDice互換）を内蔵
- **キャラクター** — ステータス・立ち絵・メモを管理。盤面上にトークンとして配置可能
- **BGM / カットイン** — シーンに紐づくBGM再生、演出用カットイン表示
- **シナリオテキスト** — Markdown エディタでシナリオやハンドアウトを共有
- **PDF ビューア** — セッション中にルールブック等を参照
- **パネルレイアウト** — dockview によるパネル自由配置。レイアウトの保存・復元対応

## 技術スタック

| レイヤー | 技術 |
|---------|------|
| フロントエンド | React 19, TypeScript, Vite |
| キャンバス | Konva.js (react-konva) |
| UI | dockview, @dnd-kit, Tailwind CSS |
| 認証 / DB / Realtime | Supabase (Auth, PostgreSQL, Realtime) |
| ストレージ | Cloudflare R2 |
| API / Proxy | Cloudflare Workers + D1 |
| ホスティング | Cloudflare Pages |

## ローカル開発

### 前提条件

- Node.js 20+
- Docker (Supabase ローカル用)
- [Supabase CLI](https://supabase.com/docs/guides/cli)
- [Wrangler](https://developers.cloudflare.com/workers/wrangler/)

### セットアップ

```bash
# 依存インストール
npm install --legacy-peer-deps

# 初回セットアップ（Supabase ローカル起動 + DB マイグレーション + D1 マイグレーション）
./scripts/init-local.sh

# .env.local を作成
cp .env.example .env.local
# VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_R2_WORKER_URL を設定
```

### 開発サーバー起動

```bash
# 一括起動（Supabase + Worker + Vite）
./scripts/dev-local.sh
```

| サービス | URL |
|---------|-----|
| Vite (フロントエンド) | https://localhost:6100 |
| Supabase | http://localhost:54321 |
| Supabase Studio | http://localhost:54323 |
| Worker | http://localhost:8787 |

### デプロイ

GitHub Actions によるタグデプロイ。`v*` タグを push すると Cloudflare Pages にデプロイされます。

```bash
# デモモードでリリース
git tag v0.1.0-demo
git push origin v0.1.0-demo
```

タグ名に `demo` が含まれる場合、デモモード（`/demo` のみ公開）でビルドされます。

## ライセンス

Private
