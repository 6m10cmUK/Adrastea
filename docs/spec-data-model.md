# Adrastea データモデル仕様書

本ドキュメントは Adrastea（TRPG オンラインセッション盤面共有ツール）のデータモデルを定義する。Supabase (PostgreSQL) を利用したリアルタイムデータベースとして実装される。

## 概要

Supabase (PostgreSQL) を利用したリアルタイムデータベースとして実装。以下の 14 テーブルを管理する。

- **全タイムスタンプ**: bigint でミリ秒 UNIX 時刻（Date.now() 形式）
- **RLS（Row Level Security）**: 全テーブルで `is_room_member()` 関数により認可。ルームメンバーのみアクセス可
- **配列型**: PostgreSQL の `text[]` / `uuid[]`
- **複雑オブジェクト**: JSONB
- **assets テーブル**: 認証済みユーザーなら誰でも読み取り可

---

## テーブル定義

### 1. users

**概要**: アプリケーションユーザーの認証・プロフィール情報。Supabase Auth で管理される。

| カラム | 型 | NULL | デフォルト | 説明 |
|--------|-----|------|-----------|------|
| id | uuid | ✗ | | PK。auth.users に紐付 |
| display_name | text | ✗ | 'ユーザー' | 表示名 |
| avatar_url | text | ✓ | | アバター画像 URL |
| onboarded | boolean | ✗ | false | オンボーディング完了フラグ |
| created_at | bigint | ✗ | | 作成時刻 |
| updated_at | bigint | ✗ | | 更新時刻 |

**認証**: Supabase Auth (Google OAuth + Anonymous)。メールアドレスは `auth.users` で管理。

**関連**:
- `room_members.user_id` → `users.id`（ルームメンバーシップ）
- `characters_stats.owner_id` → `users.id`（キャラクター所有者）

**RLS**: 各ユーザーは自分のプロフィールのみ更新可。読み取りは公開。

---

### 2. rooms

**概要**: TRPG セッションの管理単位。ゲームマスター（owner）が作成し、複数のユーザーが参加する。

| カラム | 型 | NULL | デフォルト | 説明 |
|--------|-----|------|-----------|------|
| id | text | ✗ | | PK。URL フレンドリーID |
| name | text | ✗ | | ルーム名（セッション名） |
| description | text | ✓ | | ルーム説明文 |
| owner_id | uuid | ✗ | | 所有者ユーザー ID |
| active_scene_id | text | ✓ | | アクティブシーン ID |
| thumbnail_asset_id | text | ✓ | | サムネイルアセット ID |
| active_cutin | jsonb | ✓ | | {cutin_id, triggered_at} or null |
| dice_system | text | ✗ | | ダイスシステム名 |
| gm_can_see_secret_memo | boolean | ✗ | | GM が秘密メモを見られるか |
| default_login_role | text | ✓ | | デフォルトログインロール |
| tags | jsonb | ✓ | | ルームタグ配列 |
| status_change_chat_enabled | boolean | ✗ | true | ステータス変更をチャットに流すか |
| status_change_chat_channel | text | ✗ | 'main' | 通知先 channel_id（既定はメイン。`useChannels` の DEFAULT_CHANNELS と同じ `main`） |
| archived | boolean | ✗ | false | アーカイブ済みフラグ |
| last_accessed_at | bigint | ✓ | | 最終アクセス時刻 |
| created_at | bigint | ✗ | | 作成時刻 |
| updated_at | bigint | ✗ | | 更新時刻 |

**インデックス**:
- `by_owner`: (owner_id)（ユーザー所有ルーム一覧）

**制約・バリデーション**:
- `id` はユーザー指定のため、ルーム作成時にグローバル一意性チェックが必須
- `dice_system` は事前定義されたシステムから選択
- `status_change_chat_channel` は `channels.channel_id` または UI 既定チャンネル（`main` / `info` / `misc` 等）のいずれか。参照先がルームに存在しない場合は送信ロジックでスキップする

**関連**:
- `room_members.room_id` → `rooms.id`（メンバーシップ）
- `scenes.room_id` → `rooms.id`（シーン）
- `objects.room_id` → `rooms.id`（盤面オブジェクト）
- `characters_stats.room_id` → `rooms.id`（キャラクター）
- `messages.room_id` → `rooms.id`（チャット）
- `bgms.room_id` → `rooms.id`（BGM）
- `cutins.room_id` → `rooms.id`（カットイン）

**RLS**: `is_room_member()` でメンバー確認。owner のみ更新可（gm_can_see_secret_memo 除外）。

---

### 3. scenes

**概要**: TRPG セッション内のシーン。背景画像、演出、グリッド表示を管理する。

| カラム | 型 | NULL | デフォルト | 説明 |
|--------|-----|------|-----------|------|
| id | text | ✗ | | PK |
| room_id | text | ✗ | | ルーム ID |
| name | text | ✗ | | シーン名 |
| background_asset_id | text | ✓ | | 背景アセット ID |
| foreground_asset_id | text | ✓ | | 前景アセット ID |
| foreground_opacity | numeric | ✗ | | 前景オパシティ(0-1) |
| bg_transition | text | ✓ | | 背景遷移効果(none/fade) |
| bg_transition_duration | numeric | ✗ | | 背景遷移時間(ms) |
| fg_transition | text | ✓ | | 前景遷移効果(none/fade) |
| fg_transition_duration | numeric | ✗ | | 前景遷移時間(ms) |
| bg_blur | boolean | ✗ | | 背景ぼかし |
| grid_visible | boolean | ✓ | | グリッド表示 |
| sort_order | numeric | ✗ | | 並び順 |
| created_at | bigint | ✗ | | 作成時刻 |
| updated_at | bigint | ✗ | | 更新時刻 |

**インデックス**:
- `by_room`: (room_id)（ルーム内シーン一覧）

**制約・バリデーション**:
- `foreground_opacity` は 0.0 ～ 1.0 の範囲
- `bg_transition_duration`, `fg_transition_duration` はミリ秒単位の非負整数
- `sort_order` はシーン一覧表示の順序決定

**関連**:
- `background_asset_id` → `assets.id`（背景画像）
- `foreground_asset_id` → `assets.id`（前景画像）
- `objects.scene_ids` 配列に含まれる（シーン固有オブジェクト）
- `bgms.scene_ids` 配列に含まれる（シーン割当 BGM）

**RLS**: `is_room_member()` でメンバー確認。editor ロール以上で更新可。

---

### 4. objects

**概要**: 盤面上の配置オブジェクト。パネル、テキスト、背景、前景、キャラクターレイヤーを管理する。

| カラム | 型 | NULL | デフォルト | 説明 |
|--------|-----|------|-----------|------|
| id | text | ✗ | | PK |
| room_id | text | ✗ | | ルーム ID |
| type | text | ✗ | | panel/text/foreground/background/characters_layer |
| name | text | ✗ | | 名前 |
| global | boolean | ✗ | | 全シーン共通か |
| scene_ids | text[] | ✗ | {} | スコープシーン ID 配列 |
| x | numeric | ✗ | | X 座標 |
| y | numeric | ✗ | | Y 座標 |
| width | numeric | ✗ | | 幅 |
| height | numeric | ✗ | | 高さ |
| visible | boolean | ✗ | | 表示フラグ |
| opacity | numeric | ✗ | | 透明度(0-1) |
| sort_order | numeric | ✗ | | Z 順序 |
| position_locked | boolean | ✗ | | 位置ロック |
| size_locked | boolean | ✗ | | サイズロック |
| image_asset_id | text | ✓ | | 画像アセット ID |
| background_color | text | ✗ | | 背景色(hex) |
| image_fit | text | ✓ | | contain/cover/stretch |
| color_enabled | boolean | ✓ | | 背景色有効フラグ |
| text_content | text | ✓ | | テキスト内容 |
| font_size | numeric | ✗ | | フォントサイズ |
| font_family | text | ✗ | | フォントファミリー |
| letter_spacing | numeric | ✗ | | 文字間隔 |
| line_height | numeric | ✗ | | 行高さ |
| auto_size | boolean | ✗ | | 自動サイズ |
| text_align | text | ✓ | | left/center/right |
| text_vertical_align | text | ✓ | | top/middle/bottom |
| text_color | text | ✗ | | テキスト色 |
| scale_x | numeric | ✗ | | X スケール |
| scale_y | numeric | ✗ | | Y スケール |
| memo | text | ✓ | | メモ |
| created_at | bigint | ✗ | | 作成時刻 |
| updated_at | bigint | ✗ | | 更新時刻 |

**インデックス**:
- `by_room_type`: (room_id, type)（ルーム内オブジェクトタイプ別）

**制約・バリデーション**:
- `type` は列挙値のいずれか（panel/text/foreground/background/characters_layer）
- `global` = true 時 `scene_ids` は空配列、false 時 `scene_ids` は非空配列
- `opacity` は 0.0 ～ 1.0 の範囲
- テキストオブジェクトは `text_content`, `font_size`, `font_family` 必須
- 画像オブジェクトは `image_asset_id` 必須

**関連**:
- `image_asset_id` → `assets.id`（画像参照）

**RLS**: `is_room_member()` でメンバー確認。editor ロール以上で更新可。

---

### 5. characters_stats

**概要**: キャラクターの表示・ステータス情報。盤面上での配置、ステータスゲージ、参照画像管理。

| カラム | 型 | NULL | デフォルト | 説明 |
|--------|-----|------|-----------|------|
| id | text | ✗ | | PK |
| room_id | text | ✗ | | ルーム ID |
| owner_id | uuid | ✗ | | 所有ユーザー ID |
| name | text | ✗ | | キャラクター名 |
| color | text | ✗ | | カラー(hex) |
| active_image_index | numeric | ✗ | | アクティブ画像 index |
| statuses | jsonb | ✗ | [] | [{label,value,max,color}] |
| parameters | jsonb | ✗ | [] | [{label,value}] |
| is_hidden_on_board | boolean | ✗ | | 盤面非表示 |
| is_speech_hidden | boolean | ✓ | | 発言非表示 |
| sort_order | numeric | ✓ | | 並び順 |
| board_x | numeric | ✓ | | 盤面 X 座標 |
| board_y | numeric | ✓ | | 盤面 Y 座標(足元基準) |
| board_height | numeric | ✓ | | 盤面表示高さ |
| board_visible | boolean | ✓ | | 盤面表示 |
| created_at | bigint | ✗ | | 作成時刻 |
| updated_at | bigint | ✗ | | 更新時刻 |

**インデックス**:
- `by_room_owner`: (room_id, owner_id)（ユーザーが所有するルーム内キャラ一覧）

**制約・バリデーション**:
- `statuses` は `{label: string, value: number, max: number, color: string}` 配列
- `parameters` は `{label: string, value: string|number}` 配列
- `board_y` は足元基準（size 変更時の自動調整不要）
- `active_image_index` は `characters_base.images` 配列の有効な index

**関連**:
- 1:1 で `characters_base.id` に紐付
- `owner_id` → `users.id`（キャラクター所有者）

**RLS**: `is_room_member()` でメンバー確認。owner のみ更新可。

---

### 6. characters_base

**概要**: キャラクター詳細情報。画像一覧、メモ、シートリンク。characters_stats と 1:1 対応。

| カラム | 型 | NULL | デフォルト | 説明 |
|--------|-----|------|-----------|------|
| id | text | ✗ | | PK。characters_stats.id と 1:1 |
| room_id | text | ✗ | | ルーム ID |
| images | jsonb | ✗ | | [{asset_id, label}] |
| memo | text | ✗ | | メモ |
| secret_memo | text | ✗ | | 秘密メモ(GM/Owner のみ) |
| chat_palette | text | ✗ | | チャットパレット |
| sheet_url | text | ✓ | | キャラシート URL |
| initiative | numeric | ✗ | | イニシアティブ |
| size | numeric | ✗ | | サイズ倍率 |
| is_status_private | boolean | ✗ | | ステータス非公開 |

**インデックス**:
- `by_room`: (room_id)（ルーム内キャラクター詳細一覧）

**制約・バリデーション**:
- `images` は `{asset_id: string, label: string}` 配列
- `secret_memo` は room owner およびキャラクター owner のみ読み取り可
- `size` は正の数値（倍率）

**関連**:
- `images[].asset_id` → `assets.id`（キャラクター画像）

**RLS**: `is_room_member()` でメンバー確認。secret_memo は owner のみ読み取り可。

---

### 7. pieces（レガシー）

**概要**: 非推奨。新規開発では characters_stats + characters_base に移行済み。段階的廃止予定。

| カラム | 型 | NULL | デフォルト | 説明 |
|--------|-----|------|-----------|------|
| id | text | ✗ | | PK |
| room_id | text | ✗ | | ルーム ID |
| x | numeric | ✗ | | X 座標 |
| y | numeric | ✗ | | Y 座標 |
| width | numeric | ✗ | | 幅 |
| height | numeric | ✗ | | 高さ |
| image_asset_id | text | ✓ | | 画像アセット ID |
| label | text | ✗ | | ラベル |
| color | text | ✗ | | 色 |
| z_index | numeric | ✗ | | Z 順序 |
| statuses | jsonb | ✗ | [] | ステータス配列 |
| initiative | numeric | ✗ | | イニシアティブ |
| memo | text | ✗ | | メモ |
| character_id | text | ✓ | | キャラクター ID |
| created_at | bigint | ✗ | | 作成時刻 |

**RLS**: `is_room_member()` でメンバー確認。削除推奨。

---

### 8. bgms

**概要**: ルーム内の BGM 管理。複数トラック、シーン割当、フェード効果。

| カラム | 型 | NULL | デフォルト | 説明 |
|--------|-----|------|-----------|------|
| id | text | ✗ | | PK |
| room_id | text | ✗ | | ルーム ID |
| name | text | ✗ | | BGM 名 |
| bgm_type | text | ✓ | | youtube/url/upload |
| bgm_source | text | ✓ | | ソース URL |
| bgm_asset_id | text | ✓ | | アップロードアセット ID |
| bgm_volume | numeric | ✗ | | 音量(0-1) |
| bgm_loop | boolean | ✗ | | ループ再生 |
| scene_ids | text[] | ✗ | {} | 関連シーン ID 配列 |
| is_playing | boolean | ✗ | | 再生中 |
| is_paused | boolean | ✗ | | 一時停止中 |
| auto_play_scene_ids | text[] | ✗ | {} | 自動再生シーン ID 配列 |
| fade_in | boolean | ✗ | | フェードイン有効 |
| fade_in_duration | numeric | ✓ | | フェードイン時間(ms) |
| fade_out | boolean | ✓ | | フェードアウト有効 |
| fade_duration | numeric | ✓ | | フェード時間(ms) |
| sort_order | numeric | ✓ | | 並び順 |
| created_at | bigint | ✗ | | 作成時刻 |
| updated_at | bigint | ✗ | | 更新時刻 |

**インデックス**:
- `by_room`: (room_id)（ルーム内 BGM 一覧）

**制約・バリデーション**:
- `bgm_type` は youtube / url / upload のいずれか
- `bgm_volume` は 0.0 ～ 1.0 の範囲
- `bgm_type` = upload 時 `bgm_asset_id` 必須。その他の型は `bgm_source` 必須
- `scene_ids` が空の場合、scene_ids 配列に含まれないシーンで自動削除
- `auto_play_scene_ids` に含まれるシーンで自動再生

**関連**:
- `bgm_asset_id` → `assets.id`（アップロード BGM ファイル）

**RLS**: `is_room_member()` でメンバー確認。editor ロール以上で更新可。

---

### 9. cutins

**概要**: カットイン演出。アニメーション、テキスト、色設定。

| カラム | 型 | NULL | デフォルト | 説明 |
|--------|-----|------|-----------|------|
| id | text | ✗ | | PK |
| room_id | text | ✗ | | ルーム ID |
| name | text | ✗ | | 名前 |
| image_asset_id | text | ✓ | | 画像アセット ID |
| text | text | ✗ | | テキスト |
| animation | text | ✗ | | slide/fade/zoom |
| duration | numeric | ✗ | | 表示時間(ms) |
| text_color | text | ✗ | | テキスト色 |
| background_color | text | ✗ | | 背景色 |
| sort_order | numeric | ✗ | | 並び順 |
| created_at | bigint | ✗ | | 作成時刻 |
| updated_at | bigint | ✗ | | 更新時刻 |

**インデックス**:
- `by_room`: (room_id)（ルーム内カットイン一覧）

**制約・バリデーション**:
- `animation` は slide / fade / zoom のいずれか
- `duration` はミリ秒単位の正の整数
- `text_color`, `background_color` は hex 色コード

**関連**:
- `image_asset_id` → `assets.id`（カットイン背景画像）

**RLS**: `is_room_member()` でメンバー確認。editor ロール以上で更新可。

---

### 10. scenario_texts

**概要**: シナリオテキスト・セリフ。キャラクター紐付け、チャンネル管理。

| カラム | 型 | NULL | デフォルト | 説明 |
|--------|-----|------|-----------|------|
| id | text | ✗ | | PK |
| room_id | text | ✗ | | ルーム ID |
| title | text | ✗ | | タイトル |
| content | text | ✗ | | 内容 |
| visible | boolean | ✗ | | 表示フラグ |
| speaker_character_id | text | ✓ | | 話者キャラクター ID |
| speaker_name | text | ✓ | | 話者名 |
| channel_id | text | ✓ | | チャンネル ID |
| sort_order | numeric | ✗ | | 並び順 |
| created_at | bigint | ✗ | | 作成時刻 |
| updated_at | bigint | ✗ | | 更新時刻 |

**インデックス**:
- `by_room`: (room_id)（ルーム内シナリオテキスト一覧）

**制約・バリデーション**:
- `speaker_character_id` または `speaker_name` のいずれか必須
- `visible` = false のテキストは表示されない

**関連**:
- `speaker_character_id` → `characters_stats.id`（話者キャラクター）
- `channel_id` → `channels.channel_id`（所属チャンネル）

**RLS**: `is_room_member()` でメンバー確認。editor ロール以上で更新可。

---

### 11. messages

**概要**: ルーム内チャット・ダイスロール・システムメッセージ。

| カラム | 型 | NULL | デフォルト | 説明 |
|--------|-----|------|-----------|------|
| id | text | ✗ | | PK |
| room_id | text | ✗ | | ルーム ID |
| sender_name | text | ✗ | | 送信者名 |
| sender_uid | uuid | ✓ | | 送信者ユーザー ID |
| sender_avatar_asset_id | text | ✓ | | 送信者アバターのアセット ID |
| sender_color | text | ✓ | | 送信者カラー(旧互換) |
| content | text | ✗ | | メッセージ内容 |
| message_type | text | ✗ | | chat/dice/system 等 |
| channel | text | ✓ | | チャンネル ID |
| allowed_user_ids | uuid[] | ✓ | {} | 秘密メッセージ許可 UID 配列 |
| created_at | bigint | ✗ | | 作成時刻 |

**インデックス**:
- `by_room_created`: (room_id, created_at desc)（ルーム内メッセージ時系列）

**制約・バリデーション**:
- `message_type` は chat / dice / system のいずれか（実装上 secret_dice 等があれば別途）。**system** はチャットログにのみ表示し、盤面 MessagePopup の対象外とする（[chat.md](specs/chat.md) ログパネル詳細）
- `allowed_user_ids` が空でない場合、ホイッスル/秘密メッセージ
- `channel` が null の場合はメインチャンネル

**関連**:
- `sender_uid` → `users.id`（送信者）
- `channel` → `channels.channel_id`（所属チャンネル）

**RLS**: `is_room_member()` でメンバー確認。秘密メッセージは `sender_uid` または `allowed_user_ids` 内のメンバーのみ読み取り可。

---

### 12. room_members

**概要**: ルームメンバーシップ・ロール管理。

| カラム | 型 | NULL | デフォルト | 説明 |
|--------|-----|------|-----------|------|
| id | bigserial | ✗ | | PK |
| room_id | text | ✗ | | ルーム ID |
| user_id | uuid | ✗ | | ユーザー ID |
| role | text | ✗ | | owner/sub_owner/user/guest |
| joined_at | bigint | ✗ | | 参加時刻 |

**制約**:
- UNIQUE(room_id, user_id)
- `role` は owner / sub_owner / user / guest のいずれか

**関連**:
- `room_id` → `rooms.id`（ルーム）
- `user_id` → `users.id`（ユーザー）

**RLS**: `is_room_member()` でメンバー確認。自分のロール情報のみ読み取り可。owner のみロール更新可。

---

### 13. channels

**概要**: ルーム内のチャットチャンネル。複数チャンネル、アクセス権限。

| カラム | 型 | NULL | デフォルト | 説明 |
|--------|-----|------|-----------|------|
| id | bigserial | ✗ | | PK |
| room_id | text | ✗ | | ルーム ID |
| channel_id | text | ✗ | | チャンネル識別子 |
| label | text | ✗ | | 表示名 |
| order | numeric | ✗ | | 並び順 |
| is_archived | boolean | ✗ | | アーカイブ済み |
| allowed_user_ids | uuid[] | ✗ | {} | アクセス許可 UID 配列 |

**制約**:
- UNIQUE(room_id, channel_id)

**関連**:
- `room_id` → `rooms.id`（ルーム）
- `allowed_user_ids[]` → `users.id`（アクセス許可ユーザー）

**RLS**: `is_room_member()` でメンバー確認。アクセス許可済みメンバーのみ読み取り可。editor ロール以上で更新可。

**UI（カスタム追加）**: チャットログパネルのモーダルから `label` を入力して upsert する。操作仕様は [specs/chat.md](specs/chat.md) のログパネル詳細「カスタムチャンネル追加（モーダル）」。

---

### 14. assets

**概要**: 画像・音声ファイルのメタデータ。R2 ストレージ参照。

| カラム | 型 | NULL | デフォルト | 説明 |
|--------|-----|------|-----------|------|
| id | text | ✗ | | PK |
| owner_id | uuid | ✗ | | 所有者 UID |
| url | text | ✗ | | 公開 URL |
| r2_key | text | ✗ | | R2 キー |
| filename | text | ✗ | | ファイル名 |
| title | text | ✗ | | タイトル |
| size_bytes | bigint | ✗ | 0 | サイズ(bytes) |
| width | integer | ✗ | 0 | 画像幅(px) |
| height | integer | ✗ | 0 | 画像高さ(px) |
| tags | text[] | ✗ | {} | タグ配列 |
| asset_type | text | ✗ | 'image' | image/audio |
| created_at | bigint | ✗ | | 作成時刻 |

**インデックス**:
- `by_owner`: (owner_id)（ユーザー所有アセット一覧）
- `by_asset_type`: (asset_type)（タイプ別）

**制約・バリデーション**:
- `asset_type` は image / audio のいずれか
- `width`, `height` は非負整数（画像のみ）
- `r2_key` は Cloudflare R2 での一意キー

**認可**: 認証済みユーザーなら誰でも読み取り可。所有者のみ削除可。

**RLS**: WHERE 句なし。認証済みユーザーすべてが読み取り可。削除は owner_id でチェック。

---

## ER 図

```
users (認証・プロフィール)
  ├─ room_members (ルームメンバーシップ)
  ├─ characters_stats (キャラクターステータス)
  ├─ characters_base (キャラクター詳細)
  └─ assets (所有アセット)

rooms (セッション管理)
  ├─ room_members (メンバーシップ)
  ├─ scenes (背景・遷移)
  │   └─ objects (配置オブジェクト)
  ├─ characters_stats (キャラクター)
  │   └─ characters_base (詳細情報)
  ├─ bgms (BGM トラック)
  ├─ cutins (カットイン演出)
  ├─ messages (チャット)
  ├─ channels (チャットチャンネル)
  └─ scenario_texts (シナリオセリフ)

assets (R2 参照)
  ├─ scenes.background_asset_id
  ├─ scenes.foreground_asset_id
  ├─ objects.image_asset_id
  ├─ characters_base.images[].asset_id
  ├─ bgms.bgm_asset_id
  ├─ cutins.image_asset_id
  └─ rooms.thumbnail_asset_id

pieces (レガシー - 非推奨)
  └─ characters_stats (移行済み)
```

---

## 設計ノート

### マルチシーン対応

各オブジェクト（characters_stats, objects, bgms）は複数シーンに対応。

- **global**: true の場合、`scene_ids` は空配列。全シーン共通
- **global**: false の場合、`scene_ids` に含まれるシーン固有
- シーン表示時のフィルタリングはアプリケーション層で実施（SQL WHERE 不使用）

### キャラクター 2 テーブル分割

`characters_stats` と `characters_base` で責任を分離。

- **stats**: 盤面表示・ステータス・画像選択（更新頻度高）
- **base**: 詳細情報・シートリンク・メモ（相対的に低頻度）

RLS で `secret_memo` は room owner のみアクセス可。

### 権限管理（RLS）

全テーブルで `is_room_member()` 関数を用いた行レベルセキュリティ。

- **メンバー確認**: room_id 経由で room_members テーブル照会
- **役割チェック**: room_members.role の値に基づく
- **秘密メモ**: room owner およびキャラクター owner のみ読み取り
- **assets**: owner_id チェックで削除権限管理

### アセット管理

`image_url` から `*_asset_id` に統一。

- **scenes**: background_asset_id, foreground_asset_id
- **objects**: image_asset_id
- **characters_base**: images[].asset_id
- **bgms**: bgm_asset_id
- **cutins**: image_asset_id
- **rooms**: thumbnail_asset_id

アセット URL 解決は `assets` テーブルから取得。R2 キャッシュ戦略（TTL: 7 日）。

### 認証

Supabase Auth (Google OAuth + Anonymous)。

- **メールアドレス**: auth.users で管理。users テーブルには保存しない
- **匿名ユーザー**: isAnonymous フラグ（移行済み）
- **セッション**: JWT トークン（HttpOnly Cookie）

### 廃止予定

- **pieces テーブル**: 非推奨。characters_stats + characters_base に移行。段階的削除

### 時系列データ

- **messages**: created_at のインデックス整備で時系列クエリ最適化
- **スナップショット**: 自動保存機構別テーブルで検討（将来）

### マルチユーザー同期

Supabase Realtime（WebSocket）でリアルタイム同期。

- **subscription**: room_id, channel_id 単位で購読
- **debounce**: クライアント側で非同期 UPDATE（楽観的更新）
- **conflict**: last-write-wins（タイムスタンプベース）

---

## 互換性ノート

- **messages.sender_color**: 旧互換フィールド。characters_stats.color から解決推奨
- **pieces テーブル**: 非推奨。新規開発では使用禁止。既存データは characters_stats に移行手順準備中

