# Adrastea

TRPG 向けオンラインセッションツール。リアルタイム同期のボード・チャット・シーン管理・BGM 再生等を提供する。

## アーキテクチャ

```
                    ┌──────────────────────┐
                    │   AdrasteaProvider   │  ← 状態統合 (AdrasteaContext)
                    │  useScenes, useObjects, useBgms, ...  │
                    └──────────┬───────────┘
                               │
              ┌────────────────┼────────────────┐
              ▼                ▼                ▼
       ┌─────────┐    ┌──────────────┐   ┌──────────┐
       │  Board   │    │  DockLayout  │   │ Overlays │
       │ (Konva)  │    │ (flexlayout) │   │ Cutin/BGM│
       └─────────┘    └──────┬───────┘   └──────────┘
                              │
                    ┌─────────┼─────────┐
                    ▼         ▼         ▼
               DockPanels  Editors  NestedDock
```

### レイアウトシステム

**flexlayout-react** によるドッキングパネル。タブ・スプリット・フローティング・ネスト Dock に対応。

- メイン: `DockLayout.tsx` — レイアウト JSON 保存/復元 (`localStorage`)
- ネスト: `NestedDockPanel.tsx` — メインレイアウト内にサブレイアウトを配置
- パネル定義: `dock-panels/sharedComponents.ts`

### データフロー

Firebase Firestore の `onSnapshot` によるリアルタイム同期。各フックがコレクションを監視し、AdrasteaContext で集約して配信。

```
Firestore ──onSnapshot──▶ useScenes/useObjects/... ──▶ AdrasteaContext ──▶ UI
                                                              ▲
UI ──addScene/updateObject/...──────────────────────────────────┘
```

## ファイル構造

```
src/
├── components/Adrastea/
│   ├── DockLayout.tsx          # flexlayout-react メインレイアウト管理
│   ├── TopToolbar.tsx          # パネル切替・シーン選択ツールバー
│   ├── Board.tsx               # Konva.js インタラクティブボード
│   │
│   ├── dock-panels/            # --- ドックパネル ---
│   │   ├── sharedComponents.ts #   パネル→コンポーネントマップ
│   │   ├── NestedDockPanel.tsx #   ネストレイアウト (2層構造)
│   │   ├── BoardDockPanel.tsx  #   ボード表示
│   │   ├── SceneDockPanel.tsx  #   シーンリスト
│   │   ├── CharacterDockPanel.tsx
│   │   ├── LayerDockPanel.tsx  #   オブジェクトレイヤー
│   │   ├── PropertyDockPanel.tsx # エディタ集約パネル
│   │   ├── ScenarioTextDockPanel.tsx
│   │   ├── CutinDockPanel.tsx
│   │   ├── BgmDockPanel.tsx
│   │   ├── ChatDockPanel.tsx
│   │   └── PdfViewerDockPanel.tsx
│   │
│   ├── ScenePanel.tsx          # --- パネル内コンテンツ ---
│   ├── CharacterPanel.tsx
│   ├── LayerPanel.tsx
│   ├── ScenarioTextPanel.tsx
│   ├── CutinPanel.tsx
│   ├── BgmPanel.tsx            #   プレイリスト型・複数同時再生
│   ├── ChatPanel.tsx           #   チャット・ダイスロール
│   │
│   ├── SceneEditor.tsx         # --- エディタ ---
│   ├── CharacterEditor.tsx
│   ├── ObjectEditor.tsx
│   ├── PieceEditor.tsx
│   ├── CutinEditor.tsx
│   ├── BgmEditor.tsx
│   │
│   ├── BgmEngine.tsx           # --- BGM ---
│   ├── BgmTrackPlayer.tsx      #   YouTube/音声ファイル再生
│   ├── BgmMiniPlayer.tsx       #   再生状態ミニ表示
│   │
│   ├── ObjectOverlay.tsx       # --- ボードオーバーレイ ---
│   ├── CutinOverlay.tsx        #   カットインアニメーション
│   ├── Piece.tsx               #   ピース dnd-kit ハンドル
│   │
│   ├── AssetLibraryModal.tsx   # --- ユーティリティ ---
│   ├── AssetPicker.tsx
│   ├── FileDropZone.tsx
│   ├── PdfViewer.tsx
│   ├── RoomLobby.tsx
│   ├── ProfileEditModal.tsx
│   ├── RoomSettingsModal.tsx
│   │
│   └── ui/                     # --- 共通 UI ---
│       ├── AdComponents.tsx    #   AdInput, AdButton, AdSlider, AdColorPicker 等
│       ├── SortableList.tsx    #   SortableListPanel + SortableListItem (dnd-kit)
│       └── index.ts
│
├── contexts/
│   ├── AdrasteaContext.tsx      # Adrastea 状態統合 Provider
│   └── AuthContext.tsx          # Firebase Auth + ユーザープロフィール
│
├── hooks/
│   ├── useAdrastea.ts           # ピース・ルーム操作
│   ├── useScenes.ts             # シーン CRUD + sort_order
│   ├── useCharacters.ts         # キャラクター CRUD
│   ├── useObjects.ts            # オブジェクト CRUD (room/scene スコープ)
│   ├── useCutins.ts             # カットイン CRUD
│   ├── useScenarioTexts.ts      # シナリオテキスト CRUD
│   ├── useBgms.ts               # BGM トラック CRUD + 再生状態
│   ├── useAssets.ts             # ユーザーアセット管理 (R2)
│   ├── useAdrasteaChat.ts       # チャット (IndexedDB キャッシュ)
│   └── useImagePreloader.ts     # シーン画像の事前プリロード
│
├── services/
│   ├── assetService.ts          # R2 アップロード (画像圧縮・音声)
│   ├── fileUpload.ts            # Canvas リサイズ → WebP エンコード
│   ├── adrasteaCache.ts         # IndexedDB キャッシュ
│   ├── diceRoller.ts            # bcdice ラッパー
│   ├── encryption.ts            # AES-GCM 暗号化/復号
│   ├── encryptionKey.ts         # 暗号化キー管理
│   └── auth.ts                  # Firebase 認証
│
├── types/
│   └── adrastea.types.ts        # Room, Scene, Piece, Character, BoardObject, BgmTrack 等
│
└── styles/
    └── flexlayout-catppuccin.css  # Catppuccin ダークテーマ

worker/                          # Cloudflare Worker (画像リサイズ API)
firestore.rules                  # Firestore セキュリティルール
```

## 主要な依存関係

| パッケージ | 用途 |
|-----------|------|
| `flexlayout-react` | パネルレイアウト (dock/tab/float) |
| `konva` + `react-konva` | Canvas ボード |
| `@dnd-kit/*` | リスト並び替え DnD |
| `firebase` | Firestore + Auth |
| `react-youtube` | YouTube BGM 再生 |
| `react-colorful` | カラーピッカー |
| `bcdice` | ダイスロール判定 |
| `pdfjs-dist` | PDF 表示 |

## 設計判断メモ

### オブジェクトスコープ (room / scene)
- **room スコープ**: 全シーンで共有されるオブジェクト
- **scene スコープ**: 特定シーンにのみ存在するオブジェクト（背景・前景含む）
- `useObjects` が `active_scene_id` に応じて両方を取得・マージ

### 画像プリロード
- `useImagePreloader` がルーム参加時に全シーンの `background_url` / `foreground_url` をバックグラウンドで読み込み
- シーン切替時にキャッシュヒットして即表示
- オブジェクト画像は各シーンの Firestore クエリが必要なためスコープ外

### 編集状態の排他制御
- `editingScene` / `editingCharacter` / `editingObjectId` 等を AdrasteaContext で一元管理
- `clearAllEditing()` で全編集状態をリセット
- `setPendingEdit` によるデバウンス付き自動保存 (500ms)

### BGM 同期
- Firestore の `is_playing` / `current_time` / `volume` フィールドでリアルタイム同期
- `BgmEngine` がシーン切替時に `auto_play_scene_ids` を見て自動再生/停止

## 今後の予定

### Piece → Character 統合
- Piece（ボード上のトークン）を廃止し、Character に統合
- `usePieces` / `Piece.tsx` / `PieceEditor.tsx` 等を Character 系に吸収

### チャット拡張
- **タブ機能** — チャットチャンネルの切り替え
- **キャラクター発言** — キャラクターとしてメッセージを送信
- **ボード吹き出し** — 発言内容をボード上のキャラクター付近に表示
- **チャットコマンド** — コマンドでシーン切替・BGM操作等を実行

### ダイスシステム見直し
- 現行の bcdice ラッパーを再設計予定
