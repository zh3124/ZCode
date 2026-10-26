#!/usr/bin/env bash
# ZCode 命令行版 Docker 构建入口（薄封装：只做环境检查、参数解析与 docker 调用；
# 构建、打包与产物命名的实际逻辑全部在 Dockerfile.zcode 内）。
#
# 用法（在仓库根目录执行）：
#   scripts/zcode-docker.sh build [镜像名:标签 ...]  先导出官方发行包到 dist/zcode/，再构建 B/S 运行镜像
#                                                    （默认镜像标签 zcode-web:<版本> 和 zcode-web:latest）
#   scripts/zcode-docker.sh export                   仅导出官方发行包到 dist/zcode/（tar.gz、sha256、install.sh）
#
# 构建完成后宿主机 dist/zcode/ 即为可用发布文件（与 pnpm build:zcode 产物一致），
# 在装有 Node.js 24.14.0 的宿主机解压即可运行，用法见 docs/zcode-docker-web-guide.md 第 6 节。
#
# 可选环境变量（透传为 build-arg，含义见 Dockerfile.zcode 与 docs/zcode-docker-web-guide.md）：
#   ZCODE_DIST_BASE_URL  发行包下载根地址（写入 install.sh/latest.json 元数据，默认占位地址）
#   ZCODE_ENV            test | production（默认 production，与官方发布一致）
#   NPM_REGISTRY         非空时覆盖依赖下载源
#   ELECTRON_MIRROR      electron 二进制镜像地址
#   NODE_BUILD_IMAGE     builder 基础镜像（Docker Hub 不可达时用镜像源前缀覆盖）
#   NODE_RUNTIME_IMAGE   运行镜像基础镜像（同上）
set -euo pipefail

cd "$(dirname "$0")/.."

usage() {
  sed -n '2,14p' "$0" | sed 's/^# \{0,1\}//'
  exit 2
}

command -v docker >/dev/null || { echo "error: 未安装 docker" >&2; exit 1; }
docker buildx version >/dev/null 2>&1 || { echo "error: 缺少 buildx（本流程依赖 BuildKit）" >&2; exit 1; }

export DOCKER_BUILDKIT=1

version="$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' package.json | head -n 1)"
[ -n "$version" ] || { echo "error: 无法从 package.json 解析版本号" >&2; exit 1; }

# 提示（不拦截）：产物与源码提交的对应关系依赖 git 记录，脏工作区会破坏可追溯性。
if [ -n "$(git status --porcelain 2>/dev/null)" ]; then
  echo "warning: 工作区存在未提交改动，构建产物无法与 git 提交严格对应" >&2
fi

build_args=(
  --build-arg "ZCODE_DIST_BASE_URL=${ZCODE_DIST_BASE_URL:-https://downloads.example.com/zcode/}"
  --build-arg "ZCODE_ENV=${ZCODE_ENV:-production}"
)
[ -n "${NPM_REGISTRY:-}" ] && build_args+=("--build-arg" "NPM_REGISTRY=${NPM_REGISTRY}")
[ -n "${ELECTRON_MIRROR:-}" ] && build_args+=("--build-arg" "ELECTRON_MIRROR=${ELECTRON_MIRROR}")
[ -n "${NODE_BUILD_IMAGE:-}" ] && build_args+=("--build-arg" "NODE_BUILD_IMAGE=${NODE_BUILD_IMAGE}")
[ -n "${NODE_RUNTIME_IMAGE:-}" ] && build_args+=("--build-arg" "NODE_RUNTIME_IMAGE=${NODE_RUNTIME_IMAGE}")

do_export() {
  echo "[zcode-docker] 导出官方发行包到 dist/zcode/"
  docker build -f Dockerfile.zcode --target export \
    "${build_args[@]}" \
    --output type=local,dest=dist/zcode .
  echo "[zcode-docker] 发行包完成：dist/zcode/releases/${version}/zcode-${version}.tar.gz"
}

do_build() {
  local args=(--tag "zcode-web:${version}" --tag "zcode-web:latest")
  if [ "$#" -gt 0 ]; then
    args=()
    local tag
    for tag in "$@"; do args+=(--tag "$tag"); done
  fi
  echo "[zcode-docker] 构建 B/S 运行镜像：${args[*]#--tag }"
  docker build -f Dockerfile.zcode --target runtime \
    "${build_args[@]}" \
    "${args[@]}" .
  echo "[zcode-docker] 完成。运行示例：docker run --rm -p 3030:3030 zcode-web:${version}"
}

case "${1:-}" in
  build) do_export; shift; do_build "$@" ;;
  export) do_export ;;
  ""|-h|--help|help) usage ;;
  *) echo "error: 未知子命令 \"$1\"" >&2; usage ;;
esac
