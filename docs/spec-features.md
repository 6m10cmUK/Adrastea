# Adrastea 機能仕様書

ブラウザベースのTRPGオンラインセッション向け盤面共有ツール。リアルタイムマップ・駒・シーン・チャット・BGM・カットインなど、セッション運営に必要な機能を統合。

各機能の詳細仕様は `docs/specs/` 配下の個別ファイルを参照。

## 機能仕様一覧

| 仕様 | ファイル | 対応E2E |
|------|---------|---------|
| シーン管理 | [scene.md](specs/scene.md) | `e2e/scene-e2e.spec.ts` |
| レイヤー・オブジェクト管理 | [object.md](specs/object.md) | `e2e/object-e2e.spec.ts` |
| キャラクター管理 | [character.md](specs/character.md) | `e2e/character-e2e.spec.ts` |
| BGM管理 | [bgm.md](specs/bgm.md) | `e2e/bgm-e2e.spec.ts` |
| チャット | [chat.md](specs/chat.md) | `e2e/chat-e2e.spec.ts` |
| カットイン | [cutin.md](specs/cutin.md) | — |
| テキストメモ | [text-memo.md](specs/text-memo.md) | `e2e/text-memo-e2e.spec.ts` |
| プロパティパネル | [property.md](specs/property.md) | `e2e/property-e2e.spec.ts` |
| クリップボード入出力 | [clipboard.md](specs/clipboard.md) | — |
| Undo / Redo | [undo-redo.md](specs/undo-redo.md) | `e2e/undo-e2e.spec.ts` |
| 権限システム | [permissions.md](specs/permissions.md) | `e2e/permissions-e2e.spec.ts` |
| キーボードショートカット | [keyboard.md](specs/keyboard.md) | `e2e/keyboard-e2e.spec.ts` |
| 複数選択・DnD | [selection.md](specs/selection.md) | `e2e/selection-e2e.spec.ts` |
| ステータスパネル | [status-panel.md](specs/status-panel.md) | — |
| ステータス変更チャット通知 | [status-change-chat-log.md](specs/status-change-chat-log.md) | — |
| アセットライブラリ | [asset-library.md](specs/asset-library.md) | — |
| PDFパネル | [pdf-panel.md](specs/pdf-panel.md) | — |
| パネルレイアウト（dockview・セッション・サニタイズの正本） | [panel-layout.md](specs/panel-layout.md)（§9 実装差分） | — |
| ロビー画面 | [lobby.md](specs/lobby.md) | — |
| アーカイブ・復元 | [archive.md](specs/archive.md) | `e2e/archive-e2e.spec.ts` |
| UI共通仕様 | [ui-common.md](specs/ui-common.md) | — |
| デモページ | [demo.md](specs/demo.md) | — |

## 関連ドキュメント

- [データモデル仕様](spec-data-model.md)
- [API仕様](spec-api.md)
- [アーキテクチャ仕様](spec-architecture.md)
