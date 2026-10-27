#!/usr/bin/env bash
# 字幕用の文字起こしを一発で起動するスクリプト。
# どのディレクトリからでも実行可能。初回は venv の作成と依存のインストールも行う。
#
#   tools/caption-stt/run.sh                  # 起動
#   tools/caption-stt/run.sh --list-devices   # マイク一覧を表示
#   MIC_DEVICE=6 tools/caption-stt/run.sh     # マイクを変更して起動
set -euo pipefail

cd "$(dirname "$0")"

# マイクはデバイス名で指定する（番号は機器の抜き差しで変わることがあるため）
export MIC_DEVICE="${MIC_DEVICE:-MIC (BRIDGE CAST ONE)}"
export CAPTION_URL="${CAPTION_URL:-http://localhost:3000/api/caption}"

if [ ! -x .venv/bin/python ]; then
    echo "[caption-stt] 初回セットアップ: venv を作成して依存をインストールします"
    python3 -m venv .venv
    .venv/bin/pip install -q -r requirements.txt
fi

if [ "$#" -eq 0 ] && ! curl -s -o /dev/null --max-time 2 "$CAPTION_URL"; then
    echo "[caption-stt] 警告: $CAPTION_URL に接続できません。Next.js アプリ（pnpm dev / docker-compose up）が起動しているか確認してください" >&2
fi

exec .venv/bin/python caption_stt.py "$@"
