#!/usr/bin/env bash
set -eu

ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
TEST_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/kitgen-run-env-test.XXXXXX")"
cleanup(){ rm -rf "$TEST_ROOT"; }
trap cleanup EXIT INT TERM

export HOME="$TEST_ROOT/home"
export KITGEN_HOME="$HOME/.kitgen"
WORKSPACE="$HOME/KitGen"
NODE_DIR="$KITGEN_HOME/tools/node/bin"
CODEX_DIR="$KITGEN_HOME/tools/node_modules/.bin"
STATE="$TEST_ROOT/node-env"
mkdir -p "$KITGEN_HOME" "$NODE_DIR" "$CODEX_DIR" "$WORKSPACE/.venv/bin" "$KITGEN_HOME/current/agent" "$KITGEN_HOME/current/app"

cat > "$NODE_DIR/node" <<EOF
#!/usr/bin/env bash
printf '%s\n' "\$PATH" > "$STATE"
printf '%s\n' "\$*" >> "$STATE"
EOF
cat > "$CODEX_DIR/codex" <<'EOF'
#!/usr/bin/env node
EOF
chmod +x "$NODE_DIR/node" "$CODEX_DIR/codex"
: > "$KITGEN_HOME/current/agent/server.mjs"

cat > "$KITGEN_HOME/config.env" <<EOF
KITGEN_HOME='$KITGEN_HOME'
KITGEN_SOURCE='$KITGEN_HOME/current'
KITGEN_WORKSPACE='$WORKSPACE'
KITGEN_PORT='8765'
KITGEN_ORIGIN='http://127.0.0.1:8765'
KITGEN_NODE='$NODE_DIR/node'
KITGEN_CODEX_BIN='$CODEX_DIR/codex'
NODE_PATH='$KITGEN_HOME/tools/node_modules'
EOF

PATH="/usr/bin:/bin:/usr/sbin:/sbin" "$ROOT/runtime/bin/kitgen" run

expected_prefix="$WORKSPACE/.venv/bin:$NODE_DIR:$CODEX_DIR:"
actual_path="$(sed -n '1p' "$STATE")"
case "$actual_path" in
  "$expected_prefix"*) ;;
  *)
    echo "kitgen run did not expose private Node and Codex to child processes" >&2
    printf 'expected PATH prefix: %s\nactual PATH: %s\n' "$expected_prefix" "$actual_path" >&2
    exit 1
    ;;
esac

echo "kitgen-run-env: private Node and Codex are available to child processes"

# ─────────────────────────────────────────────────────────────────────────────
# HỒI QUY 14/08 — config.env trỏ vào `.../@openai/codex/bin/codex.js`.
#
# PATH của agent dựng bằng `dirname "$CODEX_BIN"`, engine gọi `codex` TRẦN. Với giá trị
# trên, thư mục đưa vào PATH không có file nào tên `codex` ⇒ rc=127 cho MỌI job và UI
# báo "chạy xong nhưng ảnh không được ghi". Hỏng 100% lượt gen trên máy chủ chủ sản phẩm.
#
# Ca này dùng CHÍNH giá trị đã gây hỏng và đo thứ duy nhất có ý nghĩa: sau khi `kitgen
# run` dựng PATH, gõ `codex` trần có chạy được không.
PKG_DIR="$TEST_ROOT/fnm/lib/node_modules/@openai/codex/bin"
mkdir -p "$PKG_DIR"
cat > "$PKG_DIR/codex.js" <<'EOF'
#!/usr/bin/env node
EOF
chmod +x "$PKG_DIR/codex.js"

cat > "$KITGEN_HOME/config.env" <<EOF
KITGEN_HOME='$KITGEN_HOME'
KITGEN_SOURCE='$KITGEN_HOME/current'
KITGEN_WORKSPACE='$WORKSPACE'
KITGEN_PORT='8765'
KITGEN_ORIGIN='http://127.0.0.1:8765'
KITGEN_NODE='$NODE_DIR/node'
KITGEN_CODEX_BIN='$PKG_DIR/codex.js'
NODE_PATH='$KITGEN_HOME/tools/node_modules'
EOF

PATH="/usr/bin:/bin:/usr/sbin:/sbin" "$ROOT/runtime/bin/kitgen" run
child_path="$(sed -n '1p' "$STATE")"
found=""
IFS=: read -r -a path_parts <<< "$child_path"
for p in "${path_parts[@]}"; do
  [ -x "$p/codex" ] || continue
  found="$p/codex"
  break
done
if [ -z "$found" ]; then
  echo "kitgen run left a PATH where a bare 'codex' call cannot resolve (rc=127 regression)" >&2
  printf 'CODEX_BIN was: %s\nchild PATH: %s\n' "$PKG_DIR/codex.js" "$child_path" >&2
  exit 1
fi
echo "kitgen-run-env: a bare 'codex' resolves even when config.env points at codex.js ($found)"
