# caption-stt

マイク音声をリアルタイムに文字起こしし、字幕オーバーレイ（`/caption-overlay`）へ送信するスクリプトです。

- 文字起こし: [mlx-whisper](https://github.com/ml-explore/mlx-examples/tree/main/whisper)（Apple Silicon 向け Whisper）
- 発話区切り: [Silero VAD](https://github.com/snakers4/silero-vad)

Metal (GPU) を使うため、Docker ではなく **Apple Silicon Mac 上でネイティブに実行** してください。

## 使い方

1. Next.js アプリを起動する（`pnpm dev` または `docker-compose up`）
2. OBS にブラウザソースとして `http://localhost:3000/caption-overlay` を追加する
3. リポジトリのルートで文字起こしを開始する（`Ctrl+C` で終了）

   ```bash
   pnpm caption
   ```

   `tools/caption-stt/run.sh` を直接実行しても同じです（どのディレクトリからでも実行できます）。

話し終えてから 1〜2 秒程度で字幕が表示されます。

初回実行時は venv の作成と依存のインストールが自動で行われ、Whisper モデル（約 1.5GB）が Hugging Face から `~/.cache/huggingface` にダウンロードされます。

### マイクを変更する

既定のマイクは `MIC (BRIDGE CAST ONE)` です。別のマイクを使う場合は一覧を確認し、`MIC_DEVICE` で指定します。

```bash
pnpm caption --list-devices
MIC_DEVICE="デバイス名の一部" pnpm caption
```

## 環境変数

| 変数 | 既定値 | 説明 |
|---|---|---|
| `CAPTION_URL` | `http://localhost:3000/api/caption` | 字幕の送信先 |
| `WHISPER_MODEL` | `mlx-community/whisper-large-v3-turbo` | 使用する MLX 形式の Whisper モデル（Hugging Face のリポジトリ名） |
| `MIC_DEVICE` | `MIC (BRIDGE CAST ONE)`（`run.sh` 経由の場合。直接実行時はシステムの既定入力） | `--list-devices` で表示される番号、またはデバイス名の一部 |

## テスト

```bash
cd tools/caption-stt
.venv/bin/pip install -r requirements-dev.txt
.venv/bin/python -m pytest
```
