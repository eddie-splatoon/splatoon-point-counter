# CLAUDE Code プロジェクトガイド: Splatoon Point Counter

このドキュメントは、Claude Codeがこのプロジェクトで効率的に作業できるように作成されたガイドです。

## プロジェクト概要

**Splatoon Point Counter** は、OBS向けのリアルタイム・データオーバーレイ・システムです。Next.js (App Router) とTypeScriptで構築されており、ストリーマーがコントロールパネルから配信画面上のオーバーレイをリアルタイムで制御できます。

### 主要な構成要素

1. **ランチャーページ** (`/`) - 各画面へのアクセスポイント。全オーバーレイを iframe の縮小プレビューで常に表示し、カードのアイコン・プレビューのクリックで別タブで開く（読み上げは埋め込むと音声が鳴るのでプレビューしない）。ページの一覧は `lib/overlayPages.ts` の `OVERLAY_PAGES`（設定の「OBS のブラウザソース」と共通）
2. **コントロールパネル** (`/control-panel`) - ストリーマーがデータを更新するUI
3. **スコア＆メッセージオーバーレイ** (`/obs-overlay`) - メインのオーバーレイ表示
4. **バーンダウンチャートオーバーレイ** (`/burndown-overlay`) - 進捗状況を可視化
5. **字幕オーバーレイ** (`/caption-overlay`) - 配信者の音声をリアルタイムに字幕表示
6. **サイドパネルオーバーレイ** (`/side-panel-overlay`) - 配信画面右側（250x584）。上段にフォロワーゲージ、下段にコントロールパネルで選んだスロットを表示。縦型配信用の横長レイアウト（990x440）は `/side-panel-overlay/vertical`
7. **実況テロップオーバーレイ** (`/telop-overlay`) - コントロールパネルのボタン・キーボードで出す定型文を数秒だけ大きく表示。縦型配信用（1080x1920、画面の下のほうに出す）は `/telop-overlay/vertical`
8. **読み上げ（音声専用）オーバーレイ** (`/voice-overlay`) - 読み上げキューの文を VOICEVOX で音声にして順に再生（画面には何も出さない）
9. **ブキ埋めカードオーバーレイ** (`/weapon-card-overlay`) - サーモンランのオールランダムで支給された全ブキ種（71 種）を埋めていくカード
10. **サーモンランの振り返りオーバーレイ** (`/salmon-review-overlay`) - 配信の最後に、その日（セッション）のサーモンランの記録をグラフで大きく出す（1920x1080）。縦型配信用（1080x1920）は `/salmon-review-overlay/vertical`。コントロールパネルから SNS 用の PNG でダウンロードできる
11. **視聴者参加の受付オーバーレイ** (`/join-queue-overlay`) - チャットの `!参加` で並んだ列（番号・表示名）と書き方・部屋の推定キケン度を出す（420x600。受付中だけ表示）
12. **休憩中オーバーレイ** (`/break-overlay`) - コントロールパネル上部の「休憩する」で、席を離れている間「休憩中・ちょっと待っててね🐟️」と経過時間を大きく出す（1920x1080）。縦型配信用（1080x1920）は `/break-overlay/vertical`
13. **バックエンドAPI** (`/api/stream-data`, `/api/score-display`, `/api/caption`, `/api/twitch`, `/api/salmon`, `/api/side-panel`, `/api/salmon-schedule`, `/api/telop`, `/api/speech`, `/api/voice`, `/api/weapon-card`, `/api/clip`, `/api/salmon/import`, `/api/salmon/review`, `/api/join-queue`, `/api/break`) - データ管理とクライアント間の同期
14. **文字起こしスクリプト** (`tools/caption-stt/`) - マイク音声を文字起こしして `/api/caption` へ送信。「クリップ撮って」などで `/api/clip` にクリップを依頼。休憩中に拾った声を `/api/break` に知らせる（Python, Mac ネイティブ実行）
15. **リザルト取り込みスクリプト** (`tools/salmon-result/`) - iPhone ミラーリングのイカリング3を操作し、サーモンランの最新のリザルトを OCR で読み取って `/api/salmon/import` へ送信（Python, Mac ネイティブ実行）
16. **Twitch連携スクリプト** (`tools/twitch-eventsub/`) - フォロワー数・フォロワー目標を EventSub で受信して `/api/twitch` へ送信。チャットの初コメの挨拶・配信者のコメントを `/api/speech` へ送信。`/api/clip` の依頼で Twitch のクリップを作成。チャットの `!参加` / `!取消`・削除・BAN・配信の終了・再接続を `/api/join-queue` へ送る（Node, 依存なし）

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
│   ├── icon.svg                  # ファビコン（16px 用に簡略化した金イクラ）
│   ├── control-panel/
│   │   ├── layout.tsx            # コントロールパネルのフォント（next/font）と共通の外枠
│   │   ├── theme.ts              # コントロールパネルの MUI テーマ（色・角丸・文字・ボタンの高さ）
│   │   ├── page.tsx              # 配信中の画面
│   │   ├── prepare/
│   │   │   └── page.tsx          # 準備の画面
│   │   ├── review/
│   │   │   └── page.tsx          # 振り返りの画面
│   │   └── settings/
│   │       ├── page.tsx          # 設定（最初のメニューへ移る）
│   │       ├── sections.ts       # 設定のメニュー
│   │       └── [section]/
│   │           └── page.tsx      # 設定の画面
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
│   │   ├── page.tsx              # 実況テロップオーバーレイ
│   │   └── vertical/
│   │       └── page.tsx          # 実況テロップ（縦型配信用 1080x1920）
│   ├── voice-overlay/
│   │   └── page.tsx              # 読み上げ（音声専用）オーバーレイ
│   ├── weapon-card-overlay/
│   │   └── page.tsx              # ブキ埋めカードオーバーレイ
│   ├── salmon-review-overlay/
│   │   ├── page.tsx              # サーモンランの振り返りオーバーレイ
│   │   └── vertical/
│   │       └── page.tsx          # 振り返り（縦型配信用 1080x1920）
│   ├── join-queue-overlay/
│   │   └── page.tsx              # 視聴者参加の受付オーバーレイ
│   ├── break-overlay/
│   │   ├── page.tsx              # 休憩中オーバーレイ
│   │   └── vertical/
│   │       └── page.tsx          # 休憩中（縦型配信用 1080x1920）
│   └── api/
│       ├── stream-data/
│       │   └── route.ts          # データ管理API
│       ├── score-display/
│       │   └── route.ts          # スコア表示（ラベル・値・取り込みでの自動更新）API
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
│       ├── clip/
│       │   └── route.ts          # Twitch のクリップの依頼・結果API
│       ├── join-queue/
│       │   └── route.ts          # 視聴者参加の受付の列API
│       └── break/
│           └── route.ts          # 休憩の状態API
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
│   ├── SalmonRunPanel.tsx        # 配信中の画面のサーモンランのカード（取り込み・戦績・最近の記録。すべての記録はダイアログ）
│   ├── SalmonJobDialog.tsx       # サーモンランの手入力・修正のダイアログ（支給ブキのパレットは「ブキを選ぶ」で開く）
│   ├── SalmonJobRow.tsx          # サーモンランの記録の行・セッションの表記（画面をまたいで共通）
│   ├── StreamStartCard.tsx       # 準備の画面の「今日の配信」（配信を始める = 新しいセッションを始めて配信中の画面へ）
│   ├── SalmonPastSessionsCard.tsx # 振り返りの画面の、サーモンランの振り返りの画像と過去のセッション
│   ├── SidePanelOverlay.tsx      # サイドパネルの本体（2 つのレイアウトで共通）
│   ├── SidePanelSettingsPanel.tsx # 準備の画面のサイドパネルのカード（固定枠・ローテーション枠・秒数・フォロワー目標）
│   ├── ChallengeEditorCard.tsx   # 準備の画面の本日のお題（追加・削除・並べ替え）
│   ├── useSidePanelSettings.ts   # サイドパネルの設定（お題を含む）の読み込み・その場で保存（最新を読み直して重ねる）
│   ├── ChoiceChip.tsx            # 準備の画面の、選ぶ・切り替えるチップ
│   ├── InkTankGauge.tsx          # インクタンク型フォロワーゲージ
│   ├── ChallengeList.tsx         # 本日のお題（サイドパネルのスロット）
│   ├── SalmonSchedule.tsx        # サーモンランのスケジュール（サイドパネルのスロット）
│   ├── ScoreDisplayPanel.tsx     # スコア表示の読み込み（useScoreDisplay）・直すダイアログの中身・設定の自動更新のカード
│   ├── TelopBar.tsx              # 配信中の画面のテロップのカード（先頭 10 個は 2 列のキー・表示中。プリセットは controlPanelContext で共有）
│   ├── TelopPanel.tsx            # 設定の「テロップのプリセット」の自由入力・プリセットの 1 行編集（文の入力欄・4 つのアイコンのトグル・並べ替え）
│   ├── TelopOverlay.tsx          # 実況テロップのオーバーレイの本体（横長 / 縦型配信用で共通）
│   ├── VoiceSettingsPanel.tsx    # 読み上げ（VOICEVOX）の設定（設定の「読み上げ（VOICEVOX）」）
│   ├── WeaponIcon.tsx            # ブキの画像（読み込めなければブキ名）
│   ├── WeaponPicker.tsx          # カテゴリごとのブキのパレット（記録・ブキ埋めのカードで使う）
│   ├── WeaponCard.tsx            # ブキ埋めカード（オーバーレイ）
│   ├── WeaponCardPanel.tsx       # ブキ埋めカードの読み込み（useWeaponCard）・手動で埋めるダイアログの中身・振り返りの画面のカード
│   ├── SalmonReview.tsx          # サーモンランの振り返り（横長 / 縦長のレイアウト）
│   ├── SalmonReviewOverlay.tsx   # 振り返りのオーバーレイ（ポーリング。2 つのページで共通）
│   ├── SalmonReviewDownload.tsx  # 振り返りを SNS 用の PNG にしてダウンロード（振り返りの画面）
│   ├── EffectClipCard.tsx        # 配信中の画面のエフェクト・クリップのボタン（履歴はダイアログ）
│   ├── ClipHistory.tsx           # クリップの履歴（エフェクト・クリップのカードの「履歴」）
│   ├── JoinQueuePanel.tsx        # 配信中の画面の参加のカード・準備の画面の参加型の準備（配信者の評価）・振り返りの画面のこれまでの受付
│   ├── TimelyFixesCard.tsx       # 配信中の画面の「ときどき直すもの」（スコア表示・ブキ埋めカードをダイアログで直す）
│   ├── ChallengeChecklistCard.tsx # 配信中の画面の本日のお題（達成のチェックだけ）
│   ├── LiveCard.tsx              # 配信中・準備の画面のカード（見出し + 右の補足）
│   ├── LiveDialog.tsx            # 配信中の画面のダイアログ（右上の × で閉じる）
│   ├── BreakControl.tsx          # 休憩の状態（useBreak）とヘッダーのボタン・帯・解除忘れの注意
│   ├── SectionTitle.tsx          # コントロールパネルのカードの見出し（アイコン + 文字）
│   ├── ControlPanelShell.tsx     # コントロールパネルの共通の外枠（ヘッダー・フェーズの切り替え・休憩・数字キー）
│   ├── controlPanelContext.tsx   # 画面をまたいで共有するもの（保存の状態・テロップのプリセット）
│   ├── useTelopHotkeys.ts        # テロップの数字キー（1〜9, 0）
│   ├── useStreamSettings.ts      # オーバーレイの設定の読み込み・その場で保存
│   ├── StreamSettingsPanels.tsx  # 準備の画面の流すメッセージ・バーンダウンと、設定の見た目のカード
│   ├── ControlPanelSettings.tsx  # 設定の画面（左のメニュー（600px 未満は上にセレクト）と中身・OBS のブラウザソースの一覧）
│   └── BreakOverlay.tsx          # 休憩中オーバーレイの本体（横長 / 縦型配信用で共通）
├── lib/
│   ├── overlayPages.ts           # オーバーレイのページと大きさ（ランチャー・設定の OBS のブラウザソース）
│   ├── localStorage.ts           # ローカルストレージのラッパー
│   ├── streamSettingsTypes.ts    # オーバーレイの設定（フォント・メッセージ・バーンダウン）の型・既定値・入力検証（クライアントからも使う）
│   ├── streamSettings.ts         # オーバーレイの設定の保存（サーバー専用。SQLite）
│   ├── db.ts                     # SQLite の接続とスキーマ
│   ├── salmon.ts                 # サーモンラン記録のデータアクセス・入力検証（サーバー専用）
│   ├── salmonTypes.ts            # サーモンラン記録の型・定数（クライアントからも使う）
│   ├── sidePanelTypes.ts         # サイドパネルのスロット定義・設定の検証（クライアントからも使う）
│   ├── salmonSchedule.ts         # サーモンランのスケジュールの型・変換（クライアントからも使う）
│   ├── salmonScheduleFetch.ts    # サーモンランのスケジュールの取得・キャッシュ（サーバー専用）
│   ├── scoreDisplayTypes.ts      # スコア表示の型・評価の表記・入力検証（クライアントからも使う）
│   ├── scoreDisplay.ts           # スコア表示の保存と、リザルトの取り込みからの自動更新（サーバー専用）
│   ├── telopTypes.ts             # 実況テロップの型・プリセットの検証（クライアントからも使う）
│   ├── telop.ts                  # 実況テロップの状態・チャットの書き込み待ち（サーバー専用。ルート間で共有）
│   ├── salmonCelebration.ts      # 取り込んだバイトの本日の最高記録などの判定とお祝いの文（サーバー専用）
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
│   ├── weaponCardImage.ts        # ブキ埋めカードの SNS 投稿用の画像（Canvas で描く。クライアント専用）
│   ├── joinQueueTypes.ts         # 視聴者参加の受付の型・評価の読み取り・返信の文面・推定キケン度の計算（クライアントからも使う）
│   ├── joinQueue.ts              # 視聴者参加の受付の列（サーバー専用。メモリだけ）
│   ├── breakTypes.ts             # 休憩の型・定数・経過時間の表記（クライアントからも使う）
│   └── break.ts                  # 休憩の状態（サーバー専用。メモリだけ）
├── data/                          # SQLite・Twitch トークン（Git / Docker イメージ管理外）
├── docs/design/control-panel/      # コントロールパネル刷新の設計書（Claude Design の成果物。README が実装の指示）
├── public/                        # 静的アセット
│   ├── favicon.svg               # アプリのアイコン（金イクラ。コントロールパネル・ランチャーのヘッダー）
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

`StreamData` は `/app/api/stream-data/route.ts`、設定の部分（`StreamSettings`・`BurndownData`・`MessagePreset`）は `lib/streamSettingsTypes.ts` で定義されています。

```typescript
export interface BurndownData {
  label: string;
  targetValue: number;
  entries: { score: number; timestamp: number }[]; // ポイント履歴
}

export interface MessagePreset {
  name: string;
  messages: { id: number; text: string }[];
}

// コントロールパネルで決める設定。SQLite（app_state のキー streamSettings）に保存する
export interface StreamSettings {
  transitionEffect: 'fade' | 'slide';
  transitionDuration: number;
  fontFamily: string;
  fontSize: number;
  messagePresets: MessagePreset[];
  activePresetName: string;
  burndown: BurndownData;
}

export interface StreamData extends StreamSettings {
  scoreLabel: string;                 // lib/scoreDisplay.ts に別に保存（GET で合わせて返す）
  scoreValue: string;
  lastEvent: {                        // エフェクト。メモリだけ
    name: string;                     // 'LOVE' | 'STAR' | 'SPARKLE' | 'BUBBLE' | 'FIREWORKS'
    timestamp: number;
  } | null;
  revision: number;                   // クライアント再レンダリング用（メモリだけ）
  settingsStored: boolean;            // 設定が SQLite に保存済みか（localStorage からの移行用）
}
```

### API エンドポイント

**`GET /api/stream-data`**
- 現在の `StreamData` を取得
- オーバーレイが定期的にポーリング

**`POST /api/stream-data`**
- 設定（`StreamSettings`）の **送った項目だけ** を書き換えて SQLite に保存する（`parseStreamSettingsUpdate` で検証。知らない項目・不正な値・空は 400）。スコア表示は `/api/score-display`、エフェクトは PATCH で送るので受け付けない。`Content-Type: application/json` 必須（設定は SQLite に残るので、他サイトからの単純リクエストで書き換えさせない）
- コントロールパネルが、変わった項目だけをその場で送る
- `revision` が自動的にインクリメントされる

**`PATCH /api/stream-data`**
- `{event}`（`EFFECT_NAMES` = `LOVE` / `STAR` / `SPARKLE` / `BUBBLE`、と `FIREWORKS`）で `lastEvent` だけを更新してエフェクトを出す（設定は変えない）
- コントロールパネルのエフェクトのボタン・文字起こしスクリプト（`tools/caption-stt/`）・バーンダウンのオーバーレイ（目標の達成で `FIREWORKS`）から呼び出される。`Content-Type: application/json` 必須

## 主要ファイルの詳細

### `/app/api/stream-data/route.ts`

- 設定は `lib/streamSettings.ts` が SQLite の `app_state`（キー `streamSettings`）に保存する（以前はメモリだけで、再起動で消えていた）。保存値の壊れた項目は既定値（`DEFAULT_STREAM_SETTINGS`）にする（`parseStoredStreamSettings`。ほかの項目は残す）。型・既定値・検証は `lib/streamSettingsTypes.ts`（クライアントからも使う）
- スコア表示（`scoreLabel` / `scoreValue`）は `lib/scoreDisplay.ts` が SQLite の `app_state`（キー `scoreDisplay`）に別に保存し、`GET` で合わせて返す（リザルトの取り込みで書き換えた値を、コントロールパネルの保存で上書きしないため）
- `lastEvent` と `revision` はメモリだけ（再起動で消えてよい）
- `getInitialStreamData()` - 初期データを返す（テストでも使用）
- `__TEST_ONLY_setStreamData()` - テスト用のデータセッター（`settingsStored` が false なら保存した設定を消す）

### `/app/control-panel/`（コントロールパネル）

配信のフェーズ（準備 → 配信中 → 振り返り）で画面を切り替える。設定は歯車の奥（親 Issue #125。設計書は `docs/design/control-panel/README.md`）。

| 画面 | URL | 今の中身 |
|---|---|---|
| 配信中 | `/control-panel`（既定。配信中に開き直しても 1 手で戻れるように） | 3 列のカード: テロップ（`TelopBar`）→ エフェクト・クリップ（`EffectClipCard`）/ サーモンラン（`SalmonRunPanel`）→ ときどき直すもの（`TimelyFixesCard`）/ 視聴者参加（`JoinQueuePanel`）→ 本日のお題（`ChallengeChecklistCard`） |
| 準備 | `/control-panel/prepare` | 2 列のカード: 今日の配信（`StreamStartCard`）→ 本日のお題（`ChallengeEditorCard`）/ サイドパネル（`SidePanelSettingsPanel`）→ 参加型の準備（`JoinStreamerRatingCard`）→ 流すメッセージ・バーンダウン（`MessageBurndownCard`） |
| 振り返り | `/control-panel/review` | 今の見た目のままカードを縦に並べる（#131）: 振り返りの画像 → 過去のセッション（`SalmonPastSessionsCard`。画像は下で選んだセッション、選ばなければ今のセッション）→ ブキ埋め（`WeaponCardPanel`。画像・新しいカード）→ これまでの受付（`JoinHistoryCard`） |
| 設定 | `/control-panel/settings/[section]`（`settings/sections.ts` のメニュー。`/control-panel/settings` は最初のメニューへ移る） | テロップのプリセット（`TelopPanel`）・読み上げ（`VoiceSettingsPanel`）・スコア表示の自動更新（`ScoreAutoUpdateCard`）・見た目（フォント・メッセージの切り替え）・OBS のブラウザソース（`lib/overlayPages.ts` のすべて） |

狭い幅の並べ方は #133 で作り直す。

- **設定の画面**（#132。設計書 6 章）: 左にメニュー（220px）、600px 未満はメニューを上のセレクト（`NativeSelect`。選ぶと `router.push`）にする。テロップのプリセットは 1 行に 1 つ（つまみ・番号のバッジ（先頭 10 個はピンク＝数字キー）・文の入力欄（`flex: 1 1 240px`）・4 つのアイコンのトグル（`aria-pressed`、40×40）・削除）で、幅が足りなければトグルが下に折り返す。文は打ち終えて `TEXT_SAVE_DELAY_MS`（500ms）待つか、入力欄から離れる・Enter で保存する（空・30 文字超は保存しない）。保存はそのときの最新のプリセットに重ねる（`presetsRef`。変わらない保存は送らない）。入力中は、自分の保存や読み込み直しで打っている文を書き換えない（末尾の空白が消えないように）。外せない ON のトグル（テロップとチャットの最後の 1 つ）は押せないが色は残す。OBS のブラウザソースは `OVERLAY_PAGES` の名前・URL（コピーのボタン）・大きさ（無ければ「音声のみ」）

- **配信中の画面**（#129。設計書 3 章）: 1280×900 でスクロールせずに全部見える（参加の受付中も。列は高さを決めてスクロール）ことが目標。列は `flex: 1 1 380px`（3 列目は 340px）で折り返し、DOM の順番 = 狭い幅で縦に並ぶ順番 = 優先度。外枠の `main` の最大幅は配信中の画面 1600px・準備と設定の画面 1200px（振り返りは 900px。`ControlPanelShell` の `pageMaxWidth`）。カードは `components/LiveCard.tsx`（見出しを section の名前にする。`hideTitle` で見出しを読み上げだけにする）。ときどき使うもの（手入力・すべての記録・クリップの履歴・スコア表示・ブキ埋めの手動）はダイアログ（`components/LiveDialog.tsx`）に入れ、開いたときだけ中身を描く。主ボタンは `tokens.height.hero`（64px）/ `live`（52px）
- **準備の画面**（#130。設計書 4 章）: 2 列（各 `flex: 1 1 420px`）。「配信を始める」は `POST /api/salmon/sessions` をしてから `router.push('/control-panel')`（失敗したら移らない）。本日のお題は追加・削除と並べ替え（つまみのドラッグ、またはつまみにフォーカスして ↑↓）だけで、達成のチェックは配信中の画面。メッセージのプリセットはチップ（`role=radio`）で選ぶ
- **テロップの「表示中」**: `TelopPresetsProvider` の `show` が `/api/telop` に成功したら、そのプリセットを `shownId` にして `TELOP_DISPLAY_DURATION` の間だけ枠をピンクにする（数字キーで出したときも。コメントだけのプリセットは配信画面に出ないので付けない）。11 個目以降は「ほかのテロップ（n）」で開き、開いているかを localStorage（`TELOP_MORE_OPEN_KEY`）に覚える

- **共通の外枠**: `app/control-panel/layout.tsx` が `components/ControlPanelShell.tsx` で包む。テーマ（`ThemeProvider`・`CssBaseline`）、ヘッダー（アイコン・フェーズの切り替え（`usePathname` で今の画面を塗る）・「変更はすぐ保存」・休憩のボタン・設定の歯車）、休憩中の帯、テロップの数字キーを持つ。画面をまたいで共有するものは `components/controlPanelContext.tsx` の `SaveStatusProvider`（保存の失敗をヘッダーに出す）と `TelopPresetsProvider`（テロップのプリセットを 1 回だけ読み込み、ボタン・数字キー・設定の編集で共有する。編集したら `reload`）
- **数字キー**: `components/useTelopHotkeys.ts` を外枠で 1 回だけ使い、どの画面でも 1〜9, 0 で先頭 10 個を出す（入力欄・プルダウン（`role=combobox` / `option`）にフォーカスがあるとき・IME 変換中・修飾キー付き・キーリピートは無視。`isEditableTarget`）
- **休憩**: `components/BreakControl.tsx` の `useBreak` を外枠で 1 回だけ使い、ヘッダーのボタン（`BreakButton`。休憩中は塗りの「休憩を終わる m:ss」）とヘッダーの下の帯（`BreakBanner`）に渡す。点滅は帯とボタンの両方
- **テストのモック**: `vitest.setup.ts` の `next/navigation` のモックは `usePathname` が `/control-panel` を返す。外枠ごと描くテストでは、`/api/break`・`/api/telop` も `axios.get` に答えさせる。外枠の休憩の問い合わせを止めようと `setInterval` を差し替えると、Testing Library の `waitFor` も DOM が変わるまで待ち直さなくなるので差し替えない

- **見た目**: テーマは `app/control-panel/theme.ts`（`docs/design/control-panel/theme.ts` と同じ値。フォントだけ `app/control-panel/layout.tsx` の `next/font` が設定する CSS 変数を使う）。色・角丸・余白は `tokens` から取り、カードは面の色と 1px の枠だけ（影・グラデーション・すりガラスは使わない）。`spacing` は 4px 単位（`p: 4` = 16px）。カードの見出しは `components/SectionTitle.tsx`（MUI の Rounded のアイコン + 文字。見出しに絵文字は使わない）
- **保存**: すべて「その場で保存」（「OBSに反映」ボタンは無い）。設定を扱う画面は `components/useStreamSettings.ts` を 1 回だけ使い、カード（`components/StreamSettingsPanels.tsx`）に渡す。バーンダウン・メッセージ・フォント・切り替えエフェクトは、変えてから `SAVE_DELAY_MS`（500ms）待って、保存済みの値と比べて変わった項目だけを `POST /api/stream-data` で送る（入力途中の不正な値、たとえば数値の欄を空にした 0 は送らない。`isValidStreamSetting`）。保存は 1 つずつ順に送り、失敗したらヘッダーの「変更はすぐ保存」を赤い「保存できませんでした」に変えて、次の保存で送り直す。画面を離れるとき（アンマウント・`pagehide` は `fetch` の `keepalive`）は待っている変更をすぐに送る。応答で入力欄を上書きしない（打っている途中の文字を戻さない）
- **ローカルストレージ**: 設定には使わない（テロップの「ほかのテロップ」を開いているかだけ覚える）。以前は `'control-panel-state'` キーに設定（と開いていたタブ）を入れていたので、残っていればサーバーに保存が無いとき（`settingsStored` が false）だけ設定を 1 回送り、どちらでもキーを消す（`useStreamSettings`）。壊れていたら消す
- **エフェクトのトリガー**: 配信中の画面の `EffectClipCard` が `PATCH /api/stream-data {event}` でエフェクトだけを送る（ほかの設定は送らない。話した言葉で出すのは文字起こしスクリプト）

### `/app/obs-overlay/page.tsx`

メインのオーバーレイ画面。

- 1秒ごとに `/api/stream-data` をポーリング
- `ScoreDisplay` と `MessageScroller` を表示
- `lastEvent` に基づいてエフェクトをレンダリング
- `revision` が変更されたときに再レンダリング

### `/app/burndown-overlay/page.tsx`

バーンダウンチャート専用のオーバーレイ（250x584px）。

- 1秒ごとにデータをポーリング
- 目標達成時（残りポイント ≤ 0）に `FireworksEffect` を表示（`PATCH /api/stream-data {event: 'FIREWORKS'}` でエフェクトだけを送る。設定を丸ごと送ると、開いたときの古い値でコントロールパネルの設定を上書きしてしまうため）
- `BurndownChart` コンポーネントを使用

### `/app/api/caption/route.ts` と `/app/caption-overlay/page.tsx`

配信者の音声をリアルタイムに字幕表示する機能。

- 起動はリポジトリのルートで `pnpm caption`（`tools/caption-stt/run.sh`。初回は venv を自動作成）
- `tools/caption-stt/caption_stt.py` が Silero VAD で発話を区切り、mlx-whisper で文字起こしして `POST /api/caption {text}` する
- API は直近5件の字幕行をインメモリで保持（`DELETE` でクリア）。`getInitialCaptionData()` / `__TEST_ONLY_setCaptionData()` はテスト用。`POST` は `Content-Type: application/json` 必須（他サイトからの単純リクエスト対策）、1行は200文字で切り詰め
- オーバーレイは1秒ごとにポーリングし、8秒以内の最新2行を表示
- 精度対策（`caption_stt.py`）: スプラ用語の `GLOSSARY` とテロップのプリセットの文を `initial_prompt` に渡す（プロンプトが長すぎると先頭が切り捨てられるので用語集を後ろに置き、テロップは並び順の逆に置いて、落ちるのを並びの後ろのものにする）。`select_segments` で信頼度（`avg_logprob` / `no_speech_prob` / `compression_ratio`）の低いセグメントを、`caption_rejection` で日本語以外の文字・英字 3 文字以上の単語（`ALLOWED_LATIN` を除く）・相づち（`FILLERS`、1 文字以下）を除外し、除外理由をログに出す（しきい値は定数。ログを見て調整する）。0.4 秒未満の発話は文字起こししない
- エフェクト: `match_effect` が `EFFECT_KEYWORDS`（「ナイス」→ STAR、「ありがとう」→ LOVE、「よっしゃ」→ SPARKLE、「やべ」「やば」→ BUBBLE。上のものを優先）を含むか調べ、`PATCH /api/stream-data {event}` を送る。字幕・テロップとは別に出す（フィルタで除外した発話では出さない）。`EFFECT_MATCH=off` で無効。以前のコントロールパネルのブラウザ音声認識（Web Speech API）は廃止した
- テロップへの照合: `TelopMatcher` が 30 秒ごとに `GET /api/telop` でプリセットを取り直し、`match_telop`（NFKC・カタカナ→ひらがな・記号除去のうえ、含む（発話がテロップの 2 倍以下の長さ）か類似度 0.8 以上。2 文字以下は完全一致のみ）で一致したら `POST /api/telop {presetId, speak: false}` を送り（`TELOP_SPEAK=on` なら `speak` を送らずプリセットの設定どおりに読み上げる。無言配信向け。`telop_request`）、一致した部分は字幕にしない。発話は `split_sentences`（「。」「！」「？」で区切る。読点では区切らない）で文に分け、2 文以上なら最初に一致した文のテロップを出して、残りの文（同じテロップに一致する文は除く）を字幕にする（「ナイス。いいね。」でも出せるように。1 発話でテロップは 1 つ）。どの文とも一致しなければ発話全体で比べる。同じテロップは 10 秒出し直さない。プリセットが取れない・出せないときは字幕として送る。`TELOP_MATCH=off` で無効
- モデルの比較: `CAPTION_SAVE_DIR` を指定すると発話ごとに wav と文字起こし結果を保存し、`pnpm caption --compare <DIR> --models a,b` で複数のモデルの結果・処理時間を並べる。`run.sh` は `cd` しない（相対パスを実行した場所から解釈するため）
- `/api/stream-data` とは別エンドポイント（コントロールパネルの保存と競合させないため）
- Python 側のテストは `tools/caption-stt/` で `pytest`（CI 対象外）

### `/app/api/twitch/route.ts` と `tools/twitch-eventsub/`

Twitch のフォロワー数とフォロワー目標を受け取る機能と、チャットの読み上げ。

- 起動はリポジトリのルートで `pnpm twitch`（`.env.local` の `TWITCH_CLIENT_ID` が必須。初回はブラウザで承認）
- `tools/twitch-eventsub/twitch_eventsub.ts` は Node 24 の型除去でそのまま実行するため、enum・コンストラクタ引数プロパティなど型除去できない構文は使わない（`tools/twitch-eventsub/package.json` で ESM 指定）
- 認証は Device Code Flow（Public クライアント、スコープ `moderator:read:followers` / `channel:read:goals` / `user:read:chat` / `clips:edit` / `user:write:chat`。保存済みトークンにスコープが足りなければ承認し直す）。トークンは `data/twitch-token.json`（gitignore・dockerignore 済み）
- EventSub WebSocket で `channel.follow` v2 と `channel.goal.*`、`channel.chat.message` / `channel.chat.message_delete` / `channel.chat.clear_user_messages` / `channel.chat.clear` v1（どれも `user:read:chat`）、`stream.offline` v1（スコープ不要）を購読。通知は `NotificationDeduper` でメタデータの `message_id` の重複と 10 分より古いものを捨てる。フォロー通知では総数を加算し、60秒ごとに Helix から再同期して `/api/twitch` に送り直す
- フォロー通知のたびに `publishFollowTelop` で `POST /api/telop {event: 'follow'}` を送り、フォローのお礼のテロップ（演出・読み上げ付き）を出す（文言と、続いたフォローをまとめるのはアプリ側）
- テロップの「コメント」（`/api/telop` の `chat`）を `createChatPostProcessor` でチャットに書き込む（スコープ `user:write:chat`）。書き込んだコメントは下の配信者のコメントとして読み上げられる
- チャットは `chatToSpeech`（純粋関数）で読み上げる文を決め、`publishSpeech` で `/api/speech`（`TWITCH_SPEECH_API_URL`、既定は `TWITCH_API_URL` と同じホスト）へ送る。視聴者は起動中に初めてコメントしたときだけ「〇〇さん、いらっしゃい！」（**本文は読まない**。挨拶済みのユーザー ID はメモリの Set だけ。名前は表示名を文のようにして読ませる悪用を防ぐため `speakableName` で NFKC・制御文字の除去・同じ文字の連続の短縮・20 文字までに整え、空ならログイン名）、配信者自身は本文（NFKC で全角をそろえてから、`!` コマンド・URL を含むものを除く。コードポイント単位で 100 文字まで）。`TWITCH_SPEECH_IGNORE`（カンマ区切りのログイン名）のボットと、共有チャットでほかのチャンネルから届いたものは読まない。読み上げが無効（409）なら黙って捨てる。挨拶を送れなかったとき（無効・送信失敗）は `speakChatMessage` が挨拶済みから外し、次のコメントで挨拶し直す。**視聴者の名前やコメントはログに出さない**
- API は `{followerTotal, goal, lastFollowAt, updatedAt, revision}` をインメモリで保持（`followerTotal: null` はスクリプト未起動）。**フォロワー名は保持しない**。`POST` は `Content-Type: application/json` 必須。`getInitialTwitchData()` / `__TEST_ONLY_setTwitchData()` はテスト用
- スクリプトのテストは Vitest（CI 対象）

### `/app/api/salmon/` と `lib/db.ts` / `lib/salmon.ts`

サーモンランの成績（金イクラ納品数・オオモノ処理数・デス数・クリア/失敗と到達WAVE・ステージ・支給ブキ）を記録する機能。

- 永続化は SQLite（`node:sqlite` の `DatabaseSync`）。パスは `OVERLAY_DB_PATH`（既定 `data/overlay.db`）。スキーマは初回接続時に `CREATE TABLE IF NOT EXISTS`
- 集計は **配信セッション単位**。最後に開始したセッションが「現在のセッション」。記録時にセッションが無ければ自動作成
- `GET /api/salmon`（`?sessionId=` で過去分）、`POST /api/salmon`（記録）、`PATCH /api/salmon {id, ...記録}`（修正。取り込んだバイトの日時・詳細は残し、詳細があれば自分の行の金イクラ・オオモノ・被救助数も合わせる）、`DELETE /api/salmon?id=`（取り消し）、`GET/POST /api/salmon/sessions`（一覧・開始）。POST は `Content-Type: application/json` 必須
- `lib/salmon.ts` は `node:sqlite` に依存するのでクライアントコンポーネントから import しない。型と定数は `lib/salmonTypes.ts` から import する
- コントロールパネルの配信中の画面のサーモンランのカード（`components/SalmonRunPanel.tsx`）は API に直接保存する。手入力・修正は `components/SalmonJobDialog.tsx` のダイアログ。新しいセッションの開始は準備の画面の「配信を始める」（`components/StreamStartCard.tsx`。始めたら配信中の画面に移る）、過去のセッションは振り返りの画面（`components/SalmonPastSessionsCard.tsx`）
- テストは `vite.config.mts` の `OVERLAY_DB_PATH=:memory:` で実データに触れない。各テストで `__TEST_ONLY_setDb(openDb(':memory:'))` してから使う

### `/app/api/salmon/import/route.ts` と `tools/salmon-result/`

サーモンランのリザルトの手入力を減らすため、iPhone ミラーリングに映した NSO アプリ（イカリング3）から最新のリザルトを読み取って記録する機能。

- イカリング3の API は直接呼ばない（以前、非公式の API の利用でイカリングを BAN されたため）。公式アプリの画面をタップ・スクロールし、撮影して OCR するだけ。キャプチャ映像の OCR ではオオモノ討伐数が取れないので使わない
- 流れ: コントロールパネルの配信中の画面のサーモンランのカードのボタン → `POST /api/salmon/import` → 取り込みスクリプト（`pnpm salmon-result`）が 1 秒ごとに `GET ?status=pending` で拾い `PATCH {id, status: 'processing'}` → `GET ?view=recorded`（記録済みのバイトの日時と今のセッションの開始時刻）→ バイトの詳細画面の「最新のバイトへ」で最新を表示して撮影・OCR → 「前のバイト」で取りこぼしを遡る → `PATCH {id, status: 'succeeded', jobs: [{job, playedAt}]（古い順）, captures}`（サーバーが `addJob` で今のセッションに記録）／ `{status: 'failed', error, captures}` → `POST /api/telop {text}` で知らせる
- 最新の表示: ヒストリーはタブを移っても読み込み直されない（ホーム → サーモンランでは新しいバイトが出ない）。詳細画面の「最新のバイトへ」で読み込み直す。押した直後は前の画面のままなので、「次のバイト」が押せなくなる（文字が灰色になる。`is_latest_job`）まで待つ。詳細画面でなければヒストリーのいちばん上を開いてから押す
- 取りこぼし: 最新のバイトから「前のバイト」で、記録済みのバイト・今のセッションの開始より前のバイト・`MAX_BACKFILL_JOBS`（20）件のどれかに着くまで遡る（`should_stop_backfill`。セッションが無ければ遡らない）。読めないバイトがあればそこでやめ、読めた分を記録する。「前回」が最新のバイトになるよう古い順に送る
- 依頼は SQLite の `salmon_imports`（`pending` / `processing` / `succeeded` / `failed`）。処理待ち・取り込み中の依頼があれば新しく作らずにそれを返す。拾われない依頼は `SALMON_IMPORT_REQUEST_TTL_MS`（30 秒）、取り込み中のまま止まった依頼は `SALMON_IMPORT_PROCESSING_TTL_MS`（6 分）で失敗にする（`expireStaleImports`）
- 記録のお祝い: succeeded で記録したあと、最新のバイト（`jobs` の最後。遡った古いバイトは祝わない）を `lib/salmonCelebration.ts` の `detectAchievements` で判定する。自分の金イクラ（35 個以上）・自分のオオモノ討伐数（25 体以上）・チームの金イクラ（135 個以上。取り込んだバイトだけ持つ）が、同じセッションのそれより前のバイト（手入力も含む）の最大を超えたら記録（前のバイトにその値が無ければ判定しない＝セッションの最初のバイトは祝わない。同数は更新にしない）。出現したオオモノをチームで全て倒したら（オカシラは含めない）最初のバイトでも祝う。`formatCelebration` で、配信画面用の 2 行の短い文（`telop`）とコメント・読み上げ用の文（`message`。複数の戦績は 1 文にまとめる）を作り、`showCelebrationTelop` が `effect: 'record'` のテロップを出して、`message` をチャットの書き込み待ちに `speak: true` で入れる（書き込めれば配信者のコメントとして読み上げられ、書き込めなければテロップ側で読み上げる）。応答の `celebrated` が true なら、スクリプトは「リザルトを記録しました」のテロップを出さない（お祝いを上書きしないように）。お祝いに失敗しても取り込みは成功として返す
- 二重記録の防止: 取り込んだバイトは `salmon_jobs.played_at`（画面の日時。手入力は NULL）を持ち、同じ日時のバイトは記録しない。送ったバイトがすべて記録済みなら 409。最新のバイトが記録済みなら、スクリプトはイカリング3にまだ反映されていないとみなし、15 秒ごとに最大 4 分読み直す。記録を削除したバイトは取り込み直せるが、遡りは記録済みのバイトに着いたところで止まるので、取り込み直せるのは最新のバイトから記録済みのバイトを挟まずにつながっている分だけ（途中の 1 件を消しても取り込まれない。今のセッションの開始より前のバイトも取り込まれない）。手入力の記録には日時が無いので、読み間違いを「削除 → 手入力」で直すと次の取り込みで二重に記録される。読み間違いはコントロールパネルの ✏️（`PATCH /api/salmon`）で修正する。依頼には記録した数（`recorded_count`）と最新のバイト（`job_id` / `played_at`）を残す
- 読み取り（`salmon_result.py`）: 自分の行（プレイヤー一覧のいちばん上）の「オオモノシャケ x24」を OCR で見つけ、それを基準にした相対位置（`SelfRowCells`）の金イクラ・被救助数（= デス）を切り出して読む（全体を読むと隣の数字とつながるため）。数字のセルは倍率・白黒化を変えて何度か読んだ多数決（`vote_count`）。`x31<2>` の「<」を 4 と読む（`x3142>`）ことがあるので、数のすぐ後ろが「>」の読みは数えない（`parse_count`）。日時はステージの画像の上に白い文字で出るので、明るいステージでは全体の OCR で読めない。日時の部分を切り出して白黒化した結果との多数決（`read_played_at`）。クリア / 失敗は見出しの「Clear!!」/「Failure」を切り出して読み、似ているほうで判定する（装飾文字で Cear! などと読むため。「クリアボーナス」があるので日本語の「クリア」では判定しない）。見出しは黄緑の文字なので、明るいステージ（ビッグランのショッピングパークなど）では黄緑の部分だけを取り出した画像（`title_mask`）も読む。失敗した WAVE は表示されている WAVE の最大（失敗したバイトはそこまでしか表示されない）。オカシラ（EX-WAVE）に負けても WAVE 3 までクリアならクリア。ステージ名は何通りかの倍率で切り出して読み直し、`KNOWN_STAGES`（サーモンランのステージと、これまでのビッグランのステージ）の似た名前に直した多数決（`vote_stage`。濁点・半濁点の読み違いは区別しない）。読めない項目があれば推測で記録せず失敗にする
- 支給ブキ: アイコンの数（WAVE 数とスペシャル）で並び方が 1 行 / 2 行と変わるので、位置は決め打ちせず、行の背景と色の違うまとまりを探す（`find_icon_blobs`）。外接矩形を埋める割合で、丸いブキ（0.77〜0.85）と四角いスペシャル（0.94〜0.96）を見分ける。ブキは Leanny/splat3 の画像（`lib/salmonWeapons.ts` を Node の型除去で読み、`data/salmon-weapon-refs/` にキャッシュ）と照合し、似ていなければ記録しない（`match_weapon`）。照合は丸の中の画素だけで、参照画像は黒い丸の中に 0.95 倍で置いて少しぼかし、小さなアイコンに見た目を合わせる（そのまま縮めると正解の類似度が 0.3 程度まで下がる）
- 画面の操作は `CGEventPost`。起動したアプリ（ターミナル）に「デバイスの制御とデータへのアクセス」（macOS 26 までは「アクセシビリティ」）の権限が無いとクリックが黙って無視されるので、`AXIsProcessTrusted` で確かめて知らせる。ミラーリングはアクセシビリティの API で前面にしてからクリックする。クリック・スクロールのたびにカーソルの位置と前面のアプリを元に戻す。ミラーリングの「接続が一時停止されました」は「再開」を押してつなぎ直す。撮影は `screencapture -l<ウインドウ ID>`（隠れていても撮れる）
- バイトの種類（`jobKind`: `regular` / `bigRun` / `teamContest`。`lib/salmonTypes.ts` の `SalmonJobKind`、`salmon_jobs.job_kind`）: 詳細画面のいちばん上のタイトル（いつものバイト / ビッグラン / バイトチームコンテスト）で見分ける（`parse_job_kind`。読めなくても WAVE 4・5 があればチームコンテスト。わからなければ null）。手入力ではコントロールパネルで選ぶ（開催中のスケジュールの種類が初期値）
- バイトチームコンテスト: WAVE は 5 まで（`TEAM_CONTEST_MAX_WAVE`。クリアの到達 WAVE も 5。`maxWaveFor`）、オカシラ・評価は無い、ブキは固定で WAVE ごとに同じブキが 5 つ並ぶ（`MAX_JOB_WEAPONS` = 5）。WAVE 4・5 は 2 段目に並ぶので、見出しを段ごとにまとめて列の幅を出し（`wave_rows`）、1 段目のスペシャルの段は次の段の見出しの上で切る（2 段目の GJ! を数えない）。評価の行が無いので、チームのイクラ・ウロコの行が上に詰まる（`read_header` は左側の数のいちばん上の行を読む）
- EX-WAVE は `salmon_job_waves.wave` = 6（`EX_WAVE`。チームコンテストの WAVE 4・5 と重ならないように）。`job_kind` を足す前は 4 だったので、`migrate` が列を足すときに一度だけ 4 → 6 に移す
- キャプチャは `data/salmon-results/`（ヒストリーとして残す）。PATCH の `captures` はファイル名のみ（`CAPTURE_FILE_PATTERN`。パスを含めさせない）。POST / PATCH は `Content-Type: application/json` 必須
- 詳細: 必須項目とは別に `read_details` でバイトの詳細（`SalmonJobDetails`。キケン度・評価・ポイント・チームのイクラ・ウロコ・オカシラ、WAVE ごとの納品数 / ノルマ・潮位・イベント・金イクラ出現数・スペシャルの数、4 人の成績・ブキ・スペシャル）を読み、PATCH の `jobs[].details` で送る。読めない項目は null、詳細の読み取りで例外が起きても `read_result` が詳細を null にして記録は続ける。WAVE の列は「WAVE n」/「EX-WAVE」の見出しを基準に、プレイヤーは各行の「オオモノシャケ」を基準に読む。キケン度は「キケン度」を「約」と読んだり「285%」の 2 が抜けたりするので、いつもの位置（`HAZARD_REGION`。ブキの数・バイトの種類によらず同じ）を切り出して多数決で読み、読めなければ「%」の付いた文字の右端から切り出して読む（`read_hazard_level`。右端からの切り出しは「316%」を 16 と読むことがあるので後にする）。獲得ポイントは「452p」の装飾文字を読み違えるので、スコアの行（「136 x 2.70 + 50」）から `job_point_of`（スコア × レートの切り捨て + ボーナス）で計算し、行が読めないときだけ「NNNp」を読む。「獲得ポイント」のラベルが読めない画面では、その下の「バイトスコア / 評価レート / クリアボーナス」の行を基準にする（`point_label_cy`）。スペシャルは Leanny/splat3 の画像と形（参照は不透明度、アイコンは明るさ）で照合する（`match_special`）。クリア / 失敗の見出しは、明るいステージでは倍率によって Failure に似た文字に読むので、倍率を変えた読み取りの多数決にする
- 詳細の保存: `salmon_jobs` の詳細の列（後から追加したので `migrate` で足す。手入力・以前の記録は NULL）と、子テーブル `salmon_job_waves` / `salmon_job_players` / `salmon_job_bosses`（`ON DELETE CASCADE`）。検証は `lib/salmon.ts` の `parseJobDetails`。オオモノの定義は `lib/salmonBosses.ts`（key は stat.ink、`image` は Leanny/splat3 の `coopEnemy`）、スペシャルは `lib/salmonWeapons.ts` の `SALMON_SPECIALS`
- オオモノの欄: 詳細画面を読んだ後、`BOSS_SCROLL_PIXELS` ずつ下にスクロールして撮影し（`*-bosses.png`）、「※カッコ内の数字は…」が見えるまで読む（`read_bosses`。オカシラが出たバイトは一覧が 1 画面に収まらない）。行はオオモノの名前（`lib/salmonBosses.ts` の `name`。短い「ヘビ」は名前だけ切り出して読み直す）で見つけ、同じオオモノを何度か読んだら多数決。数（「4(3) / 出現数x4」）は等倍の小さな文字で Vision では 7・1 を読み間違えるので、`digit_glyphs.py` の数字・カッコの形（fixtures から切り出したもの）と照合し、カッコの位置はすべての並び方から形がいちばん合うものにする（`read_kills`）。いちばん合う読みが出現数と矛盾するとき（8 を 9 と読んで出現数 x8 を超えるなど）は、矛盾しない次の読みを採る（`parse_boss_counts`）。同じオオモノの読みが画面ごとに割れて同数なら、先に読めたほうで合計が合わないときだけ、合計が合う選び方が 1 通りならそれを採る（`merge_boss_rows`）。自分の討伐数の合計が自分の行の「オオモノシャケ xN」と合わなければ、スクロールした画面に 4 人の行が見えていれば自分の行を読み直し、そちらと合えば詳細画面の読み間違い（x33 を 35 など）とみなしてその数で記録する（バイトの `bossKills` と自分の行も直す）。どちらとも合わなければ記録しない。読み終えて先頭に戻したら日時を読み直し、別のバイトに切り替わっていたら（イカリング3の読み込みが遅れたとき）捨てる。読み終えたら先頭に戻す（最新のバイトで「最新のバイトへ」を押してもスクロールの位置は戻らない。「前のバイト」で移ると先頭に戻る。下のボタンはスクロールしても出ている）
- **味方の名前**（`salmon_job_players.name`）は DB に残すだけで、API・配信画面・ログ・`--read` の出力には出さない
- オオモノ討伐: `getSummary` の `bossRanking` で、前回のバイトとセッション合計の、オオモノごとの自分の討伐数（多い順・同数は `SALMON_BOSSES` の順・0 体は除く）を返す。サイドパネルの `bossRanking` スロット（`components/BossRanking.tsx`）は、前回と本日の TOP3 を左右に並べ、オオモノは画像（Leanny/splat3 の `coopEnemy`。読み込めなければ名前）で表す（スケジュールと並べても下段に収まる高さにするため）。本日のセッションにオオモノの数が 1 体も無い（手入力だけ・取り込み前）うちは表示しない
- Python 側のテストは `tools/salmon-result/` で `pytest`（CI 対象外。Vision を使うので Mac で実行）。`fixtures/` に実際の詳細画面（クリア・失敗・オカシラあり）と、オオモノの欄までスクロールした画面（`bosses-*.png`）、ビッグラン・バイトチームコンテストの詳細画面（`bigrun-*.png` / `teamcontest-*.png`。iPhone のスクリーンショットを、ミラーリングの撮影と同じ 407x897 の配置に縮めたもの。ブキ・スペシャルの照合は確かめていない。チームコンテストの失敗の画面はまだ無い）を置いている。**プレイヤー名は塗りつぶしてから置く**

### `/app/weapon-card-overlay/page.tsx` と `/app/api/weapon-card/route.ts`

サーモンランのオールランダム編成で、支給されたブキを 1 種ずつ埋めて全種コンプを目指す「ブキ埋めカード」。

- ブキの定義は `lib/salmonWeapons.ts` の `SALMON_WEAPONS`（71 種 = 通常 63 + クマサン印 8。サーモンランで支給されないスプラスコープ・4Kスコープは除く）。key は stat.ink の `/api/v3/salmon/weapon` の key、`image` はゲーム内部のブキ名。並び順（カテゴリ順）がカード・パレットの並び。ブキが追加されたらここに足す
- 画像は Nintendo の画像を同梱しないよう Leanny/splat3 の `images/weapon_flat/Path_Wst_<内部名>.png` を参照する（`weaponImageUrl`）。リンク切れに備え、`WeaponIcon` は読み込めなければブキ名を文字で出す
- 戦績の記録（`SalmonJob`）に `weapons`（支給されたブキの key、最大 `MAX_JOB_WEAPONS` = 5 = バイトチームコンテストの 5 WAVE（通常は 3 WAVE + EX の 4）、重複可、省略可）を追加した。`salmon_jobs.weapons` は後から追加した列なので、`openDb` の `migrate` で既存の DB に `ALTER TABLE` で足す（列を足すときは同じようにする）。保存値の壊れた JSON・未知の key は読み込み時に捨てる
- カードの状態は `app_state`（キー `weaponCard`）の `{startedAt, manual}`。埋まっているブキは「`startedAt` 以降に記録したバイトのブキ」と「手動で埋めたブキ」を合わせたもの（`getWeaponCard`）。記録から導出するので、記録を取り消すとマスも戻る。カードの区切りはサーモンランのセッションとは独立（セッションをまたいで続けられる）。両方で埋まったものは記録由来（`source: 'job'`）として扱い、手動では外せない
- `GET /api/weapon-card`（`{startedAt, total, obtained: {key, at, source}[]}`、埋まった順）、`PATCH {weapon, obtained}`（手動で埋める / 外す）、`POST`（新しいカードを始める）。PATCH / POST は `Content-Type: application/json` 必須
- コントロールパネルの配信中の画面のサーモンランの手入力のダイアログでは、「ブキを選ぶ」で開く `WeaponPicker` で支給ブキを選ぶ（押すたびに追加。外すときは選んだブキを押す）。手動の埋める / 外すは配信中の画面の「ときどき直すもの」（`components/TimelyFixesCard.tsx`）のダイアログ（`WeaponCardManual`）、振り返りの画面のブキ埋めのカード（`components/WeaponCardPanel.tsx`）は進捗・画像・新しいカード（確認ダイアログ付き）。どれもその場で保存
- サイドパネルの `weaponCard` スロットにも出せる（`<WeaponCard compact/>`。幅 250px に 12 列で縮めた、試合中に埋まり具合がなんとなくわかる程度の表示。スケジュールなどと並べても下段に収まる高さにしている）。`/weapon-card-overlay` は試合の合間などにたまに出す拡大表示という位置づけ
- 振り返りの画面のブキ埋めのカードの「画像をダウンロード」で、今のカードを SNS 投稿用の PNG（12 列 × 6 行の横長）にする（`lib/weaponCardImage.ts` の `renderWeaponCardImage`。DOM のキャプチャではなく Canvas に直接描く）。ブキの画像は `crossOrigin = 'anonymous'` で読み込み（raw.githubusercontent.com は CORS を許可している）、読み込めないブキはブキ名を文字で描く（Canvas を汚して書き出せなくならないように）。フォントはオーバーレイと同じく共通設定のもの（`/api/stream-data` の `fontFamily`）。Canvas は書式が不正な font を黙って無視するので `canvasFontFamily` でフォント名を引用符で囲み、そのフォントに無い文字用に日本語のシステムフォントを後ろに足す。描く前に `document.fonts.load` で読み込む
- オーバーレイは 2 秒ごとに `/api/weapon-card` と `/api/stream-data`（フォント）をポーリングする。`components/WeaponCard.tsx` は `ChallengeList` と同じく前回の状態と比べ、ポーリング中に新しく埋まったマスだけスタンプを押す演出をし、71 種そろった瞬間だけ花火を出す（表示した時点の状態・新しいカードの開始では演出しない）

### `/app/salmon-review-overlay/page.tsx` と `/app/api/salmon/review/route.ts`

配信の最後に、その日のサーモンランの記録を配信画面に大きく被せて振り返るオーバーレイ（1920x1080。背景は半透明の暗幕）。

- `GET /api/salmon/review`（`?sessionId=` で過去のセッション）。集計は `lib/salmonReview.ts` の `getSessionReview`（型は `lib/salmonTypes.ts` の `SalmonSessionReview`）。合計・バイトごとの金イクラ（古い順）・WAVE ごとの失敗数のほか、取り込んだバイトの詳細（赤イクラ・救助・獲得ポイント・最高キケン度・評価の最初と最後・オカシラ・オオモノごとの数・チームの金イクラ納品数の上位 5 件（`teamHighScores`。同数なら先のバイト））、自分のオオモノ討伐数がいちばん多いバイト（`bestBossJobId`。手入力のバイトも含む。「結果」カードに「ベスト オオモノ」として出す）、支給ブキの回数、セッション中にブキ埋めカードで埋まったブキ・作ったクリップ（次のセッションの開始まで）、本日のお題の達成数（今のセッションのときだけ。サイドパネルの設定にしか無いため）を返す。**味方の名前は返さない**
- 詳細の集計は、詳細を取り込んだバイト（`detailedJobs`）だけ。手入力のバイトがあると、画面に「取り込んだ n 件の合計」と添える
- 本体は `components/SalmonReview.tsx`。グラフは依存を増やさず SVG・div で描く（dataviz スキルの作法: ダークの配色だけ、クリア / 失敗はどのグラフでも青 / オレンジ（色覚の違いでも見分けられることを検証済み）、棒は細く根元は四角・先は丸く、値は最多のバイトにだけ出す、目盛りはきりのいい数（`niceTicks`）、2 つの値を 1 つのグラフの左右の軸に出さない）。OBS ではマウスを使わないので、ツールチップは付けない
- 開いたときにカードを上から順に出す motion の演出（初回だけ。`animate={false}` で無し）。5 秒ごとにポーリングし、フォントは `/api/stream-data` の `fontFamily`。ポーリングは `components/SalmonReviewOverlay.tsx`（`layout` を受ける）で、2 つのページはこれを置くだけ
- レイアウトは `layout: 'landscape' | 'portrait'`（`REVIEW_SIZES`）。portrait（`/salmon-review-overlay/vertical`、1080x1920）はカードを縦に積み、最後にハイスコアとブキを横に並べる。カードの中身は共通で、外側の並びだけを分けている。カードを足すときは両方の並びに入れる。横長は高さに余裕が無く、中段は「結果」カードの高さで決まるので、行を足すと下段（オオモノ 7 行・ブキ）がはみ出す。足したら横長の見た目で下段が収まることを確かめる
- SNS 用の画像: コントロールパネルの振り返りの画面の過去のセッションのカード（`components/SalmonReviewDownload.tsx`）で、選んだ過去のセッション（選ばなければ今のセッション）の振り返りを横長 / 縦長の PNG でダウンロードする。オーバーレイと見た目を一致させるため、ブキ埋めカードと違い Canvas で描き直さず、画面外に実寸で描いた DOM を `html-to-image` の `toBlob` で画像にする（演出なし・不透明な背景）。ブキ・オオモノの画像は raw.githubusercontent.com（CORS 許可）なので埋め込める

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
- コントロールパネルの準備の画面のサイドパネルのカード（`components/SidePanelSettingsPanel.tsx`）と本日のお題のカード（`components/ChallengeEditorCard.tsx`）は、`components/useSidePanelSettings.ts` を画面で 1 回だけ使って同じ設定を共有し、変更をその場で保存する。設定は丸ごと POST するので、保存のたびに最新の設定を GET し直して、変えた項目だけを重ねて送る（配信中の画面で付けたお題の達成などを戻さないため。お題の追加の id・削除・並べ替えも最新のお題から作る）。保存は 1 つずつ順に送り、失敗したらヘッダーの「保存できませんでした」と読み込み直し
- 既存の `/burndown-overlay` はそのまま残している（サイドパネルのバーンダウンスロットは花火エフェクトを出さない）
- フォロワーゲージは `/api/twitch` もポーリングして表示する。値は `getFollowerProgress`（`lib/sidePanelTypes.ts`）で決める: Twitch のクリエイターゴール（フォロワー型）を優先し、無ければフォロワー総数と手入力の `followerGoal`（設定に保存、`null` は未設定）。どちらも無い、または Twitch 連携スクリプトが未起動（`followerTotal: null`）ならゲージを出さない
- ゲージはフォローを受信すると（`lastFollowAt` の変化）インクを波打たせて `BubbleEffect` を出し、目標を変えずにフォロワー数が目標に届いたときだけ `FireworksEffect` を出す（目標の編集だけでは出さない。達成のたびに `key` で作り直して再生）。表示した時点の値では演出しない（オーバーレイの再読み込みで演出が出ないように）。泡と花火は vw / vh 基準なので、`absolute inset-0 z-50` でサイドパネルのルート（`relative`）全体を覆い、下段スロットより手前に出す
- `followerGoal` と `challenges` は後から追加した項目なので、保存済みの設定に無ければそれぞれ `null` / `[]` として扱う（既存の設定を既定値に戻さないため）。設定に項目を足すときも同じようにする
- 本日のお題（`challenges: {id, text, done}[]`、最大8個・各3行・改行を除いて40文字）はサイドパネル設定に含めて保存し、コントロールパネルで追加・削除・達成チェックする。`components/ChallengeList.tsx` は `done` が false → true に変わった瞬間だけスタンプを押す演出をする（前回の状態と比べてレンダー中に state を調整する。表示時点で達成済みのものやポーリングでは再生しない）。お題が0個なら何も表示しない
- お題の改行は配信者が折り返したい位置なので、`normalizeChallengeText` で各行の前後の空白と空行だけを除いて残し、オーバーレイ・コントロールパネルとも `white-space: pre-line` で表示する。入力欄は複数行（Enter は改行、Ctrl / ⌘ + Enter で追加）

### `/app/api/score-display/route.ts` と `lib/scoreDisplay.ts`

スコア表示（`/obs-overlay` の `scoreLabel` / `scoreValue`）を、サーモンランのリザルトの取り込みのたびに自動で入れる機能。

- 値と設定 `{scoreLabel, scoreValue, autoUpdate}` は SQLite の `app_state`（キー `scoreDisplay`）。`GET /api/stream-data` は `StreamData` に合わせて返す。以前はコントロールパネルが `StreamData` を丸ごと POST していたので、サーバーで書き換えても次の保存で戻っていた。いまはパネルの POST に含めず、配信中の画面の「ときどき直すもの」の「直す」（`components/ScoreDisplayPanel.tsx` の `ScoreDisplayEditor`）が `PATCH /api/score-display`（送った項目だけ書き換える。`Content-Type: application/json` 必須）で「反映」したときだけ保存する。自動更新の ON/OFF は設定の「スコア表示の自動更新」（`ScoreAutoUpdateCard`）。編集中は 3 秒ごとの読み込み直しで入力を上書きしない
- 自動更新（`updateScoreDisplayFromImport`）: `PATCH /api/salmon/import` が succeeded で記録したあと、最新のバイト（`jobs` の最後）で決める。`autoUpdate` が false・値を決められないときは変えない。失敗しても取り込みは成功として返す
  - いつものバイト: 「現在のバイト評価」と評価（`formatGrade`。でんせつは `720` のように数字だけ、それ以外は `たつじん+3 450`）
  - ビッグラン / バイトチームコンテスト: 「ハイスコア」と、そのバイトの日時を含むスケジュールの枠（同じ種類）で記録したバイトのチームの金イクラの最大（`getShiftHighScore`。ビッグランは失敗も数え、チームコンテストはクリアだけ。ゲーム内のハイスコアに合わせた）。日時はイカリング3の表示（日本時間）なので `parsePlayedAt` でエポックミリ秒に直す。スケジュール（非公式 API）が取れない・過去の枠で見つからないときは変えない
- 型・検証・既定値は `lib/scoreDisplayTypes.ts`（クライアントからも使う）

### `/app/api/salmon-schedule/route.ts` と `lib/salmonSchedule.ts`

サーモンランのスケジュール（ステージ・支給ブキ・残り時間）を表示する機能。

- 非公式 API（https://spla3.yuu26.com/）の `coop-grouping/schedule` と `coop-grouping-team-contest/schedule` をサーバー側で中継する。利用規約に従い、連絡先（リポジトリの URL）入りの User-Agent を付ける
- 外部 API へのアクセスは 5 分キャッシュ（`CACHE_TTL_MS`）で抑え、同時のリクエストは1回にまとめる。失敗したら直前の値を返し、1 分（`RETRY_AFTER_FAILURE_MS`）は再取得しない。一度も取れていなければ 502
- 外部 API の取得は 10 秒（`FETCH_TIMEOUT_MS`）で打ち切り、応答は 1 MB（`MAX_RESPONSE_BYTES`）を超えた時点で読むのをやめる（`readLimitedText`）。画像 URL は https のものだけ受け付ける
- 非公式 API の仕様変更に備え、`parseScheduleResults` は形が想定と違う要素を捨てる。開催中のものは `pickCurrentSchedule` で選び、同じ時間帯ならバイトチームコンテスト > ビッグラン > 通常の順に優先する
- サイドパネルの `schedule` スロット（`components/SalmonSchedule.tsx`）で表示する。画像は外部の署名付き URL なので `next/image` を通さず `<img>` で表示する
- コントロールパネルの配信中の画面のサーモンランの手入力は、開催中のステージ名・バイトの種類を初期値にする（手で記録したらその値を次の記録に引き継ぐ。取れなくても記録はできる）
- 取得・キャッシュは `lib/salmonScheduleFetch.ts` の `getSalmonSchedule()`（サーバー専用。スコア表示の自動更新でシフトの区切りにも使う）。ルートはこれを返すだけ
- テストでは `fetch` を `vi.stubGlobal` で差し替え、`__TEST_ONLY_resetSalmonScheduleCache()` でキャッシュを消す

### `/app/telop-overlay/page.tsx` と `/app/api/telop/route.ts`

サーモンラン中などチャットを打てないときに、定型文の「実況テロップ」をワンボタンで出す機能。

- `POST /api/telop` に `{presetId, speak?}`（`speak: false` ならプリセットの設定によらず読み上げない。文字起こしから出すとき用）か `{text, followFont?}`（1 行・30 文字まで。`normalizeTelopText` で改行と連続する空白を空白 1 つにまとめる）を送るとテロップを出す。Stream Deck などからも同じ形で送れる（JSON 以外は 415、無いプリセットは 404）
- `{event: 'follow'}` はフォローのお礼（Twitch 連携スクリプトがフォローのたびに送る）。文言は固定の `FOLLOW_TELOP_TEXT`（「フォローありがとうございます！🥳」。フォローした人の名前は入れない）で、絵文字を除いた `FOLLOW_SPEECH_TEXT` を読み上げる（読み上げが無効なら読まない）。チャットには書き込まない。前回から `FOLLOW_TELOP_COOLDOWN_MS`（15 秒）以内なら何もしない（レイドの後などに続けて出さない。間のフォローはサイドパネルのゲージの泡だけ）。`presetId` / `text` と一緒には送れない
- いま出ているテロップ `{id, text, followFont, effect, timestamp}`（`effect` は通常 null、フォローのお礼は `'follow'`、サーモンランの記録のお祝いは `'record'`。お祝いの `text` だけは改行区切りの 2 行） はインメモリ（再起動で消えてよい）。状態は `lib/telop.ts` が `globalThis` に持つ（`/api/salmon/import` からも出すので、ルートごとにモジュールが別に読み込まれても共有できるように。`lib/speech.ts` と同じ）。プリセット `{id, text, speak, followFont, display, chat}`（最大 30 個。キーボードのショートカットは先頭の 10 個。`display` は配信画面のテロップに出すか。false ならオーバーレイの `current` / `revision` を変えず、コメントだけになる。後から追加した項目なので無ければ true。`display` と `chat` のどちらかは true でないと不正。テロップバーではコメントだけのボタンに 💬 を付ける）は SQLite の `app_state`（キー `telop`）に保存し、`PUT /api/telop {presets}` で更新する。保存値が不正なら既定のプリセットを返す。`__TEST_ONLY_resetTelop()` はテスト用
- 型・定数・検証は `lib/telopTypes.ts`（クライアントからも使う）。`speak` は合成音声で読み上げるかの設定。`speak` が true のプリセット（自由入力は `speak: true` を付けたもの）は、出すと同時に `enqueueSpeech` で読み上げキューに入れる（読み上げが無効なら入れない）
- `followFont` は共通設定のフォント（`/api/stream-data` の `fontFamily`）で表示するか。そのフォントに無い文字が化けるテロップは false にして `sans-serif` で出す。後から追加した項目なので、保存済みのプリセットに無ければ true とみなす（自由入力で省略したときも true）
- `chat` は Twitch のチャットにも配信者のコメントとして書き込むか（後から追加した項目なので、無ければ false）。chat のプリセットを出すと（ボタン・キーボード・声のどれでも）、インメモリの書き込み待ち `{id, text, speak, picked, createdAt}` に入れ、テロップ側では読み上げない（書き込んだコメントは Twitch 連携スクリプトの配信者のコメントの読み上げで読まれるので、二重にしない。読み上げない設定（`speak` が false。声で出したときの既定も）なら、スクリプトが書き込む前に本文を `MutedOwnMessages` に登録し、戻ってきた自分のコメントを 1 回だけ読まない）。`speak` は本来読み上げる予定だったか（フォールバック用）。Twitch 連携スクリプトの `createChatPostProcessor` が 1 秒ごとに `GET /api/telop?view=chat` で拾い、`PATCH {chatId, status: 'picked'}` → Helix の `POST /chat/messages` → `PATCH {chatId, status: 'sent' | 'failed'}`（結果は picked のものだけ受け付け、それ以外は 409）。`failed`、または `CHAT_PICKUP_TTL_MS`（3 秒）以内に拾われなかった（スクリプト未起動）ものは、`speak` ならテロップ側で読み上げる。拾った後に結果が来ないものは `CHAT_RESULT_TTL_MS`（30 秒）で読み上げずに捨てる。期限切れは `GET`（オーバーレイが 0.5 秒ごとに呼ぶ）・`PATCH` のたびに判定する。自由入力はコメントにしない
- オーバーレイの本体は `components/TelopOverlay.tsx`（`layout: 'landscape' | 'portrait'`。`LAYOUT_STYLES` で置き方を分ける）。2 つのページはこれを置くだけ。portrait（`/telop-overlay/vertical`、1080x1920）は上部のサイドパネル（縦型配信用）と重ならないよう、画面の下から 440px の位置に中央揃えで、少し大きな文字で出して長い文は折り返す
- オーバーレイは 0.5 秒ごとにポーリングし（フォントは 2 秒ごとに `/api/stream-data` から取得）、出してから表示時間（`telopDisplayDuration`。通常は `TELOP_DISPLAY_DURATION`（4 秒）、フォローのお礼は `FOLLOW_TELOP_DISPLAY_DURATION`（8 秒）、記録のお祝いは `RECORD_TELOP_DISPLAY_DURATION`（8 秒））以内のものだけ表示する（開き直したときに古いテロップを出さない）。landscape（`/telop-overlay`）の位置は配信画面のゲーム画面の右下（右端揃え。右下の角に重なる立ち絵の左。`TELOP_RIGHT` / `TELOP_BOTTOM` の px で決め打ち。配信画面のレイアウトを変えたら見直す）。テロップごとにインクの色を変える。フォローのお礼は大きめの虹色の帯をバウンスさせて出し、`FireworksEffect`（`key` で作り直して再生。20 秒で自分で消えるので、テロップが消えても・別のテロップに置き換わっても続く）と `SparkleEffect` を重ねる。記録のお祝いは金色の帯で同じ演出をする（`white-space: pre-line` で 2 行に出す）。開いた時点で出ていたお礼・お祝いでは演出しない（OBS の再読み込みで演出が出ないように）
- プリセットのボタンは、配信中の画面の `components/TelopBar.tsx` に置く（先頭 10 個は 2 列のキー、11 個目以降は「ほかのテロップ」で開く。コメントだけのプリセットにチャットのアイコン。出している間は「表示中」）。キーボードの 1〜9, 0 はコントロールパネルの共通の外枠の `useTelopHotkeys` が受けるので、どの画面（準備・振り返り・設定も）でも効く。プリセットは `controlPanelContext.tsx` の `TelopPresetsProvider` が 1 回だけ読み込んで、ボタンと数字キーで共有する
- 設定の「テロップのプリセット」（`components/TelopPanel.tsx`）は、自由入力とプリセットの編集（変更はその場で保存）。保存のたびに（失敗して読み込み直したときも）`onPresetsChange` を呼び、`TelopPresetsProvider` の `reload` でプリセットを読み込み直させる

### `/app/voice-overlay/page.tsx` と `/app/api/speech/` / `/app/api/voice/`

合成音声（VOICEVOX）で、テロップなどを読み上げて配信に声を入れる機能。

- 読み上げキュー（`lib/speech.ts`、サーバー専用）はインメモリ。`/api/speech` と `/api/telop` など複数のルートから使うので、ルートごとにモジュールが別に読み込まれても共有できるよう `globalThis` に置く。1 件 100 文字まで（超えたら切り詰め）・最大 20 件・60 秒で破棄。ID は起動時刻から振る（サーバーを再起動しても、開いたままのオーバーレイが新しい読み上げを再生済みと取り違えないように）。`enqueueSpeech` は読み上げが無効・話者が未選択なら追加せず null を返す（`POST /api/speech` は 409）。`__TEST_ONLY_resetSpeechQueue()` はテスト用
- `/api/speech/audio?id=` はキューにある id だけを受け付け、VOICEVOX の `audio_query` → `synthesis` を中継して wav を返す（任意の文を読ませないため）。合成は ID ごとに 1 回だけ（`synthesizeSpeech` が結果をキャッシュし、失敗したら次の要求で合成し直す。合成後に速度・音量を変えても、合成済みのものはそのまま）。VOICEVOX との通信は 10 秒（`VOICEVOX_TIMEOUT_MS`）で打ち切り、応答は `audio_query` 1 MB・wav 20 MB を超えた時点で読むのをやめる。失敗したら 502
- 設定 `{enabled, speakerId, speakerName, speedScale, volumeScale}` は SQLite の `app_state`（キー `voice`）。既定は無効。`speakerId` は VOICEVOX のスタイル ID、`speakerName` はクレジット表記（`voiceCredit` → `VOICEVOX:キャラ名`）用のキャラクター名。`/api/voice/speakers` は VOICEVOX の `/speakers` の中継で、歌唱用（`type` が `talk` 以外）のスタイルは除く（`parseSpeakers`）
- オーバーレイは 0.5 秒ごとにキューを取得し、開いた時点でキューにあったものは再生しない。新しいものを 1 件ずつ順に `Audio` で再生し、再生できなかったとき（VOICEVOX 未起動・自動再生の拒否など）も止まらずに次へ進む
- コントロールパネルの設定の「読み上げ（VOICEVOX）」に `components/VoiceSettingsPanel.tsx`（有効/無効・話者・速度・音量・テスト再生・クレジット表記）。VOICEVOX に接続できなくても保存済みの話者は表示する
- テストでは `fetch` を `vi.stubGlobal` で差し替える（実際の VOICEVOX には接続しない）

### `/app/api/clip/route.ts` と `lib/clips.ts`

配信中にゲームをしていてボタンを押せないので、声で Twitch のクリップを作る機能。

- 流れ: 文字起こしスクリプトが合言葉（`CLIP_PATTERN`。「クリップ」＋「撮って / して / お願い」など、または「今の（とこ）クリップ」。「クリップ」単体では雑談で誤爆するので作らない）を聞くと `POST /api/clip {source: 'voice'}` → Twitch 連携スクリプトが 1 秒ごとに `GET /api/clip?status=pending` で拾い、Helix の `POST /clips` で作って `PATCH /api/clip {id, status, clipId, editUrl | error}` → `POST /api/telop {text, speak: true}` で「クリップしました！」/「クリップできませんでした」をテロップ＋読み上げで知らせる。コントロールパネルの配信中の画面のクリップのカード（`components/ClipPanel.tsx`）のボタンも同じ依頼を送る（`source: 'button'`）
- Twitch のトークンは Twitch 連携スクリプトだけが持つ（Public クライアントのリフレッシュトークンは使い捨てなので、別のプロセスと共有しない）。そのため依頼は API を介して受け渡す。スコープ `clips:edit` を追加した（保存済みのトークンは承認し直し）
- 依頼は SQLite の `twitch_clips`（`pending` / `created` / `failed`）。処理待ちの依頼があれば新しく作らずにそれを返す（連呼・連打で同じ場面を重ねて作らない）。`CLIP_REQUEST_TTL_MS`（30 秒）以内に処理されなかった依頼は、一覧・取得のたびに `expireStaleRequests` で期限切れ（失敗）にする（スクリプトを後から起動したときに、別の場面のクリップを作らないように）。作成中に期限切れにされたものも、結果は書き込める
- Twitch 連携スクリプトの `createClipProcessor` は前回の処理中なら何もせず、一度試した依頼はやり直さない（結果を送れなくても同じ依頼から 2 つ作らない）。文字起こし側（`ClipTrigger`）も 30 秒は依頼し直さず、合言葉を言った発話は字幕・テロップにしない。`CLIP_MATCH=off` で無効
- `DELETE /api/clip?id=` は履歴から消すだけ（Twitch 上のクリップは消さない）。作成待ちのものは 409（作成中に消すと結果を書き込めずに失われるため）。PATCH の `editUrl` は twitch.tv の https のページのみ（偽のページへのリンクにしないため）、`clipId` は英数字・`-`・`_` のみ受け付ける（コントロールパネルでリンクにするため）。POST / PATCH は `Content-Type: application/json` 必須

### `/app/api/join-queue/route.ts` と `lib/joinQueue.ts`

視聴者参加型（18:00 からのプライベートバイト中心）の受付。チャットの `!参加 でんせつ820` で列に入り、配信者がコントロールパネルの配信中の画面の参加のカードの「次の人を呼ぶ」で呼ぶ（Issue #116。仕様はナレッジベースの `workspaces/personal/output/twitch/handoff/join-queue.md`）。

- 流れ: Twitch 連携スクリプトの `handleJoinCommand` が `channel.chat.message` の `message.fragments` の text だけを NFKC・ゼロ幅 / 方向制御文字の除去のうえ `parseJoinCommand` で `!参加` / `!取消` を見つけ、`POST /api/join-queue {action: 'join', userId, userName, messageId, args}` / `{action: 'cancel', userId}` → 応答の `reply` を `reply_parent_message_id` 付きで返信（`sendChatMessage(message, replyParentId)`）。`!参加でんせつ820` のように続けて書いてもよいが、続けて書いて評価として読めないもの（`!参加したい` など。`attached`）は雑談とみなして受け付けない（`ignored`）。配信者自身・`TWITCH_SPEECH_IGNORE` のボット・共有チャットのほかのチャンネルは除く
- **本人だけに見える返信は Twitch の API ではできない**（Whisper は 1 日 40 人・黙って捨てられるなどで使わない）。返信は全員に見えるので評価はくり返さない。`ReplyThrottle` で同じ人へは 5 分・全体では 15 秒に 1 回まで（抑えている間は返さない。配信画面に書き方を出しておく。書き込めなかったら記録を戻す）。文面には表示名を入れる（同じ文面の連投は Twitch に捨てられることがあるため。仕様どおり）。返信は `MutedOwnMessages` に入れて読み上げない（返信は先頭に「@相手 」が付いて戻ることがあるので、`consume` は外したものとも比べる）。ログには user_id と結果だけ（本文・名前は出さない）
- 評価の読み取り（`lib/joinQueueTypes.ts` の `parseJoinRating`）: `normalizeJoinText`（NFKC・ゼロ幅 / 方向制御文字の除去・小文字・カタカナ→ひらがな）のあと、ホワイトリストの文法（`称号? (+N|ぷらすN|plusN)? 評価値?`）と別名表（漢字・ローマ字・英語版。称号の照合では空白・中点・長音・ハイフンを除く）で読む。引数は 20 文字まで（英語版の長い正式名は入らない）。たつじん以下で 100 以上・1000 以上は読めない。数字だけは 100〜999 をでんせつとみなし、0〜99 は読めない（称号を聞き返す）。かんすと / counterstop / max → でんせつ 999、intern → かけだし 0。称号だけは `points: null`（近似）。`たつじん3` は評価値 3 と読み、注記を手元に出す。**読めなくても受け付ける**（評価は不明。返信に書き方を付ける）
- 列（`lib/joinQueue.ts`）はメモリだけ（`globalThis`。ディスクに書かない。残すのは下の集計の人数だけ）。1 人 1 枠（`chatter_user_id`。書き直したら評価を上書きし順番は保つ）、上限 `JOIN_QUEUE_MAX_ENTRIES`（20）。受付中（`open`。「受付開始」）のときだけ受け付け、それ以外の `!参加` は黙って捨てる（返信もしない）。「受付終了」で列といまの人を消す。`__TEST_ONLY_resetJoinQueue()` はテスト用
- `GET /api/join-queue` は配信画面用（番号・表示名・いまの人だけ。**評価は出さない**）、`?view=panel` は手元用（評価・注記つき。`messageId` は出さない）。ほかの API と同じく localhost 前提で認証は無い（API では評価を隠していない。LAN などに公開しない）。`POST {action}`（`join` / `cancel` / `remove` / `next` / `open` / `close` / `streamer` / `announce`、Twitch 連携スクリプトからの `removeMessage` / `removeUser` / `offline` / `reconnected`、手元の `dismissReconnect`）。`Content-Type: application/json` 必須
- 表示名は `sanitizeDisplayName`（NFKC・制御 / 書式文字の除去・25 文字まで）で整え、React の描画（textContent 相当）で出す。`dangerouslySetInnerHTML` は使わない
- オーバーレイ（`/join-queue-overlay`、420x600）は 1 秒ごとにポーリングし、受付中だけ書き方・部屋の推定キケン度・いまの人・列（10 人まで。残りは「ほか n 人」）を出す。フォントは `/api/stream-data` の `fontFamily`
- 部屋の推定キケン度（#118。`lib/joinQueueTypes.ts` の `estimateRoomHazard`）: 累計評価値 = `tier*100 + 評価値`（でんせつは `800 + 評価値`。評価値が無ければ tier の中央 +50、でんせつは 400 で近似）の平均 ÷ 5、上限 333%（攻略 Wiki の解析値）。部屋は配信者と、いまの人・列の先頭から合わせて 4 人（`ROOM_SIZE`）。評価が不明の人は除き（`unknown`）、足りない分は野良として含まない（`wild`）。キケン度には相当する評価（`ratingOfHazard`。キケン度 × 5 を累計評価値に戻す。230% → でんせつ 350）を添える（`formatHazardWithRating`）。配信画面（`JoinQueuePublicView.hazard`）は 10% ごとに丸めた値と人数だけ（誰の評価かは出さない）。手元は推定値（5% ごと）・おすすめ（`recommendHazards`。練習: いちばん低い人、通常: 推定値、腕試し: 333%）・配信者より低い称号の参加者の注意（`lowerTier`）
- 配信者の評価は、取り込んだ最新の記録（`salmon_jobs.grade_name` / `grade_point`、`getRecordedStreamerRating`）から取る。準備の画面の参加型の準備のカード（`JoinStreamerRatingCard`。「手で入れる」で入力欄を開く）で入力すると（`POST {action: 'streamer', rating}`。null で記録に戻す）それを優先する（メモリだけ。受付終了でも消さない）。入力より後のバイトを取り込んだら記録のほうを使う
- 評価は申告の時刻（`ratedAt`。書き直すと変わる。配信者の記録はバイトの日時）を持ち、いまのいつものバイトのシフトの開始（`loadHazardContext`）より前なら「古い」と手元に出す（シフトが替わると評価は「称号 40」に戻るため）。スケジュールが取れなければ古い扱いにしない。GET / POST の応答のたびに記録とスケジュールを読む。スケジュールは `peekSalmonSchedule`（`lib/salmonScheduleFetch.ts`）で待たずにキャッシュを使い、期限切れなら裏で取り直す（外部 API の応答を待って配信画面のポーリングを止めないため）
- お知らせ（`POST {action: 'announce', kind: 'merge' | 'private'}`、`formatJoinAnnouncement`）: 通常のバイトへの合流・プライベートバイト（おすすめの通常の値と、相当する評価つき。読み上げるので括弧は使わない）の文を、テロップのコメントと同じ書き込み待ち（`queueChatPost(text, true)`）に入れる。チャットに書き込めれば配信者のコメントとして読み上げられ、書き込めなければテロップ側で読み上げる
- 列から外す（#119）: 並んだメッセージの削除（`channel.chat.message_delete` → `POST {action: 'removeMessage', messageId}`。`removeByMessageId`。書き直した人は最後のメッセージで照合）・BAN / タイムアウト（`channel.chat.clear_user_messages` → `{action: 'removeUser', userId}`）で列といまの人から外す（いなくても `{removed: false}` でエラーにしない）。チャットの全消去（`channel.chat.clear`）はログだけ。配信の終了（`stream.offline` → `{action: 'offline'}`）は受付終了と同じ。スクリプト側は `moderationRequest`（純粋関数）/ `handleModerationEvent`。ログは user_id と結果だけ
- 再接続（#119）: `EventSubConnection` は 2 回目以降に新しいセッションで購読し直したとき（keepalive の途切れ・切断。`session_reconnect` では購読が引き継がれるので呼ばない）`onResubscribed` を呼び、スクリプトが `{action: 'reconnected'}` を送る。手元に「再接続しました（その間の参加は受け付けられていない可能性あり）」を出し、「確認した」（`{action: 'dismissReconnect'}`）か、次の受付開始で消す
- 集計（#119）: 受付の枠（受付開始〜終了・配信の終了）ごとに、並んだ人数・「次の人」で呼んだ人数・2 回以上呼んだ人数だけを `app_state`（キー `joinQueueStats`）に残す（誰が来たかは残さない。数えるための user_id はメモリだけで、受付終了で消す）。保存に失敗しても列は消す（ログだけ）。28 日（`JOIN_STATS_DAYS`）を過ぎたものは保存のたびに消し、振り返りの画面の「これまでの受付」（`JoinHistoryCard`）に出す（配信者が 4 週間で振り返る）
- 参加用のパスワード（ゲーム内のチャンネル機能）はコード・設定・ログに書かない

### `/app/break-overlay/page.tsx` と `/app/api/break/route.ts`

水・トイレなどで席を離れるときに「休憩中」を出し、戻ったときの解除忘れを防ぐ機能（Issue #123）。

- 状態は `lib/break.ts` が `globalThis` にインメモリで持つ（`{startedAt, voiceHeardAt, lastReminderAt}`。再起動で解除されてよい）。型・定数は `lib/breakTypes.ts`
- `GET /api/break`（`{active, startedAt, voiceHeardAt, serverTime}`）、`POST {action: 'start' | 'end'}`（休憩中に start しても開始時刻は変えない）、`POST {action: 'heard', resume}`（文字起こしスクリプトが発話のたびに送る。休憩中でなければ何もしない。`resume` なら終わる。開始から `BREAK_VOICE_GRACE_MS`（1 分）以内は離れる前のひとこととみなして無視し、それ以降は `voiceHeardAt` を記録して `BREAK_REMINDER_TEXT` を読み上げキューに入れる。読み上げは `BREAK_REMINDER_COOLDOWN_MS`（1 分）に 1 回）。`Content-Type: application/json` 必須
- コントロールパネルのボタンは `components/BreakControl.tsx`（`useBreak` を共通の外枠で 1 回だけ使い、ヘッダーのボタン `BreakButton` と、ヘッダーの下の帯 `BreakBanner` に渡す。どの画面でも押せる）。1 秒ごとにポーリングし、休憩中は経過時間と「休憩を終わる」を出す。`BREAK_LONG_MS`（10 分）を超えたか声を拾ったら赤く点滅させ、タブのタイトルにも出す（`⚠️ 休憩中 m:ss | 元のタイトル`）
- オーバーレイの本体は `components/BreakOverlay.tsx`（`layout: 'landscape' | 'portrait'`）。1 秒ごとにポーリングし、休憩中だけ半透明の暗幕に「休憩中」「ちょっと待っててね🐟️」と経過時間を出す。経過時間はサーバーの時計どうしで測る（`localBreakStart`）。フォントは `/api/stream-data` の `fontFamily`
- 文字起こしスクリプトは `BreakNotifier` が字幕のフィルタを通った発話ごとに `heard` を送る（合言葉は `BREAK_END_PATTERN`。「ただいま」「休憩終わり」「戻りました」など）。字幕・テロップ・エフェクトは止めない。`BREAK_MATCH=off` で無効

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

コントロールパネルは設定には使わない（設定はサーバーの SQLite に保存する。配信中の画面の「ほかのテロップ」を開いているかだけ `control-panel-telop-more-open` に覚える）。以前は `'control-panel-state'` キーに設定を入れていたので、残っていればサーバーに保存が無いときだけ 1 回送り、どちらでも消す（`components/useStreamSettings.ts`）。

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
- **該当箇所**: `ScoreDisplay.tsx`, `BurndownChart.tsx`, `FireworksEffect.tsx`, `app/burndown-overlay/page.tsx`, `components/ControlPanelSettings.tsx`

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
2. `lib/overlayPages.ts` の `OVERLAY_PAGES` に追加（映像の大きさ `size` を入れるとランチャーにプレビューが出て、設定の「OBS のブラウザソース」に大きさが出る）
3. 必要に応じて `StreamData` インターフェースを拡張
4. テストファイルを作成

## トラブルシューティング

### コントロールパネルの設定を読み込めない・保存できない

- 設定はサーバーの SQLite（`data/overlay.db` の `app_state`、キー `streamSettings`）にある。サーバーが起動しているか確認する

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
