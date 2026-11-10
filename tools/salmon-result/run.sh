#!/usr/bin/env bash
# サーモンランのリザルトの取り込みスクリプトを一発で起動する。
# どのディレクトリからでも実行可能。初回は venv の作成と依存のインストールも行う。
#
#   tools/salmon-result/run.sh                       # 起動（コントロールパネルの依頼を待つ）
#   tools/salmon-result/run.sh --read <キャプチャ>   # 保存したキャプチャを読み取って表示（記録しない）
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"

export SALMON_API_BASE="${SALMON_API_BASE:-http://localhost:3000/}"

# インストール完了時にだけマーカーを作る（途中で失敗しても次回やり直せるように）。
# requirements.txt が更新された場合も再インストールする
SETUP_MARKER="$DIR/.venv/.setup-complete"
if [ ! -f "$SETUP_MARKER" ] || [ "$DIR/requirements.txt" -nt "$SETUP_MARKER" ]; then
    echo "[salmon-result] セットアップ: venv を作成して依存をインストールします"
    [ -x "$DIR/.venv/bin/python" ] || python3 -m venv "$DIR/.venv"
    "$DIR/.venv/bin/pip" install -q -r "$DIR/requirements.txt"
    touch "$SETUP_MARKER"
fi

if [ "$#" -eq 0 ] && ! curl -s -o /dev/null --max-time 2 "${SALMON_API_BASE}api/salmon/import"; then
    echo "[salmon-result] 警告: ${SALMON_API_BASE} に接続できません。Next.js アプリ（pnpm dev / docker-compose up）が起動しているか確認してください" >&2
fi

exec "$DIR/.venv/bin/python" "$DIR/salmon_result.py" "$@"
