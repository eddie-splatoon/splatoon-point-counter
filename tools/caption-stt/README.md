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

## 字幕にしないもの

誤認識を配信に出さないよう、次のものは字幕にしません。除外したものは `[caption-stt] (除外: 理由) 文` とログに出ます。

- Whisper の信頼度が低いもの（`MIN_AVG_LOGPROB` / `MAX_NO_SPEECH_PROB` / `MAX_COMPRESSION_RATIO`）
- キリル文字・ハングルなど日本語以外の文字、英字 3 文字以上の単語（`WAVE` など `ALLOWED_LATIN` は除く）を含むもの
- 「あ」「えっ」「はい」などの相づち（`FILLERS`）と 1 文字以下のもの。0.4 秒未満の発話はそもそも文字起こししない

しきい値や一覧は `caption_stt.py` の先頭の定数です。ログを見て調整してください。スプラ用語の聞き間違いが多いときは `GLOSSARY` に言葉を足します。

## テロップを出す

発話が実況テロップのプリセット（コントロールパネルの「テロップ」タブ）に近いと、字幕の代わりにそのテロップを出します（例: 「ナイス！」と言うと「ナイス!」のテロップ）。

- 表記ゆれ（カタカナとひらがな・記号・長音）は無視して比べ、少しの聞き間違いも似ていれば一致とみなします。2 文字以下のテロップは完全に一致したときだけ出します
- 配信者の声と重ならないよう、プリセットで読み上げを ON にしていても読み上げません
- 同じテロップは 10 秒間は出し直しません
- プリセットは 30 秒ごとに取り直します。テロップの文は Whisper にも渡すので、よく言う言葉ほど正しく聞き取られやすくなります
- 無効にするときは `TELOP_MATCH=off pnpm caption`

## エフェクトを出す

「ナイス」「ありがとう」「よっしゃ」「やべぇ」などを含む発話で、スコア表示オーバーレイ（`/obs-overlay`）にエフェクトを出します。字幕・テロップとは別に出します（「ナイス！」ならテロップとエフェクトの両方）。

| 言葉 | エフェクト |
|---|---|
| ナイス | ⭐ STAR |
| ありがとう | 💖 LOVE |
| よっしゃ | ✨ SPARKLE |
| やべ / やば | 🫧 BUBBLE |

言葉を変えるときは `caption_stt.py` の `EFFECT_KEYWORDS` を編集します。無効にするときは `EFFECT_MATCH=off pnpm caption`。

## モデルを比べる

同じ音声で複数のモデル（や、しきい値・用語集を変えた後の結果）を比べられます。

1. 発話を保存しながら配信する（リポジトリのルートで実行。`data/` は Git 管理外）

   ```bash
   CAPTION_SAVE_DIR=data/caption-samples pnpm caption
   ```

   発話ごとに `.wav` と、そのときの文字起こし結果の `.txt` が保存されます。不要になったら消してください。

2. 保存した音声をモデルごとに文字起こしして並べる

   ```bash
   pnpm caption --compare data/caption-samples --models mlx-community/whisper-large-v3-turbo,mlx-community/whisper-large-v3-mlx
   ```

候補のモデル（初回はダウンロードに時間がかかります）:

| モデル | 特徴 |
|---|---|
| `mlx-community/whisper-large-v3-turbo` | 既定。速い |
| `mlx-community/whisper-large-v3-mlx` | turbo でない版。遅いが精度は高め |
| kotoba-whisper の MLX 版 | 日本語特化（[kotoba-tech/kotoba-whisper](https://huggingface.co/kotoba-tech)）。Hugging Face で MLX 形式に変換済みのものを探して指定する |

良かったモデルは `WHISPER_MODEL` で指定して使います。

## 環境変数

| 変数 | 既定値 | 説明 |
|---|---|---|
| `CAPTION_URL` | `http://localhost:3000/api/caption` | 字幕の送信先 |
| `WHISPER_MODEL` | `mlx-community/whisper-large-v3-turbo` | 使用する MLX 形式の Whisper モデル（Hugging Face のリポジトリ名） |
| `TELOP_URL` | `CAPTION_URL` と同じホストの `/api/telop` | テロップのプリセットの取得先・テロップの送信先 |
| `TELOP_MATCH` | （有効） | `off` で発話からテロップを出さない |
| `EFFECT_URL` | `CAPTION_URL` と同じホストの `/api/stream-data` | エフェクトの送信先 |
| `EFFECT_MATCH` | （有効） | `off` で話した言葉からエフェクトを出さない |
| `CAPTION_SAVE_DIR` | （保存しない） | 発話の音声と文字起こし結果を保存するディレクトリ（モデルの比較用） |
| `MIC_DEVICE` | `MIC (BRIDGE CAST ONE)`（`run.sh` 経由の場合。直接実行時はシステムの既定入力） | `--list-devices` で表示される番号、またはデバイス名の一部 |

## テスト

```bash
cd tools/caption-stt
.venv/bin/pip install -r requirements-dev.txt
.venv/bin/python -m pytest
```
