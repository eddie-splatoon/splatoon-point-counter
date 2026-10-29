# twitch-eventsub

Twitch のフォロワー数とフォロワー目標（クリエイターゴール）をリアルタイムに受信し、アプリの `/api/twitch` へ送信する常駐スクリプトです。チャットも受信し、初めてコメントした視聴者への挨拶と配信者自身のコメントを、アプリの読み上げキュー（`/api/speech`）へ送ります。

- 受信: [EventSub WebSocket](https://dev.twitch.tv/docs/eventsub/handling-websocket-events/)（`channel.follow` v2、`channel.goal.begin` / `progress` / `end`、`channel.chat.message` v1）
- 認証: [Device Code Flow](https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/#device-code-grant-flow)（リダイレクト用のサーバーや公開 URL が不要）
- 依存パッケージなし（Node 24 標準の `fetch` / `WebSocket` と型除去で動作）

フォロワーの名前はアプリに送信しません（人数と最後にフォローを受信した時刻のみ）。チャットの視聴者の名前は、挨拶の読み上げにだけ使います（ログ・ファイルには残しません）。

```mermaid
sequenceDiagram
    participant Script as twitch_eventsub.ts
    participant Twitch as Twitch (Helix / EventSub)
    participant API as /api/twitch
    participant Speech as /api/speech
    Script->>Twitch: 認証（初回のみブラウザで承認）
    Script->>Twitch: GET /channels/followers, /goals
    Script->>API: POST {followerTotal, goal, lastFollowAt}
    Script->>Twitch: EventSub WebSocket で購読
    Twitch-->>Script: フォロー / ゴール進捗の通知
    Script->>API: POST（通知ごと・60秒ごとの再同期）
    Twitch-->>Script: チャットの通知
    Script->>Speech: POST {text}（初コメの挨拶・配信者のコメント）
```

## 初回セットアップ

1. [Twitch Developer Console](https://dev.twitch.tv/console/apps) でアプリを登録する
   - **OAuth のリダイレクト URL**: `http://localhost`（Device Code Flow では使わないが入力必須）
   - **カテゴリー**: 任意（例: Broadcaster Suite）
   - **クライアントの種類**: **公開**（Public）
2. 登録したアプリの **クライアント ID** を、リポジトリのルートの `.env.local` に書く

   ```bash
   TWITCH_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   ```

## 使い方

1. Next.js アプリを起動する（`pnpm dev` または `docker-compose up`）
2. リポジトリのルートで起動する（`Ctrl+C` で終了）

   ```bash
   pnpm twitch
   ```

3. 初回は次のように表示されるので、ブラウザで URL を開き、コードを確認して **配信に使うアカウントで** 承認する

   ```
   [twitch] ブラウザで https://www.twitch.tv/activate?... を開き、コード ABCD-EFGH を確認して承認してください
   ```

承認後のトークンは `data/twitch-token.json`（Git 管理外・パーミッション 600）に保存され、次回以降は自動で再利用・更新されます。リフレッシュトークンが失効した場合（30 日間未使用など）は、再び承認を求められます。

`http://localhost:3000/api/twitch` を開くと、受信した内容を確認できます。

## 動作の詳細

- フォロー通知には総数が含まれないため、受信時は手元の値に 1 を加算し、60 秒ごとに Helix から総数を取り直して補正します（フォロー解除も定期同期で反映されます）
- 60 秒ごとの再同期では最新の状態を `/api/twitch` に送り直すため、Next.js を再起動しても 1 分以内に表示が戻ります
- WebSocket が切断された場合や keepalive が途絶えた場合は、待ち時間を伸ばしながら（最大 60 秒）再接続し、購読し直します。Twitch からの `session_reconnect` には購読を引き継いだまま接続先を切り替えます
- 購読が通信断や Twitch 側の一時的なエラー（5xx・429）で失敗した場合も、同じく再接続して購読し直します
- 購読が取り消された場合（アプリの連携解除など）や、再試行しても直らない理由（スコープ不足などの 4xx）で購読に失敗した場合は終了します
- 常駐中にトークンを更新できなくなった場合（リフレッシュトークンの失効など）は、ログに承認用のコードを表示して承認を待ちます

## チャットの読み上げ

アプリのコントロールパネル（「テロップ」タブの「読み上げ（VOICEVOX）」）で読み上げを有効にしているときだけ読み上げます（無効なら送信してもアプリ側で捨てられます）。

- **視聴者**: スクリプトを起動してから初めてコメントした人に「〇〇さん、いらっしゃい！」と表示名で挨拶します（名前は 20 文字まで。同じ文字が長く続くところは縮めます）。**コメント本文は読みません。** 挨拶済みかどうかはスクリプトのメモリにだけ持つので、スクリプトを起動し直すと、また挨拶します。読み上げが無効だったなどで挨拶を送れなかった人には、次のコメントで挨拶します
- **配信者自身**: コメント本文を読み上げます（100 文字まで）。`!` で始まるコマンドと、URL を含むコメントは読みません（全角で書かれたものも含む）
- **読み上げないアカウント**: Nightbot などのボットは、`.env.local` の `TWITCH_SPEECH_IGNORE` にログイン名をカンマ区切りで書くと除外できます（例: `TWITCH_SPEECH_IGNORE=nightbot,streamelements`）
- 共有チャット（Shared Chat）で、ほかのチャンネルから届いたコメントは読みません
- 視聴者の名前やコメントは、ログ・ファイルに残しません

### 以前から使っている場合（再承認）

チャットを読むためにスコープ `user:read:chat` を追加しました。保存済みのトークンにはこのスコープが無いため、更新後に初めて `pnpm twitch` を起動したときだけ、ブラウザでの承認をもう一度求められます。

## 環境変数

| 変数 | 既定値 | 説明 |
|---|---|---|
| `TWITCH_CLIENT_ID` | （必須） | Twitch Developer Console で登録したアプリのクライアント ID |
| `TWITCH_API_URL` | `http://localhost:3000/api/twitch` | 送信先 |
| `TWITCH_TOKEN_PATH` | `data/twitch-token.json` | トークンの保存先 |
| `TWITCH_SPEECH_API_URL` | `TWITCH_API_URL` と同じホストの `/api/speech` | 読み上げキューの送信先 |
| `TWITCH_SPEECH_IGNORE` | （なし） | 読み上げないアカウントのログイン名（カンマ区切り） |

## テスト

アプリ本体と同じく Vitest で実行されます（CI 対象）。

```bash
pnpm exec vitest run tools/twitch-eventsub
```
