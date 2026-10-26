const packageDirName = "zcode";

export function installScriptSource(baseUrl) {
  return `#!/usr/bin/env sh
set -eu

# 本地安装兜底：未显式指定下载根地址、且 install.sh 与 latest.json 同目录（例如直接在
# 构建产物 dist 目录里执行 bash install.sh）时，直接读取本地文件，避免默认占位地址
# 不可达导致 "Could not resolve host" 安装失败。curl 原生支持 file:// 协议。
SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
if [ -z "\${ZCODE_DIST_BASE_URL:-}" ] && [ -f "$SCRIPT_DIR/latest.json" ]; then
  BASE_URL="file://$SCRIPT_DIR"
else
  BASE_URL="\${ZCODE_DIST_BASE_URL:-${baseUrl}}"
fi
INSTALL_DIR="\${ZCODE_DIST_HOME:-$HOME/.zcode/runtime}"
BIN_DIR="\${ZCODE_DIST_BIN_DIR:-$HOME/.local/bin}"

need_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "zcode install requires $1" >&2
    exit 1
  fi
}

need_cmd node
need_cmd curl
need_cmd tar

LATEST_JSON="$(curl -fsSL "\${BASE_URL%/}/latest.json")"
VERSION="$(printf '%s' "$LATEST_JSON" | node -e "let data='';process.stdin.on('data',c=>data+=c);process.stdin.on('end',()=>process.stdout.write(JSON.parse(data).version))")"
TARBALL="$(printf '%s' "$LATEST_JSON" | node -e "let data='';process.stdin.on('data',c=>data+=c);process.stdin.on('end',()=>process.stdout.write(JSON.parse(data).tarball))")"

TMP_DIR="$(mktemp -d)"
cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

ARCHIVE="$TMP_DIR/$TARBALL"
curl -fL "\${BASE_URL%/}/releases/$VERSION/$TARBALL" -o "$ARCHIVE"

mkdir -p "$INSTALL_DIR/releases" "$BIN_DIR"
TARGET="$INSTALL_DIR/releases/$VERSION"
rm -rf "$TARGET.new"
mkdir -p "$TARGET.new"
tar -xzf "$ARCHIVE" -C "$TARGET.new"
rm -rf "$TARGET"
mv "$TARGET.new/${packageDirName}" "$TARGET"
rm -rf "$TARGET.new"
ln -sfn "$TARGET" "$INSTALL_DIR/current"

cat > "$BIN_DIR/zcode" <<SH
#!/usr/bin/env sh
exec node "$INSTALL_DIR/current/bin/zcode.mjs" "\\$@"
SH
chmod +x "$BIN_DIR/zcode"

echo "ZCode $VERSION installed."
echo "Run: zcode (TUI) or zcode --web (Web)"
case ":$PATH:" in
  *":$BIN_DIR:"*) ;;
  *) echo "Note: $BIN_DIR is not in PATH." ;;
esac
`;
}
