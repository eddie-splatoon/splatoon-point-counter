# CLAUDE Code プロジェクトガイド: Splatoon Point Counter

このドキュメントは、Claude Codeがこのプロジェクトで効率的に作業できるように作成されたガイドです。

## プロジェクト概要

**Splatoon Point Counter** は、OBS向けのリアルタイム・データオーバーレイ・システムです。Next.js (App Router) とTypeScriptで構築されており、ストリーマーがコントロールパネルから配信画面上のオーバーレイをリアルタイムで制御できます。

### 主要な構成要素

1. **ランチャーページ** (`/`) - 各画面へのアクセスポイント
2. **コントロールパネル** (`/control-panel`) - ストリーマーがデータを更新するUI
3. **スコア＆メッセージオーバーレイ** (`/obs-overlay`) - メインのオーバーレイ表示
4. **バーンダウンチャートオーバーレイ** (`/burndown-overlay`) - 進捗状況を可視化
5. **バックエンドAPI** (`/api/stream-data`) - データ管理とクライアント間の同期

## 技術スタック

- **フレームワーク**: Next.js 16+ (App Router)
- **言語**: TypeScript 5+
- **UI/スタイリング**: Material-UI (MUI) v7, Tailwind CSS v4
- **アニメーション**: Motion (旧Framer Motion) v12
- **リアルタイム通信**: REST API + クライアントサイドポーリング
- **HTTPクライアント**: Axios
- **ブラウザAPI**: Web Speech API (音声認識機能)
- **テスト**: Vitest + React Testing Library + @testing-library/jest-dom
- **Linting**: ESLint 9 (Flat Config)
- **CI/CD**: GitHub Actions
- **コンテナ**: Docker + Docker Compose
- **Node.js**: v24.11.1 (Volta管理)

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
│   └── api/
│       └── stream-data/
│           └── route.ts          # データ管理API
├── components/                    # 再利用可能なReactコンポーネント
│   ├── ScoreDisplay.tsx          # スコア表示
│   ├── BurndownChart.tsx         # バーンダウンチャート
│   ├── MessageScroller.tsx       # メッセージスクロール
│   ├── RandomTipScroller.tsx     # ランダムTips表示
│   ├── HeartEffect.tsx           # ハートエフェクト
│   ├── StarEffect.tsx            # スターエフェクト
│   ├── BubbleEffect.tsx          # バブルエフェクト
│   ├── SparkleEffect.tsx         # スパークルエフェクト
│   └── FireworksEffect.tsx       # 花火エフェクト
├── public/                        # 静的アセット
│   └── tips.tsv                  # Tips データ
├── .github/
│   ├── workflows/
│   │   └── ci.yml                # CI/CDパイプライン
│   └── ISSUE_TEMPLATE/           # Issueテンプレート
├── **/*.test.{ts,tsx}            # テストファイル（各ファイルと同じディレクトリ）
├── vite.config.ts                # Vitest設定
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
npm run test

# ウォッチモード
npm run test:watch

# カバレッジレポート
npm run test:coverage
```

#### テストのベストプラクティス

- **React Testing Library**: ユーザーの視点でコンポーネントをテスト
- **@testing-library/jest-dom**: マッチャー拡張（`toBeInTheDocument` など）
- **APIルートのテスト**: `getInitialStreamData` と `__TEST_ONLY_setStreamData` を活用
- **設定ファイルのテスト**: YAMLファイルは `fs` + `js-yaml` でパース・検証

### Linting

```bash
# Lintチェック
npm run lint

# 自動修正
npm run lint -- --fix
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
npm run lint -- --fix
```

### よくあるESLintエラーと対応

#### 1. `import/order`

- **原因**: インポート文の順序やグループ分けが規則に違反
- **対応**: `npm run lint -- --fix` で自動修正

#### 2. `react-hooks/exhaustive-deps`

- **原因**: フックの依存関係配列に不足がある
- **対応**:
  - 提案に従って依存関係を追加
  - 関数は `useCallback` でラップして安定化
  - 正当な理由がある場合は `// eslint-disable-next-line` でコメント付きで無効化

#### 3. `react-hooks/set-state-in-effect`

- **原因**: `useEffect` 内で直接 `setState` を呼び出している
- **対応**: アニメーション起動など正当な理由がある場合はコメント付きで無効化
- **該当箇所**: `ScoreDisplay.tsx`, `BurndownChart.tsx`, エフェクトコンポーネント

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

- `npm run build` でビルドエラーを確認
- `tsconfig.json` の設定を確認

## 参考リンク

- [Next.js App Router ドキュメント](https://nextjs.org/docs/app)
- [Material-UI ドキュメント](https://mui.com/material-ui/getting-started/)
- [Motion ドキュメント](https://motion.dev/docs)
- [Vitest ドキュメント](https://vitest.dev/)
- [Web Speech API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API)

---

このガイドを参考に、効率的にプロジェクトの開発を進めてください。
