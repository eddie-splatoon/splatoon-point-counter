# CLAUDE Code プロジェクトガイド: Splatoon Point Counter

このドキュメントは、Claude Codeがこのプロジェクトで効率的に作業できるように作成されたガイドです。

## プロジェクト概要

**Splatoon Point Counter** は、OBS向けのリアルタイム・データオーバーレイ・システムです。Next.js (App Router) とTypeScriptで構築されており、ストリーマーがコントロールパネルから配信画面上のオーバーレイをリアルタイムで制御できます。

### 主要な構成要素

1. **ランチャーページ** (`/`) - 各画面へのアクセスポイント
2. **コントロールパネル** (`/control-panel`) - ストリーマーがデータを更新するUI
3. **スコア＆メッセージオーバーレイ** (`/obs-overlay`) - メインのオーバーレイ表示
4. **バーンダウンチャートオーバーレイ** (`/burndown-overlay`) - 進捗状況を可視化
5. **字幕オーバーレイ** (`/caption-overlay`) - 配信者の音声をリアルタイムに字幕表示
6. **サイドパネルオーバーレイ** (`/side-panel-overlay`) - 配信画面右側（250x584）。上段にフォロワーゲージ、下段にコントロールパネルで選んだスロットを表示
7. **実況テロップオーバーレイ** (`/telop-overlay`) - コントロールパネルのボタン・キーボードで出す定型文を数秒だけ大きく表示
8. **バックエンドAPI** (`/api/stream-data`, `/api/caption`, `/api/twitch`, `/api/salmon`, `/api/side-panel`, `/api/salmon-schedule`, `/api/telop`) - データ管理とクライアント間の同期
9. **文字起こしスクリプト** (`tools/caption-stt/`) - マイク音声を文字起こしして `/api/caption` へ送信（Python, Mac ネイティブ実行）
10. **Twitch連携スクリプト** (`tools/twitch-eventsub/`) - フォロワー数・フォロワー目標を EventSub で受信して `/api/twitch` へ送信（Node, 依存なし）

## 技術スタック

- **フレームワーク**: Next.js 16+ (App Router)
- **言語**: TypeScript 5+
- **UI/スタイリング**: Material-UI (MUI) v9, Tailwind CSS v4
- **アニメーション**: Motion (旧Framer Motion) v13
- **リアルタイム通信**: REST API + クライアントサイドポーリング
- **HTTPクライアント**: Axios
- **ブラウザAPI**: Web Speech API (音声認識機能)
- **文字起こし**: mlx-whisper + Silero VAD (Python 3.12, `tools/caption-stt/`)
- **Twitch連携**: EventSub WebSocket + Device Code Flow（Node 24 標準の `fetch` / `WebSocket` と型除去で実行, `tools/twitch-eventsub/`）
- **永続化**: SQLite（Node 24 標準の `node:sqlite`, `lib/db.ts`。`data/overlay.db`）
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
│   │   └── page.tsx              # サイドパネルオーバーレイ
│   ├── telop-overlay/
│   │   └── page.tsx              # 実況テロップオーバーレイ
│   └── api/
│       ├── stream-data/
│       │   └── route.ts          # データ管理API
│       ├── caption/
│       │   └── route.ts          # 字幕API
│       ├── twitch/
│       │   └── route.ts          # Twitch API（フォロワー数・目標）
│       ├── salmon/
│       │   ├── route.ts          # サーモンラン記録API
│       │   └── sessions/
│       │       └── route.ts      # サーモンランのセッションAPI
│       ├── side-panel/
│       │   └── route.ts          # サイドパネル設定API
│       ├── salmon-schedule/
│       │   └── route.ts          # サーモンランのスケジュール（外部 API の中継・キャッシュ）
│       └── telop/
│           └── route.ts          # 実況テロップAPI（いま出ているテロップ・プリセット）
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
│   ├── SalmonRunPanel.tsx        # コントロールパネルのサーモンランタブ
│   ├── SidePanelSettingsPanel.tsx # コントロールパネルのサイドパネルタブ
│   ├── InkTankGauge.tsx          # インクタンク型フォロワーゲージ
│   ├── ChallengeList.tsx         # 本日のお題（サイドパネルのスロット）
│   ├── SalmonSchedule.tsx        # サーモンランのスケジュール（サイドパネルのスロット）
│   └── TelopPanel.tsx            # コントロールパネルのテロップタブ
├── lib/
│   ├── localStorage.ts           # ローカルストレージのラッパー
│   ├── db.ts                     # SQLite の接続とスキーマ
│   ├── salmon.ts                 # サーモンラン記録のデータアクセス・入力検証（サーバー専用）
│   ├── salmonTypes.ts            # サーモンラン記録の型・定数（クライアントからも使う）
│   ├── sidePanelTypes.ts         # サイドパネルのスロット定義・設定の検証（クライアントからも使う）
│   ├── salmonSchedule.ts         # サーモンランのスケジュールの型・変換（クライアントからも使う）
│   └── telopTypes.ts             # 実況テロップの型・プリセットの検証（クライアントからも使う）
├── data/                          # SQLite・Twitch トークン（Git / Docker イメージ管理外）
├── public/                        # 静的アセット
│   └── tips.tsv                  # Tips データ
├── tools/
│   ├── caption-stt/              # 文字起こしスクリプト（Python, README参照）
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
4. **共通設定タブ** - フォント設定、音声認識エフェクト

#### 重要な機能

- **ローカルストレージ**: ユーザー設定を `'control-panel-state'` キーで永続化
- **音声認識**: Web Speech API を使用してキーワード（「ナイス」「ありがとう」など）を検出し、エフェクトをトリガー
- **エフェクトのトリガー**: `/api/stream-data` の `lastEvent` フィールドを更新

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
- `/api/stream-data` とは別エンドポイント（コントロールパネルの保存と競合させないため）
- Python 側のテストは `tools/caption-stt/` で `pytest`（CI 対象外）

### `/app/api/twitch/route.ts` と `tools/twitch-eventsub/`

Twitch のフォロワー数とフォロワー目標を受け取る機能。

- 起動はリポジトリのルートで `pnpm twitch`（`.env.local` の `TWITCH_CLIENT_ID` が必須。初回はブラウザで承認）
- `tools/twitch-eventsub/twitch_eventsub.ts` は Node 24 の型除去でそのまま実行するため、enum・コンストラクタ引数プロパティなど型除去できない構文は使わない（`tools/twitch-eventsub/package.json` で ESM 指定）
- 認証は Device Code Flow（Public クライアント、スコープ `moderator:read:followers` / `channel:read:goals`）。トークンは `data/twitch-token.json`（gitignore・dockerignore 済み）
- EventSub WebSocket で `channel.follow` v2 と `channel.goal.*` を購読。フォロー通知では総数を加算し、60秒ごとに Helix から再同期して `/api/twitch` に送り直す
- API は `{followerTotal, goal, lastFollowAt, updatedAt, revision}` をインメモリで保持（`followerTotal: null` はスクリプト未起動）。**フォロワー名は保持しない**。`POST` は `Content-Type: application/json` 必須。`getInitialTwitchData()` / `__TEST_ONLY_setTwitchData()` はテスト用
- スクリプトのテストは Vitest（CI 対象）

### `/app/api/salmon/` と `lib/db.ts` / `lib/salmon.ts`

サーモンランの成績（金イクラ納品数・オオモノ処理数・デス数・クリア/失敗と到達WAVE・ステージ）を記録する機能。

- 永続化は SQLite（`node:sqlite` の `DatabaseSync`）。パスは `OVERLAY_DB_PATH`（既定 `data/overlay.db`）。スキーマは初回接続時に `CREATE TABLE IF NOT EXISTS`
- 集計は **配信セッション単位**。最後に開始したセッションが「現在のセッション」。記録時にセッションが無ければ自動作成
- `GET /api/salmon`（`?sessionId=` で過去分）、`POST /api/salmon`（記録）、`DELETE /api/salmon?id=`（取り消し）、`GET/POST /api/salmon/sessions`（一覧・開始）。POST は `Content-Type: application/json` 必須
- `lib/salmon.ts` は `node:sqlite` に依存するのでクライアントコンポーネントから import しない。型と定数は `lib/salmonTypes.ts` から import する
- コントロールパネルの「サーモンラン」タブ（`components/SalmonRunPanel.tsx`）は API に直接保存する（「OBSに反映」ボタンや localStorage は使わない）
- テストは `vite.config.mts` の `OVERLAY_DB_PATH=:memory:` で実データに触れない。各テストで `__TEST_ONLY_setDb(openDb(':memory:'))` してから使う

### `/app/side-panel-overlay/page.tsx` と `/app/api/side-panel/route.ts`

配信画面右側（250x584）のサイドパネル。上段はインクタンク型フォロワーゲージ（`components/InkTankGauge.tsx`）、下段は「スロット」を表示する。

- スロットの定義は `lib/sidePanelTypes.ts` の `SIDE_PANEL_SLOTS`（現在は `schedule` / `salmon` / `challenges` / `burndown`。並び順が、固定枠で上から並べる順とローテーションの順）。スロットを追加するときは、ここと `SIDE_PANEL_SLOT_LABELS`、オーバーレイの `renderSlot` に足す
- 設定 `{fixedSlots, rotationSlots, rotateSeconds, followerGoal, challenges}` は SQLite のキーバリュー `app_state`（`getAppState` / `setAppState`、キー `sidePanel`）に保存。保存値が不正（スロット削除後など）なら既定値を返す
- オーバーレイは2秒ごとに `/api/side-panel`・`/api/salmon`・`/api/stream-data` をポーリングし（1つが失敗しても他は表示を続ける）、下段は「固定枠」と「ローテーション枠」に分かれる。固定枠（`fixedSlots`）は上から順に常に表示し、その下の残りのスペースでローテーション枠（`rotationSlots`）を `rotateSeconds` ごとに1つずつ motion のクロスフェードで切り替える（`pickRotationSlot`。ローテーション枠が空なら切り替えない）
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

- `POST /api/telop` に `{presetId}` か `{text}`（1 行・30 文字まで。`normalizeTelopText` で改行と連続する空白を空白 1 つにまとめる）を送るとテロップを出す。Stream Deck などからも同じ形で送れる（JSON 以外は 415、無いプリセットは 404）
- いま出ているテロップ `{id, text, timestamp}` はインメモリ（再起動で消えてよい）。プリセット `{id, text, speak}`（最大 12 個）は SQLite の `app_state`（キー `telop`）に保存し、`PUT /api/telop {presets}` で更新する。保存値が不正なら既定のプリセットを返す。`__TEST_ONLY_resetTelop()` はテスト用
- 型・定数・検証は `lib/telopTypes.ts`（クライアントからも使う）。`speak` は合成音声で読み上げるかの設定で、読み上げは別 Issue（#76）で対応する
- オーバーレイは 0.5 秒ごとにポーリングし、出してから `TELOP_DISPLAY_DURATION`（4 秒）以内のものだけ表示する（開き直したときに古いテロップを出さない）。テロップごとにインクの色を変える
- コントロールパネルの「テロップ」タブ（`components/TelopPanel.tsx`）は、プリセットのボタン・自由入力・プリセットの編集（変更はその場で保存）。タブを開いている間は `window` の keydown で 1〜9, 0 を受け、並び順のプリセットを出す（入力欄にフォーカスがあるとき・IME 変換中・修飾キー付き・キーリピートは無視）

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

### ブラウザ互換性

- **Web Speech API**: Chrome/Edge でのみ完全サポート。他のブラウザでは音声認識機能が動作しない可能性あり

### パフォーマンス最適化

- オーバーレイは1秒ごとにポーリング（調整可能）
- `revision` フィールドでクライアントの不要な再レンダリングを防止

### 今後の拡張

新しい画面やオーバーレイを追加する場合：

1. `/app` に新しいルートを作成
2. `/app/page.tsx` のランチャーにボタンを追加
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
- [Web Speech API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API)

---

このガイドを参考に、効率的にプロジェクトの開発を進めてください。
