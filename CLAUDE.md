# CLAUDE Code プロジェクトガイド: Splatoon Point Counter

このドキュメントは、Claude Codeがこのプロジェクトで効率的に作業できるように作成されたガイドです。

## プロジェクト概要

**Splatoon Point Counter** は、OBS向けのリアルタイム・データオーバーレイ・システムです。Next.js (App Router) とTypeScriptで構築されており、ストリーマーがコントロールパネルから配信画面上のオーバーレイをリアルタイムで制御できます。

### 主要な構成要素

1. **ランチャーページ** (`/`) - 各画面へのアクセスポイント。全オーバーレイを iframe の縮小プレビューで常に表示し、カードのアイコン・プレビューのクリックで別タブで開く（読み上げは埋め込むと音声が鳴るのでプレビューしない）。ページの一覧は `app/page.tsx` の `OVERLAY_PAGES`
2. **コントロールパネル** (`/control-panel`) - ストリーマーがデータを更新するUI
3. **スコア＆メッセージオーバーレイ** (`/obs-overlay`) - メインのオーバーレイ表示
4. **バーンダウンチャートオーバーレイ** (`/burndown-overlay`) - 進捗状況を可視化
5. **字幕オーバーレイ** (`/caption-overlay`) - 配信者の音声をリアルタイムに字幕表示
6. **サイドパネルオーバーレイ** (`/side-panel-overlay`) - 配信画面右側（250x584）。上段にフォロワーゲージ、下段にコントロールパネルで選んだスロットを表示。縦型配信用の横長レイアウト（990x440）は `/side-panel-overlay/vertical`
7. **実況テロップオーバーレイ** (`/telop-overlay`) - コントロールパネルのボタン・キーボードで出す定型文を数秒だけ大きく表示
8. **読み上げ（音声専用）オーバーレイ** (`/voice-overlay`) - 読み上げキューの文を VOICEVOX で音声にして順に再生（画面には何も出さない）
9. **ブキ埋めカードオーバーレイ** (`/weapon-card-overlay`) - サーモンランのオールランダムで支給された全ブキ種（71 種）を埋めていくカード
10. **サーモンランの振り返りオーバーレイ** (`/salmon-review-overlay`) - 配信の最後に、その日（セッション）のサーモンランの記録をグラフで大きく出す（1920x1080）
11. **バックエンドAPI** (`/api/stream-data`, `/api/caption`, `/api/twitch`, `/api/salmon`, `/api/side-panel`, `/api/salmon-schedule`, `/api/telop`, `/api/speech`, `/api/voice`, `/api/weapon-card`, `/api/clip`, `/api/salmon/import`, `/api/salmon/review`) - データ管理とクライアント間の同期
12. **文字起こしスクリプト** (`tools/caption-stt/`) - マイク音声を文字起こしして `/api/caption` へ送信。「クリップ撮って」などで `/api/clip` にクリップを依頼（Python, Mac ネイティブ実行）
13. **リザルト取り込みスクリプト** (`tools/salmon-result/`) - iPhone ミラーリングのイカリング3を操作し、サーモンランの最新のリザルトを OCR で読み取って `/api/salmon/import` へ送信（Python, Mac ネイティブ実行）
14. **Twitch連携スクリプト** (`tools/twitch-eventsub/`) - フォロワー数・フォロワー目標を EventSub で受信して `/api/twitch` へ送信。チャットの初コメの挨拶・配信者のコメントを `/api/speech` へ送信。`/api/clip` の依頼で Twitch のクリップを作成（Node, 依存なし）

## 技術スタック

- **フレームワーク**: Next.js 16+ (App Router)
- **言語**: TypeScript 5+
- **UI/スタイリング**: Material-UI (MUI) v9, Tailwind CSS v4
- **アニメーション**: Motion (旧Framer Motion) v13
- **リアルタイム通信**: REST API + クライアントサイドポーリング
- **HTTPクライアント**: Axios
- **文字起こし**: mlx-whisper + Silero VAD (Python 3.12, `tools/caption-stt/`)
- **リザルトの読み取り**: macOS の Vision（OCR）+ pyobjc（iPhone ミラーリングの操作・撮影, Python 3.12, `tools/salmon-result/`）
- **Twitch連携**: EventSub WebSocket + Device Code Flow（Node 24 標準の `fetch` / `WebSocket` と型除去で実行, `tools/twitch-eventsub/`）
- **永続化**: SQLite（Node 24 標準の `node:sqlite`, `lib/db.ts`。`data/overlay.db`）
- **合成音声**: VOICEVOX（配信 PC で別途起動。`VOICEVOX_URL`、既定 `http://localhost:50021`）
- **テスト**: Vitest + React Testing Library + @testing-library/jest-dom
- **Linting**: ESLint 9 (Flat Config)
- **CI/CD**: GitHub Actions
- **コンテナ**: Docker + Docker Compose
- **Node.js**: v24.20.0 (Volta管理)
- **パッケージマネージャ**: pnpm v10 (`packageManager` / `volta` フィールドで固定)

## ディレクトリ構造

```
/
├── app/                          # Next.js App Router
│   ├── page.tsx                  # ランチャーページ
│   ├── layout.tsx                # ルートレイアウト
│   ├── control-panel/
│   │   └── page.tsx              # コントロールパネル
│   ├── obs-overlay/
│   │   └── page.tsx              # メインオーバーレイ
│   ├── burndown-overlay/
│   │   └── page.tsx              # バーンダウンチャート
│   ├── caption-overlay/
│   │   └── page.tsx              # 字幕オーバーレイ
│   ├── side-panel-overlay/
│   │   ├── page.tsx              # サイドパネルオーバーレイ
│   │   └── vertical/
│   │       └── page.tsx          # サイドパネル（縦型配信用の横長レイアウト）
│   ├── telop-overlay/
│   │   └── page.tsx              # 実況テロップオーバーレイ
│   ├── voice-overlay/
│   │   └── page.tsx              # 読み上げ（音声専用）オーバーレイ
│   ├── weapon-card-overlay/
│   │   └── page.tsx              # ブキ埋めカードオーバーレイ
│   ├── salmon-review-overlay/
│   │   └── page.tsx              # サーモンランの振り返りオーバーレイ
│   └── api/
│       ├── stream-data/
│       │   └── route.ts          # データ管理API
│       ├── caption/
│       │   └── route.ts          # 字幕API
│       ├── twitch/
│       │   └── route.ts          # Twitch API（フォロワー数・目標）
│       ├── salmon/
│       │   ├── route.ts          # サーモンラン記録API
│       │   ├── sessions/
│       │   │   └── route.ts      # サーモンランのセッションAPI
│       │   ├── import/
│       │   │   └── route.ts      # リザルトの取り込みの依頼・結果API
│       │   └── review/
│       │       └── route.ts      # 振り返りAPI
│       ├── side-panel/
│       │   └── route.ts          # サイドパネル設定API
│       ├── salmon-schedule/
│       │   └── route.ts          # サーモンランのスケジュール（外部 API の中継・キャッシュ）
│       ├── telop/
│       │   └── route.ts          # 実況テロップAPI（いま出ているテロップ・プリセット）
│       ├── speech/
│       │   ├── route.ts          # 読み上げキューAPI
│       │   └── audio/
│       │       └── route.ts      # キューの1件を VOICEVOX で wav にして返す
│       ├── voice/
│       │   ├── route.ts          # 読み上げの設定API
│       │   └── speakers/
│       │       └── route.ts      # VOICEVOX の話者一覧の中継
│       ├── weapon-card/
│       │   └── route.ts          # ブキ埋めカードAPI
│       └── clip/
│           └── route.ts          # Twitch のクリップの依頼・結果API
├── components/                    # 再利用可能なReactコンポーネント
│   ├── ScoreDisplay.tsx          # スコア表示
│   ├── BurndownChart.tsx         # バーンダウンチャート
│   ├── MessageScroller.tsx       # メッセージスクロール
│   ├── RandomTipScroller.tsx     # ランダムTips表示
│   ├── HeartEffect.tsx           # ハートエフェクト
│   ├── StarEffect.tsx            # スターエフェクト
│   ├── BubbleEffect.tsx          # バブルエフェクト
│   ├── SparkleEffect.tsx         # スパークルエフェクト
│   ├── FireworksEffect.tsx       # 花火エフェクト
│   ├── SalmonStats.tsx           # サーモンランの前回・本日合計（タイトルは「本日の戦績」）
│   ├── BossRanking.tsx           # オオモノ討伐TOP3（サイドパネルのスロット）
│   ├── SalmonRunPanel.tsx        # コントロールパネルのサーモンランタブ
│   ├── SidePanelOverlay.tsx      # サイドパネルの本体（2 つのレイアウトで共通）
│   ├── SidePanelSettingsPanel.tsx # コントロールパネルのサイドパネルタブ
│   ├── InkTankGauge.tsx          # インクタンク型フォロワーゲージ
│   ├── ChallengeList.tsx         # 本日のお題（サイドパネルのスロット）
│   ├── SalmonSchedule.tsx        # サーモンランのスケジュール（サイドパネルのスロット）
│   ├── TelopBar.tsx              # コントロールパネル上部のテロップのボタン（どのタブでも表示）
│   ├── TelopPanel.tsx            # コントロールパネルのテロップタブ
│   ├── VoiceSettingsPanel.tsx    # 読み上げ（VOICEVOX）の設定（テロップタブ内）
│   ├── WeaponIcon.tsx            # ブキの画像（読み込めなければブキ名）
│   ├── WeaponPicker.tsx          # カテゴリごとのブキのパレット（記録・ブキ埋めタブで使う）
│   ├── WeaponCard.tsx            # ブキ埋めカード（オーバーレイ）
│   ├── WeaponCardPanel.tsx       # コントロールパネルのブキ埋めタブ
│   ├── SalmonReview.tsx          # サーモンランの振り返り（オーバーレイの本体）
│   └── ClipPanel.tsx             # コントロールパネルのクリップタブ
├── lib/
│   ├── localStorage.ts           # ローカルストレージのラッパー
│   ├── db.ts                     # SQLite の接続とスキーマ
│   ├── salmon.ts                 # サーモンラン記録のデータアクセス・入力検証（サーバー専用）
│   ├── salmonTypes.ts            # サーモンラン記録の型・定数（クライアントからも使う）
│   ├── sidePanelTypes.ts         # サイドパネルのスロット定義・設定の検証（クライアントからも使う）
│   ├── salmonSchedule.ts         # サーモンランのスケジュールの型・変換（クライアントからも使う）
│   ├── telopTypes.ts             # 実況テロップの型・プリセットの検証（クライアントからも使う）
│   ├── voiceTypes.ts             # 読み上げの型・設定の検証（クライアントからも使う）
│   ├── speech.ts                 # 読み上げキュー・設定・VOICEVOX との通信（サーバー専用）
│   ├── salmonWeapons.ts          # サーモンランのブキの定義・ブキ埋めカードの型（クライアントからも使う）
│   ├── weaponCard.ts             # ブキ埋めカードの状態（サーバー専用）
│   ├── salmonReview.ts           # サーモンランの振り返りの集計（サーバー専用）
│   ├── clipTypes.ts              # クリップの依頼の型・結果の検証（クライアントからも使う）
│   ├── clips.ts                  # クリップの依頼の保存（サーバー専用）
│   ├── salmonImportTypes.ts      # リザルトの取り込みの依頼の型・定数（クライアントからも使う）
│   ├── salmonImports.ts          # リザルトの取り込みの依頼の保存・記録・入力検証（サーバー専用）
│   ├── salmonBosses.ts           # オオモノシャケ・潮位の定義（クライアントからも使う）
│   └── weaponCardImage.ts        # ブキ埋めカードの SNS 投稿用の画像（Canvas で描く。クライアント専用）
├── data/                          # SQLite・Twitch トークン（Git / Docker イメージ管理外）
├── public/                        # 静的アセット
│   └── tips.tsv                  # Tips データ
├── tools/
│   ├── caption-stt/              # 文字起こしスクリプト（Python, README参照）
│   ├── salmon-result/            # リザルト取り込みスクリプト（Python, README参照）
│   └── twitch-eventsub/          # Twitch連携スクリプト（Node, README参照）
├── .github/
│   ├── workflows/
│   │   └── ci.yml                # CI/CDパイプライン
│   └── ISSUE_TEMPLATE/           # Issueテンプレート
├── **/*.test.{ts,tsx}            # テストファイル（各ファイルと同じディレクトリ）
├── vite.config.mts               # Vitest設定
├── vitest.setup.ts               # テストセットアップ
├── eslint.config.mjs             # ESLint設定（Flat Config）
├── tsconfig.json                 # TypeScript設定
├── tailwind.config.ts            # Tailwind CSS設定
├── docker-compose.yml            # Docker Compose設定
├── Dockerfile                    # Dockerイメージ定義
└── package.json                  # 依存関係とスクリプト
```

## データモデル

### StreamData インターフェース

コアデータ構造は `/app/api/stream-data/route.ts` で定義されています。

```typescript
export interface BurndownData {
  label: string;
  targetValue: number;
  entries: { score: number; timestamp: number }[]; // ポイント履歴
}

export interface MessagePreset {
  name: string;
  messages: string[];
}

export interface StreamData {
  scoreLabel: string;
  scoreValue: string;
  transitionEffect: string;          // 'slide' | 'fade' | 'scale' | 'none'
  transitionDuration: number;
  fontFamily: string;
  fontSize: number;
  messagePresets: MessagePreset[];
  activePresetName: string;
  lastEvent: {
    name: string;                     // 'heart' | 'star' | 'bubble' | 'sparkle'
    timestamp: number;
  } | null;
  burndown: BurndownData;
  revision: number;                   // クライアント再レンダリング用
}
```

### API エンドポイント

**`GET /api/stream-data`**
- 現在の `StreamData` を取得
- オーバーレイが定期的にポーリング

**`POST /api/stream-data`**
- `StreamData` を更新
- コントロールパネルから呼び出される
- `revision` が自動的にインクリメントされる

**`PATCH /api/stream-data`**
- `{event}`（`EFFECT_NAMES` = `LOVE` / `STAR` / `SPARKLE` / `BUBBLE`）で `lastEvent` だけを更新してエフェクトを出す（ほかの項目は変えない）
- 文字起こしスクリプト（`tools/caption-stt/`）から呼び出される。`Content-Type: application/json` 必須

## 主要ファイルの詳細

### `/app/api/stream-data/route.ts`

- インメモリで `StreamData` を管理
- `GET` と `POST` ハンドラーを提供
- `getInitialStreamData()` - 初期データを返す（テストでも使用）
- `__TEST_ONLY_setStreamData()` - テスト用のデータセッター

### `/app/control-panel/page.tsx`

タブ形式のコントロールパネル。以下の機能を提供：

1. **スコア表示タブ** - `scoreLabel`, `scoreValue`, トランジション設定
2. **バーンダウンタブ** - バーンダウンチャートの管理
3. **メッセージタブ** - メッセージプリセットの管理
4. **共通設定タブ** - フォント設定、エフェクトのボタン

#### 重要な機能

- **ローカルストレージ**: ユーザー設定を `'control-panel-state'` キーで永続化
- **エフェクトのトリガー**: `/api/stream-data` の `lastEvent` フィールドを更新（ボタンから。話した言葉で出すのは文字起こしスクリプト）

### `/app/obs-overlay/page.tsx`

メインのオーバーレイ画面。

- 1秒ごとに `/api/stream-data` をポーリング
- `ScoreDisplay` と `MessageScroller` を表示
- `lastEvent` に基づいてエフェクトをレンダリング
- `revision` が変更されたときに再レンダリング

### `/app/burndown-overlay/page.tsx`

バーンダウンチャート専用のオーバーレイ（250x584px）。

- 1秒ごとにデータをポーリング
- 目標達成時（残りポイント ≤ 0）に `FireworksEffect` を表示
- `BurndownChart` コンポーネントを使用

### `/app/api/caption/route.ts` と `/app/caption-overlay/page.tsx`

配信者の音声をリアルタイムに字幕表示する機能。

- 起動はリポジトリのルートで `pnpm caption`（`tools/caption-stt/run.sh`。初回は venv を自動作成）
- `tools/caption-stt/caption_stt.py` が Silero VAD で発話を区切り、mlx-whisper で文字起こしして `POST /api/caption {text}` する
- API は直近5件の字幕行をインメモリで保持（`DELETE` でクリア）。`getInitialCaptionData()` / `__TEST_ONLY_setCaptionData()` はテスト用。`POST` は `Content-Type: application/json` 必須（他サイトからの単純リクエスト対策）、1行は200文字で切り詰め
- オーバーレイは1秒ごとにポーリングし、8秒以内の最新2行を表示
- 精度対策（`caption_stt.py`）: スプラ用語の `GLOSSARY` とテロップのプリセットの文を `initial_prompt` に渡す（プロンプトが長すぎると先頭が切り捨てられるので用語集を後ろに置く）。`select_segments` で信頼度（`avg_logprob` / `no_speech_prob` / `compression_ratio`）の低いセグメントを、`caption_rejection` で日本語以外の文字・英字 3 文字以上の単語（`ALLOWED_LATIN` を除く）・相づち（`FILLERS`、1 文字以下）を除外し、除外理由をログに出す（しきい値は定数。ログを見て調整する）。0.4 秒未満の発話は文字起こししない
- エフェクト: `match_effect` が `EFFECT_KEYWORDS`（「ナイス」→ STAR、「ありがとう」→ LOVE、「よっしゃ」→ SPARKLE、「やべ」「やば」→ BUBBLE。上のものを優先）を含むか調べ、`PATCH /api/stream-data {event}` を送る。字幕・テロップとは別に出す（フィルタで除外した発話では出さない）。`EFFECT_MATCH=off` で無効。以前のコントロールパネルのブラウザ音声認識（Web Speech API）は廃止した
- テロップへの照合: `TelopMatcher` が 30 秒ごとに `GET /api/telop` でプリセットを取り直し、`match_telop`（NFKC・カタカナ→ひらがな・記号除去のうえ、含む（発話がテロップの 2 倍以下の長さ）か類似度 0.8 以上。2 文字以下は完全一致のみ）で一致したら `POST /api/telop {presetId, speak: false}` を送り（`TELOP_SPEAK=on` なら `speak` を送らずプリセットの設定どおりに読み上げる。無言配信向け。`telop_request`）、その発話は字幕にしない。同じテロップは 10 秒出し直さない。プリセットが取れない・出せないときは字幕として送る。`TELOP_MATCH=off` で無効
- モデルの比較: `CAPTION_SAVE_DIR` を指定すると発話ごとに wav と文字起こし結果を保存し、`pnpm caption --compare <DIR> --models a,b` で複数のモデルの結果・処理時間を並べる。`run.sh` は `cd` しない（相対パスを実行した場所から解釈するため）
- `/api/stream-data` とは別エンドポイント（コントロールパネルの保存と競合させないため）
- Python 側のテストは `tools/caption-stt/` で `pytest`（CI 対象外）

### `/app/api/twitch/route.ts` と `tools/twitch-eventsub/`

Twitch のフォロワー数とフォロワー目標を受け取る機能と、チャットの読み上げ。

- 起動はリポジトリのルートで `pnpm twitch`（`.env.local` の `TWITCH_CLIENT_ID` が必須。初回はブラウザで承認）
- `tools/twitch-eventsub/twitch_eventsub.ts` は Node 24 の型除去でそのまま実行するため、enum・コンストラクタ引数プロパティなど型除去できない構文は使わない（`tools/twitch-eventsub/package.json` で ESM 指定）
- 認証は Device Code Flow（Public クライアント、スコープ `moderator:read:followers` / `channel:read:goals` / `user:read:chat`。保存済みトークンにスコープが足りなければ承認し直す）。トークンは `data/twitch-token.json`（gitignore・dockerignore 済み）
- EventSub WebSocket で `channel.follow` v2 と `channel.goal.*`、`channel.chat.message` v1 を購読。フォロー通知では総数を加算し、60秒ごとに Helix から再同期して `/api/twitch` に送り直す
- チャットは `chatToSpeech`（純粋関数）で読み上げる文を決め、`publishSpeech` で `/api/speech`（`TWITCH_SPEECH_API_URL`、既定は `TWITCH_API_URL` と同じホスト）へ送る。視聴者は起動中に初めてコメントしたときだけ「〇〇さん、いらっしゃい！」（**本文は読まない**。挨拶済みのユーザー ID はメモリの Set だけ。名前は表示名を文のようにして読ませる悪用を防ぐため `speakableName` で NFKC・制御文字の除去・同じ文字の連続の短縮・20 文字までに整え、空ならログイン名）、配信者自身は本文（NFKC で全角をそろえてから、`!` コマンド・URL を含むものを除く。コードポイント単位で 100 文字まで）。`TWITCH_SPEECH_IGNORE`（カンマ区切りのログイン名）のボットと、共有チャットでほかのチャンネルから届いたものは読まない。読み上げが無効（409）なら黙って捨てる。挨拶を送れなかったとき（無効・送信失敗）は `speakChatMessage` が挨拶済みから外し、次のコメントで挨拶し直す。**視聴者の名前やコメントはログに出さない**
- API は `{followerTotal, goal, lastFollowAt, updatedAt, revision}` をインメモリで保持（`followerTotal: null` はスクリプト未起動）。**フォロワー名は保持しない**。`POST` は `Content-Type: application/json` 必須。`getInitialTwitchData()` / `__TEST_ONLY_setTwitchData()` はテスト用
- スクリプトのテストは Vitest（CI 対象）

### `/app/api/salmon/` と `lib/db.ts` / `lib/salmon.ts`

サーモンランの成績（金イクラ納品数・オオモノ処理数・デス数・クリア/失敗と到達WAVE・ステージ・支給ブキ）を記録する機能。

- 永続化は SQLite（`node:sqlite` の `DatabaseSync`）。パスは `OVERLAY_DB_PATH`（既定 `data/overlay.db`）。スキーマは初回接続時に `CREATE TABLE IF NOT EXISTS`
- 集計は **配信セッション単位**。最後に開始したセッションが「現在のセッション」。記録時にセッションが無ければ自動作成
- `GET /api/salmon`（`?sessionId=` で過去分）、`POST /api/salmon`（記録）、`DELETE /api/salmon?id=`（取り消し）、`GET/POST /api/salmon/sessions`（一覧・開始）。POST は `Content-Type: application/json` 必須
- `lib/salmon.ts` は `node:sqlite` に依存するのでクライアントコンポーネントから import しない。型と定数は `lib/salmonTypes.ts` から import する
- コントロールパネルの「サーモンラン」タブ（`components/SalmonRunPanel.tsx`）は API に直接保存する（「OBSに反映」ボタンや localStorage は使わない）
- テストは `vite.config.mts` の `OVERLAY_DB_PATH=:memory:` で実データに触れない。各テストで `__TEST_ONLY_setDb(openDb(':memory:'))` してから使う

### `/app/api/salmon/import/route.ts` と `tools/salmon-result/`

サーモンランのリザルトの手入力を減らすため、iPhone ミラーリングに映した NSO アプリ（イカリング3）から最新のリザルトを読み取って記録する機能。

- イカリング3の API は直接呼ばない（以前、非公式の API の利用でイカリングを BAN されたため）。公式アプリの画面をタップ・スクロールし、撮影して OCR するだけ。キャプチャ映像の OCR ではオオモノ討伐数が取れないので使わない
- 流れ: コントロールパネルの「サーモンラン」タブのボタン → `POST /api/salmon/import` → 取り込みスクリプト（`pnpm salmon-result`）が 1 秒ごとに `GET ?status=pending` で拾い `PATCH {id, status: 'processing'}` → `GET ?view=recorded`（記録済みのバイトの日時と今のセッションの開始時刻）→ バイトの詳細画面の「最新のバイトへ」で最新を表示して撮影・OCR → 「前のバイト」で取りこぼしを遡る → `PATCH {id, status: 'succeeded', jobs: [{job, playedAt}]（古い順）, captures}`（サーバーが `addJob` で今のセッションに記録）／ `{status: 'failed', error, captures}` → `POST /api/telop {text}` で知らせる
- 最新の表示: ヒストリーはタブを移っても読み込み直されない（ホーム → サーモンランでは新しいバイトが出ない）。詳細画面の「最新のバイトへ」で読み込み直す。押した直後は前の画面のままなので、「次のバイト」が押せなくなる（文字が灰色になる。`is_latest_job`）まで待つ。詳細画面でなければヒストリーのいちばん上を開いてから押す
- 取りこぼし: 最新のバイトから「前のバイト」で、記録済みのバイト・今のセッションの開始より前のバイト・`MAX_BACKFILL_JOBS`（20）件のどれかに着くまで遡る（`should_stop_backfill`。セッションが無ければ遡らない）。読めないバイトがあればそこでやめ、読めた分を記録する。「前回」が最新のバイトになるよう古い順に送る
- 依頼は SQLite の `salmon_imports`（`pending` / `processing` / `succeeded` / `failed`）。処理待ち・取り込み中の依頼があれば新しく作らずにそれを返す。拾われない依頼は `SALMON_IMPORT_REQUEST_TTL_MS`（30 秒）、取り込み中のまま止まった依頼は `SALMON_IMPORT_PROCESSING_TTL_MS`（6 分）で失敗にする（`expireStaleImports`）
- 二重記録の防止: 取り込んだバイトは `salmon_jobs.played_at`（画面の日時。手入力は NULL）を持ち、同じ日時のバイトは記録しない。送ったバイトがすべて記録済みなら 409。最新のバイトが記録済みなら、スクリプトはイカリング3にまだ反映されていないとみなし、15 秒ごとに最大 4 分読み直す。記録を削除したバイトは取り込み直せる。依頼には記録した数（`recorded_count`）と最新のバイト（`job_id` / `played_at`）を残す
- 読み取り（`salmon_result.py`）: 自分の行（プレイヤー一覧のいちばん上）の「オオモノシャケ x24」を OCR で見つけ、それを基準にした相対位置（`SelfRowCells`）の金イクラ・被救助数（= デス）を切り出して読む（全体を読むと隣の数字とつながるため）。数字のセルは倍率・白黒化を変えて何度か読んだ多数決（`vote_count`）。日時はステージの画像の上に白い文字で出るので、明るいステージでは全体の OCR で読めない。日時の部分を切り出して白黒化した結果との多数決（`read_played_at`）。クリア / 失敗は見出しの「Clear!!」/「Failure」を切り出して読み、似ているほうで判定する（装飾文字で Cear! などと読むため。「クリアボーナス」があるので日本語の「クリア」では判定しない）。失敗した WAVE は表示されている WAVE の最大（失敗したバイトはそこまでしか表示されない）。オカシラ（EX-WAVE）に負けても WAVE 3 までクリアならクリア。ステージ名は切り出して読み直し、`KNOWN_STAGES` の似た名前に直す。読めない項目があれば推測で記録せず失敗にする
- 支給ブキ: アイコンの数（WAVE 数とスペシャル）で並び方が 1 行 / 2 行と変わるので、位置は決め打ちせず、行の背景と色の違うまとまりを探す（`find_icon_blobs`）。外接矩形を埋める割合で、丸いブキ（0.77〜0.85）と四角いスペシャル（0.94〜0.96）を見分ける。ブキは Leanny/splat3 の画像（`lib/salmonWeapons.ts` を Node の型除去で読み、`data/salmon-weapon-refs/` にキャッシュ）と照合し、似ていなければ記録しない（`match_weapon`）。照合は丸の中の画素だけで、参照画像は黒い丸の中に 0.95 倍で置いて少しぼかし、小さなアイコンに見た目を合わせる（そのまま縮めると正解の類似度が 0.3 程度まで下がる）
- 画面の操作は `CGEventPost`。起動したアプリ（ターミナル）に「デバイスの制御とデータへのアクセス」（macOS 26 までは「アクセシビリティ」）の権限が無いとクリックが黙って無視されるので、`AXIsProcessTrusted` で確かめて知らせる。ミラーリングはアクセシビリティの API で前面にしてからクリックする。クリック・スクロールのたびにカーソルの位置と前面のアプリを元に戻す。ミラーリングの「接続が一時停止されました」は「再開」を押してつなぎ直す。撮影は `screencapture -l<ウインドウ ID>`（隠れていても撮れる）
- キャプチャは `data/salmon-results/`（ヒストリーとして残す）。PATCH の `captures` はファイル名のみ（`CAPTURE_FILE_PATTERN`。パスを含めさせない）。POST / PATCH は `Content-Type: application/json` 必須
- 詳細: 必須項目とは別に `read_details` でバイトの詳細（`SalmonJobDetails`。キケン度・評価・ポイント・チームのイクラ・ウロコ・オカシラ、WAVE ごとの納品数 / ノルマ・潮位・イベント・金イクラ出現数・スペシャルの数、4 人の成績・ブキ・スペシャル）を読み、PATCH の `jobs[].details` で送る。読めない項目は null、詳細の読み取りで例外が起きても `read_result` が詳細を null にして記録は続ける。WAVE の列は「WAVE n」/「EX-WAVE」の見出しを基準に、プレイヤーは各行の「オオモノシャケ」を基準に読む。スペシャルは Leanny/splat3 の画像と形（参照は不透明度、アイコンは明るさ）で照合する（`match_special`）。クリア / 失敗の見出しは、明るいステージでは倍率によって Failure に似た文字に読むので、倍率を変えた読み取りの多数決にする
- 詳細の保存: `salmon_jobs` の詳細の列（後から追加したので `migrate` で足す。手入力・以前の記録は NULL）と、子テーブル `salmon_job_waves` / `salmon_job_players` / `salmon_job_bosses`（`ON DELETE CASCADE`）。検証は `lib/salmon.ts` の `parseJobDetails`。オオモノの定義は `lib/salmonBosses.ts`（key は stat.ink、`image` は Leanny/splat3 の `coopEnemy`）、スペシャルは `lib/salmonWeapons.ts` の `SALMON_SPECIALS`
- オオモノの欄: 詳細画面を読んだ後、`BOSS_SCROLL_PIXELS` ずつ下にスクロールして撮影し（`*-bosses.png`）、「※カッコ内の数字は…」が見えるまで読む（`read_bosses`。オカシラが出たバイトは一覧が 1 画面に収まらない）。行はオオモノの名前（`lib/salmonBosses.ts` の `name`。短い「ヘビ」は名前だけ切り出して読み直す）で見つけ、同じオオモノを何度か読んだら多数決。数（「4(3) / 出現数x4」）は等倍の小さな文字で Vision では 7・1 を読み間違えるので、`digit_glyphs.py` の数字・カッコの形（fixtures から切り出したもの）と照合し、カッコの位置はすべての並び方から形がいちばん合うものにする（`read_kills`）。自分の討伐数の合計が自分の行の「オオモノシャケ xN」と合わなければ記録しない。読み終えたら先頭に戻す（最新のバイトで「最新のバイトへ」を押してもスクロールの位置は戻らない。「前のバイト」で移ると先頭に戻る。下のボタンはスクロールしても出ている）
- **味方の名前**（`salmon_job_players.name`）は DB に残すだけで、API・配信画面・ログ・`--read` の出力には出さない
- オオモノ討伐: `getSummary` の `bossRanking` で、前回のバイトとセッション合計の、オオモノごとの自分の討伐数（多い順・同数は `SALMON_BOSSES` の順・0 体は除く）を返す。サイドパネルの `bossRanking` スロット（`components/BossRanking.tsx`）は、前回と本日の TOP3 を左右に並べ、オオモノは画像（Leanny/splat3 の `coopEnemy`。読み込めなければ名前）で表す（スケジュールと並べても下段に収まる高さにするため）。本日のセッションにオオモノの数が 1 体も無い（手入力だけ・取り込み前）うちは表示しない
- Python 側のテストは `tools/salmon-result/` で `pytest`（CI 対象外。Vision を使うので Mac で実行）。`fixtures/` に実際の詳細画面（クリア・失敗・オカシラあり）と、オオモノの欄までスクロールした画面（`bosses-*.png`）を置いている。**プレイヤー名は塗りつぶしてから置く**

### `/app/weapon-card-overlay/page.tsx` と `/app/api/weapon-card/route.ts`

サーモンランのオールランダム編成で、支給されたブキを 1 種ずつ埋めて全種コンプを目指す「ブキ埋めカード」。

- ブキの定義は `lib/salmonWeapons.ts` の `SALMON_WEAPONS`（71 種 = 通常 63 + クマサン印 8。サーモンランで支給されないスプラスコープ・4Kスコープは除く）。key は stat.ink の `/api/v3/salmon/weapon` の key、`image` はゲーム内部のブキ名。並び順（カテゴリ順）がカード・パレットの並び。ブキが追加されたらここに足す
- 画像は Nintendo の画像を同梱しないよう Leanny/splat3 の `images/weapon_flat/Path_Wst_<内部名>.png` を参照する（`weaponImageUrl`）。リンク切れに備え、`WeaponIcon` は読み込めなければブキ名を文字で出す
- 戦績の記録（`SalmonJob`）に `weapons`（支給されたブキの key、最大 `MAX_JOB_WEAPONS` = 4 = 3 WAVE + EX、重複可、省略可）を追加した。`salmon_jobs.weapons` は後から追加した列なので、`openDb` の `migrate` で既存の DB に `ALTER TABLE` で足す（列を足すときは同じようにする）。保存値の壊れた JSON・未知の key は読み込み時に捨てる
- カードの状態は `app_state`（キー `weaponCard`）の `{startedAt, manual}`。埋まっているブキは「`startedAt` 以降に記録したバイトのブキ」と「手動で埋めたブキ」を合わせたもの（`getWeaponCard`）。記録から導出するので、記録を取り消すとマスも戻る。カードの区切りはサーモンランのセッションとは独立（セッションをまたいで続けられる）。両方で埋まったものは記録由来（`source: 'job'`）として扱い、手動では外せない
- `GET /api/weapon-card`（`{startedAt, total, obtained: {key, at, source}[]}`、埋まった順）、`PATCH {weapon, obtained}`（手動で埋める / 外す）、`POST`（新しいカードを始める）。PATCH / POST は `Content-Type: application/json` 必須
- コントロールパネルの「サーモンラン」タブでは記録フォームの `WeaponPicker` で支給ブキを選ぶ（押すたびに追加。外すときは選んだブキを押す）。「ブキ埋め」タブ（`components/WeaponCardPanel.tsx`）は進捗・手動の埋める / 外す・新しいカード（確認ダイアログ付き）。どちらもその場で保存
- サイドパネルの `weaponCard` スロットにも出せる（`<WeaponCard compact/>`。幅 250px に 12 列で縮めた、試合中に埋まり具合がなんとなくわかる程度の表示。スケジュールなどと並べても下段に収まる高さにしている）。`/weapon-card-overlay` は試合の合間などにたまに出す拡大表示という位置づけ
- 「ブキ埋め」タブの「画像をダウンロード」で、今のカードを SNS 投稿用の PNG（12 列 × 6 行の横長）にする（`lib/weaponCardImage.ts` の `renderWeaponCardImage`。DOM のキャプチャではなく Canvas に直接描く）。ブキの画像は `crossOrigin = 'anonymous'` で読み込み（raw.githubusercontent.com は CORS を許可している）、読み込めないブキはブキ名を文字で描く（Canvas を汚して書き出せなくならないように）。フォントはオーバーレイと同じく共通設定のもの（`/api/stream-data` の `fontFamily`）。Canvas は書式が不正な font を黙って無視するので `canvasFontFamily` でフォント名を引用符で囲み、そのフォントに無い文字用に日本語のシステムフォントを後ろに足す。描く前に `document.fonts.load` で読み込む
- オーバーレイは 2 秒ごとに `/api/weapon-card` と `/api/stream-data`（フォント）をポーリングする。`components/WeaponCard.tsx` は `ChallengeList` と同じく前回の状態と比べ、ポーリング中に新しく埋まったマスだけスタンプを押す演出をし、71 種そろった瞬間だけ花火を出す（表示した時点の状態・新しいカードの開始では演出しない）

### `/app/salmon-review-overlay/page.tsx` と `/app/api/salmon/review/route.ts`

配信の最後に、その日のサーモンランの記録を配信画面に大きく被せて振り返るオーバーレイ（1920x1080。背景は半透明の暗幕）。

- `GET /api/salmon/review`（`?sessionId=` で過去のセッション）。集計は `lib/salmonReview.ts` の `getSessionReview`（型は `lib/salmonTypes.ts` の `SalmonSessionReview`）。合計・バイトごとの金イクラ（古い順）・WAVE ごとの失敗数のほか、取り込んだバイトの詳細（赤イクラ・救助・獲得ポイント・最高キケン度・評価の最初と最後・オカシラ・オオモノごとの数・チームの金イクラ納品数の上位 5 件（`teamHighScores`。同数なら先のバイト））、支給ブキの回数、セッション中にブキ埋めカードで埋まったブキ・作ったクリップ（次のセッションの開始まで）、本日のお題の達成数（今のセッションのときだけ。サイドパネルの設定にしか無いため）を返す。**味方の名前は返さない**
- 詳細の集計は、詳細を取り込んだバイト（`detailedJobs`）だけ。手入力のバイトがあると、画面に「取り込んだ n 件の合計」と添える
- 本体は `components/SalmonReview.tsx`。グラフは依存を増やさず SVG・div で描く（dataviz スキルの作法: ダークの配色だけ、クリア / 失敗はどのグラフでも青 / オレンジ（色覚の違いでも見分けられることを検証済み）、棒は細く根元は四角・先は丸く、値は最多のバイトにだけ出す、目盛りはきりのいい数（`niceTicks`）、2 つの値を 1 つのグラフの左右の軸に出さない）。OBS ではマウスを使わないので、ツールチップは付けない
- 開いたときにカードを上から順に出す motion の演出（初回だけ）。5 秒ごとにポーリングし、フォントは `/api/stream-data` の `fontFamily`

### `/app/side-panel-overlay/page.tsx` と `/app/api/side-panel/route.ts`

配信画面右側（250x584）のサイドパネル。上段はインクタンク型フォロワーゲージ（`components/InkTankGauge.tsx`）、下段は「スロット」を表示する。

- 本体は `components/SidePanelOverlay.tsx`（`layout: 'side' | 'vertical'`）。2 つのページはこれを置くだけ（page.tsx は default 以外を export できないため）
- 縦型配信（1080x1920）用の `/side-panel-overlay/vertical` は、画面上部の横長の枠（990x440、x=45 y=115 付近）に置く。設定は共通で、左にフォロワーゲージ、右に固定枠を左から横に並べ、最後の列でローテーション枠を切り替える。背景は透過（OBS 側の画像の上に重ねる）。カードは 250px 幅のままなので、`verticalSlotScale`（列数と `estimateSlotHeight` から、枠に収まる最大の倍率。上限 1.5。ローテーション枠は一番高いスロットに合わせる）で拡大率を決め、拡大前の大きさの領域を `transform: scale()` で拡大する。表示するものが無いスロットは列を作らず、拡大率の計算にも数えない（`canShow` を渡す）
- スロットの定義は `lib/sidePanelTypes.ts` の `SIDE_PANEL_SLOTS`（現在は `schedule` / `salmon` / `bossRanking` / `weaponCard` / `challenges` / `burndown`。並び順が、固定枠で上から並べる順とローテーションの順）。スロットを追加するときは、ここと `SIDE_PANEL_SLOT_LABELS`、`components/SidePanelOverlay.tsx` の `renderSlot`・`canShow` に足す（2 つのレイアウトで共通）。縦型レイアウトで使う高さの目安 `estimateSlotHeight` にも足す
- 設定 `{fixedSlots, rotationSlots, rotateSeconds, followerGoal, challenges}` は SQLite のキーバリュー `app_state`（`getAppState` / `setAppState`、キー `sidePanel`）に保存。保存値が不正（スロット削除後など）なら既定値を返す
- オーバーレイは2秒ごとに `/api/side-panel`・`/api/salmon`・`/api/stream-data`・`/api/salmon-schedule`・`/api/weapon-card` をポーリングし（1つが失敗しても他は表示を続ける）、下段は「固定枠」と「ローテーション枠」に分かれる。固定枠（`fixedSlots`）は上から順に常に表示し、その下の残りのスペースでローテーション枠（`rotationSlots`）を `rotateSeconds` ごとに1つずつ motion のクロスフェードで切り替える（`pickRotationSlot`。ローテーション枠が空なら切り替えない。お題が0個・データ未取得など表示するものが無いスロットは飛ばす）
- 同じスロットを両方の枠に入れることはできず、両方の枠が空になることもできない。残りの高さいっぱいを使うスロット（`FULL_HEIGHT_SLOTS`、現在は `burndown`）は、固定枠に入れるときはそれ1つだけ（ローテーション枠も空）、ローテーション枠なら固定枠の下に表示できる。コントロールパネルでは、固定枠で選んだスロットはローテーション枠のボタンを無効にし、固定枠に移したスロットはローテーション枠から外す
- 固定枠が多いとローテーション枠の高さが足りず見切れる。`estimateSlotHeight` / `exceedsSlotArea` でスロットの高さの目安を合計し、下段（`SLOT_AREA_HEIGHT` = 約 440px、ゲージ表示時）に収まらない見込みならコントロールパネルで警告する（保存は止めない）。スロットの見た目を変えたら目安の値も見直す
- 以前の保存形式（`visibleSlots`、さらに前は `activeSlot` と、`autoRotate` / `enabledSlots`）は、自動ローテーション ON ならローテーション枠だけ、OFF なら固定枠だけとして読み込む（既存の設定を既定値に戻さない）
- オーバーレイのテストは `motion/react` を単純な要素に置き換えている（クロスフェード中に古いスロットが残ると、待ち時間内に消えずに不安定になるため）
- コントロールパネルの「サイドパネル」タブ（`components/SidePanelSettingsPanel.tsx`）は変更をその場で保存する（「OBSに反映」は不要）
- 既存の `/burndown-overlay` はそのまま残している（サイドパネルのバーンダウンスロットは花火エフェクトを出さない）
- フォロワーゲージは `/api/twitch` もポーリングして表示する。値は `getFollowerProgress`（`lib/sidePanelTypes.ts`）で決める: Twitch のクリエイターゴール（フォロワー型）を優先し、無ければフォロワー総数と手入力の `followerGoal`（設定に保存、`null` は未設定）。どちらも無い、または Twitch 連携スクリプトが未起動（`followerTotal: null`）ならゲージを出さない
- ゲージはフォローを受信すると（`lastFollowAt` の変化）インクを波打たせて `BubbleEffect` を出し、目標を変えずにフォロワー数が目標に届いたときだけ `FireworksEffect` を出す（目標の編集だけでは出さない。達成のたびに `key` で作り直して再生）。表示した時点の値では演出しない（オーバーレイの再読み込みで演出が出ないように）。泡と花火は vw / vh 基準なので、`absolute inset-0 z-50` でサイドパネルのルート（`relative`）全体を覆い、下段スロットより手前に出す
- `followerGoal` と `challenges` は後から追加した項目なので、保存済みの設定に無ければそれぞれ `null` / `[]` として扱う（既存の設定を既定値に戻さないため）。設定に項目を足すときも同じようにする
- 本日のお題（`challenges: {id, text, done}[]`、最大8個・各3行・改行を除いて40文字）はサイドパネル設定に含めて保存し、コントロールパネルで追加・削除・達成チェックする。`components/ChallengeList.tsx` は `done` が false → true に変わった瞬間だけスタンプを押す演出をする（前回の状態と比べてレンダー中に state を調整する。表示時点で達成済みのものやポーリングでは再生しない）。お題が0個なら何も表示しない
- お題の改行は配信者が折り返したい位置なので、`normalizeChallengeText` で各行の前後の空白と空行だけを除いて残し、オーバーレイ・コントロールパネルとも `white-space: pre-line` で表示する。入力欄は複数行（Enter は改行、Ctrl / ⌘ + Enter で追加）

### `/app/api/salmon-schedule/route.ts` と `lib/salmonSchedule.ts`

サーモンランのスケジュール（ステージ・支給ブキ・残り時間）を表示する機能。

- 非公式 API（https://spla3.yuu26.com/）の `coop-grouping/schedule` と `coop-grouping-team-contest/schedule` をサーバー側で中継する。利用規約に従い、連絡先（リポジトリの URL）入りの User-Agent を付ける
- 外部 API へのアクセスは 5 分キャッシュ（`CACHE_TTL_MS`）で抑え、同時のリクエストは1回にまとめる。失敗したら直前の値を返し、1 分（`RETRY_AFTER_FAILURE_MS`）は再取得しない。一度も取れていなければ 502
- 外部 API の取得は 10 秒（`FETCH_TIMEOUT_MS`）で打ち切り、応答は 1 MB（`MAX_RESPONSE_BYTES`）を超えた時点で読むのをやめる（`readLimitedText`）。画像 URL は https のものだけ受け付ける
- 非公式 API の仕様変更に備え、`parseScheduleResults` は形が想定と違う要素を捨てる。開催中のものは `pickCurrentSchedule` で選び、同じ時間帯ならバイトチームコンテスト > ビッグラン > 通常の順に優先する
- サイドパネルの `schedule` スロット（`components/SalmonSchedule.tsx`）で表示する。画像は外部の署名付き URL なので `next/image` を通さず `<img>` で表示する
- コントロールパネルの「サーモンラン」タブは、ステージ欄が空なら開催中のステージ名を入れる（手入力した値は上書きしない。取れなくても記録はできる）
- テストでは `fetch` を `vi.stubGlobal` で差し替え、`__TEST_ONLY_resetSalmonScheduleCache()` でキャッシュを消す

### `/app/telop-overlay/page.tsx` と `/app/api/telop/route.ts`

サーモンラン中などチャットを打てないときに、定型文の「実況テロップ」をワンボタンで出す機能。

- `POST /api/telop` に `{presetId, speak?}`（`speak: false` ならプリセットの設定によらず読み上げない。文字起こしから出すとき用）か `{text, followFont?}`（1 行・30 文字まで。`normalizeTelopText` で改行と連続する空白を空白 1 つにまとめる）を送るとテロップを出す。Stream Deck などからも同じ形で送れる（JSON 以外は 415、無いプリセットは 404）
- いま出ているテロップ `{id, text, followFont, timestamp}` はインメモリ（再起動で消えてよい）。プリセット `{id, text, speak, followFont}`（最大 12 個）は SQLite の `app_state`（キー `telop`）に保存し、`PUT /api/telop {presets}` で更新する。保存値が不正なら既定のプリセットを返す。`__TEST_ONLY_resetTelop()` はテスト用
- 型・定数・検証は `lib/telopTypes.ts`（クライアントからも使う）。`speak` は合成音声で読み上げるかの設定。`speak` が true のプリセット（自由入力は `speak: true` を付けたもの）は、出すと同時に `enqueueSpeech` で読み上げキューに入れる（読み上げが無効なら入れない）
- `followFont` は共通設定のフォント（`/api/stream-data` の `fontFamily`）で表示するか。そのフォントに無い文字が化けるテロップは false にして `sans-serif` で出す。後から追加した項目なので、保存済みのプリセットに無ければ true とみなす（自由入力で省略したときも true）
- オーバーレイは 0.5 秒ごとにポーリングし（フォントは 2 秒ごとに `/api/stream-data` から取得）、出してから `TELOP_DISPLAY_DURATION`（4 秒）以内のものだけ表示する（開き直したときに古いテロップを出さない）。テロップごとにインクの色を変える
- プリセットのボタンは、コントロールパネルのタイトルとタブの間の `components/TelopBar.tsx`（テロップバー）に置き、どのタブでも表示する（サーモンランタブで戦績を入力しながら出せるように。スクロールしても見えるよう `position: sticky`。そのためコントロールパネルのルートは `overflow: hidden` ではなく `clip`）。テロップバーは `window` の keydown で 1〜9, 0 を受け、並び順のプリセットを出す（入力欄・プルダウン（MUI の Select の `role=combobox` / `option`）にフォーカスがあるとき・IME 変換中・修飾キー付き・キーリピートは無視）
- 「テロップ」タブ（`components/TelopPanel.tsx`）は、自由入力とプリセットの編集（変更はその場で保存）。保存のたびに（失敗して読み込み直したときも）`onPresetsChange` を呼び、コントロールパネルがテロップバーの `reloadKey` を進めてプリセットを読み込み直させる

### `/app/voice-overlay/page.tsx` と `/app/api/speech/` / `/app/api/voice/`

合成音声（VOICEVOX）で、テロップなどを読み上げて配信に声を入れる機能。

- 読み上げキュー（`lib/speech.ts`、サーバー専用）はインメモリ。`/api/speech` と `/api/telop` など複数のルートから使うので、ルートごとにモジュールが別に読み込まれても共有できるよう `globalThis` に置く。1 件 100 文字まで（超えたら切り詰め）・最大 20 件・60 秒で破棄。ID は起動時刻から振る（サーバーを再起動しても、開いたままのオーバーレイが新しい読み上げを再生済みと取り違えないように）。`enqueueSpeech` は読み上げが無効・話者が未選択なら追加せず null を返す（`POST /api/speech` は 409）。`__TEST_ONLY_resetSpeechQueue()` はテスト用
- `/api/speech/audio?id=` はキューにある id だけを受け付け、VOICEVOX の `audio_query` → `synthesis` を中継して wav を返す（任意の文を読ませないため）。合成は ID ごとに 1 回だけ（`synthesizeSpeech` が結果をキャッシュし、失敗したら次の要求で合成し直す。合成後に速度・音量を変えても、合成済みのものはそのまま）。VOICEVOX との通信は 10 秒（`VOICEVOX_TIMEOUT_MS`）で打ち切り、応答は `audio_query` 1 MB・wav 20 MB を超えた時点で読むのをやめる。失敗したら 502
- 設定 `{enabled, speakerId, speakerName, speedScale, volumeScale}` は SQLite の `app_state`（キー `voice`）。既定は無効。`speakerId` は VOICEVOX のスタイル ID、`speakerName` はクレジット表記（`voiceCredit` → `VOICEVOX:キャラ名`）用のキャラクター名。`/api/voice/speakers` は VOICEVOX の `/speakers` の中継で、歌唱用（`type` が `talk` 以外）のスタイルは除く（`parseSpeakers`）
- オーバーレイは 0.5 秒ごとにキューを取得し、開いた時点でキューにあったものは再生しない。新しいものを 1 件ずつ順に `Audio` で再生し、再生できなかったとき（VOICEVOX 未起動・自動再生の拒否など）も止まらずに次へ進む
- コントロールパネルの「テロップ」タブの下に `components/VoiceSettingsPanel.tsx`（有効/無効・話者・速度・音量・テスト再生・クレジット表記）。VOICEVOX に接続できなくても保存済みの話者は表示する
- テストでは `fetch` を `vi.stubGlobal` で差し替える（実際の VOICEVOX には接続しない）

### `/app/api/clip/route.ts` と `lib/clips.ts`

配信中にゲームをしていてボタンを押せないので、声で Twitch のクリップを作る機能。

- 流れ: 文字起こしスクリプトが合言葉（`CLIP_PATTERN`。「クリップ」＋「撮って / して / お願い」など、または「今の（とこ）クリップ」。「クリップ」単体では雑談で誤爆するので作らない）を聞くと `POST /api/clip {source: 'voice'}` → Twitch 連携スクリプトが 1 秒ごとに `GET /api/clip?status=pending` で拾い、Helix の `POST /clips` で作って `PATCH /api/clip {id, status, clipId, editUrl | error}` → `POST /api/telop {text, speak: true}` で「クリップしました！」/「クリップできませんでした」をテロップ＋読み上げで知らせる。コントロールパネルの「クリップ」タブ（`components/ClipPanel.tsx`）のボタンも同じ依頼を送る（`source: 'button'`）
- Twitch のトークンは Twitch 連携スクリプトだけが持つ（Public クライアントのリフレッシュトークンは使い捨てなので、別のプロセスと共有しない）。そのため依頼は API を介して受け渡す。スコープ `clips:edit` を追加した（保存済みのトークンは承認し直し）
- 依頼は SQLite の `twitch_clips`（`pending` / `created` / `failed`）。処理待ちの依頼があれば新しく作らずにそれを返す（連呼・連打で同じ場面を重ねて作らない）。`CLIP_REQUEST_TTL_MS`（30 秒）以内に処理されなかった依頼は、一覧・取得のたびに `expireStaleRequests` で期限切れ（失敗）にする（スクリプトを後から起動したときに、別の場面のクリップを作らないように）。作成中に期限切れにされたものも、結果は書き込める
- Twitch 連携スクリプトの `createClipProcessor` は前回の処理中なら何もせず、一度試した依頼はやり直さない（結果を送れなくても同じ依頼から 2 つ作らない）。文字起こし側（`ClipTrigger`）も 30 秒は依頼し直さず、合言葉を言った発話は字幕・テロップにしない。`CLIP_MATCH=off` で無効
- `DELETE /api/clip?id=` は履歴から消すだけ（Twitch 上のクリップは消さない）。作成待ちのものは 409（作成中に消すと結果を書き込めずに失われるため）。PATCH の `editUrl` は twitch.tv の https のページのみ（偽のページへのリンクにしないため）、`clipId` は英数字・`-`・`_` のみ受け付ける（コントロールパネルでリンクにするため）。POST / PATCH は `Content-Type: application/json` 必須

### `/components/ScoreDisplay.tsx`

スコアとラベルを表示するコンポーネント。

- `scoreValue` が変更されたときにアニメーションを実行
- 設定可能なトランジションエフェクト（slide/fade/scale/none）
- ESLint警告: `react-hooks/set-state-in-effect` を意図的に無効化（アニメーション目的）

### `/components/BurndownChart.tsx`

バーンダウンチャートを描画するコンポーネント。

- 折れ線グラフ（SVG）
- 目標値と現在値を表示
- プログレスバー（バーンアップ形式）
- 残りポイントと達成率を計算して表示

### エフェクトコンポーネント

すべてのエフェクトコンポーネント（`HeartEffect`, `StarEffect`, `BubbleEffect`, `SparkleEffect`, `FireworksEffect`）は以下のパターンに従います：

- **`isTriggered` プロップ**: エフェクトの表示をトリガー
- **`useEffect`**: `isTriggered` が `true` になったときにアニメーションを開始
- **Motion**: アニメーション用に `motion` ライブラリを使用
- **ランダム性**: アニメーション初期化時にランダム値を計算（`react-hooks/purity` 対応）

## 開発ワークフロー

### コーディング時の重要なルール

1. **既存ファイルの優先**: 新規ファイル作成は最小限に。既存ファイルの編集を優先
2. **テストコードの作成**: 新機能やバグ修正には必ずテストを作成
3. **テストファイルの配置**: 対象ファイルと同じディレクトリに `[name].test.{ts,tsx}` として配置
4. **過剰な設計を避ける**: 要求された変更のみを実装。不要なリファクタリングや追加機能は避ける
5. **後方互換性のハック禁止**: 未使用のコードは完全に削除

### テストの作成

```bash
# テスト実行
pnpm run test

# ウォッチモード
pnpm run test:watch

# カバレッジレポート
pnpm run test:coverage
```

#### テストのベストプラクティス

- **React Testing Library**: ユーザーの視点でコンポーネントをテスト
- **@testing-library/jest-dom**: マッチャー拡張（`toBeInTheDocument` など）
- **APIルートのテスト**: `getInitialStreamData` と `__TEST_ONLY_setStreamData` を活用
- **設定ファイルのテスト**: YAMLファイルは `fs` + `js-yaml` でパース・検証

### Linting

```bash
# Lintチェック
pnpm run lint

# 自動修正
pnpm run lint --fix
```

### CI/CDパイプライン

GitHub Actionsで以下のワークフローが実行されます：

1. **Lint**: ESLintでコード品質チェック
2. **Test**: Vitestでテスト実行 + カバレッジレポート
3. **Docker Build & Push** (mainブランチのみ):
   - Docker Hub
   - GitHub Container Registry (GHCR)

#### プルリクエスト時の動作

- Lint → Test の順に実行
- カバレッジレポートがPRコメントに投稿される
- すべてのチェックがパスしないとマージ不可

## ローカルストレージ

### 使用箇所

- **コントロールパネル** (`/control-panel`): ユーザー設定を永続化

### データ構造

- **キー**: `'control-panel-state'`
- **データ**: `FormData` インターフェース全体をJSON形式で保存

### 動作

- **保存**: `formData` ステートが変更されるたびに自動保存
- **読み込み**: コンポーネントマウント時に読み込み。破損時はAPIからデフォルト値を取得
- **キャッシュクリア**: エラー発生時にUIでクリアボタンを表示

## ESLint規約とトラブルシューティング

### 自動修正の試行

エラーが発生したら、まず以下を実行：

```bash
pnpm run lint --fix
```

### よくあるESLintエラーと対応

#### 1. `import/order`

- **原因**: インポート文の順序やグループ分けが規則に違反
- **対応**: `pnpm run lint --fix` で自動修正

#### 2. `react-hooks/exhaustive-deps`

- **原因**: フックの依存関係配列に不足がある
- **対応**:
  - 提案に従って依存関係を追加
  - 関数は `useCallback` でラップして安定化
  - 正当な理由がある場合は `// eslint-disable-next-line` でコメント付きで無効化

#### 3. `react-hooks/set-state-in-effect`

- **原因**: `useEffect` 内で直接 `setState` を呼び出している
- **対応**: アニメーション起動など正当な理由がある場合はコメント付きで無効化
- **該当箇所**: `ScoreDisplay.tsx`, `BurndownChart.tsx`, `FireworksEffect.tsx`, `app/burndown-overlay/page.tsx`, `app/control-panel/page.tsx`

#### 4. `react-hooks/purity`

- **原因**: レンダリング中に `Math.random()` などの副作用のある関数を呼び出し
- **対応**: コンポーネント初期化時や `useEffect` 内で一度だけ計算し、状態/Refに保持
- **該当箇所**: エフェクトコンポーネントの `motion.div` `animate` プロパティ

#### 5. `@typescript-eslint/ban-ts-comment`

- **原因**: `@ts-ignore` の使用が制限されている
- **対応**: `@ts-expect-error` に置き換える
- **注意**: 本プロジェクトでは設定ファイルでこのルールを一時的に無効化

## Git Workflow

### ブランチ戦略

- **`main`**: 本番ブランチ（Docker自動デプロイ）
- **`staging`**: ステージング環境用
- フィーチャーブランチから `main` または `staging` にPRを作成

### コミットメッセージ

一般的な慣習に従う：

```
fix: スコア表示のアニメーションバグを修正
feat: 音声認識エフェクト機能を追加
test: BurndownChartコンポーネントのテストを追加
refactor: エフェクトコンポーネントのランダム値生成を改善
```

## Docker

### ビルドと起動

```bash
# ビルド
docker-compose build

# 起動
docker-compose up

# 停止とクリーンアップ
docker-compose down
```

### アクセス

起動後、`http://localhost:3000` でアプリケーションにアクセス可能。

## 追加情報

### パフォーマンス最適化

- オーバーレイは1秒ごとにポーリング（調整可能）
- `revision` フィールドでクライアントの不要な再レンダリングを防止

### 今後の拡張

新しい画面やオーバーレイを追加する場合：

1. `/app` に新しいルートを作成
2. `/app/page.tsx` の `OVERLAY_PAGES` に追加（映像の大きさ `size` を入れるとランチャーにプレビューが出る）
3. 必要に応じて `StreamData` インターフェースを拡張
4. テストファイルを作成

## トラブルシューティング

### ローカルストレージのエラー

- コントロールパネルでキャッシュクリアボタンをクリック
- または開発者ツールで `localStorage.removeItem('control-panel-state')` を実行

### テスト失敗

- `next/navigation` のモックが `vitest.setup.ts` で設定されているか確認
- `whatwg-fetch` がインポートされているか確認

### 型エラー

- `pnpm run build` でビルドエラーを確認
- `tsconfig.json` の設定を確認

## 参考リンク

- [Next.js App Router ドキュメント](https://nextjs.org/docs/app)
- [Material-UI ドキュメント](https://mui.com/material-ui/getting-started/)
- [Motion ドキュメント](https://motion.dev/docs)
- [Vitest ドキュメント](https://vitest.dev/)

---

このガイドを参考に、効率的にプロジェクトの開発を進めてください。
