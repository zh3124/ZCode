#!/bin/sh
# ZCode 命令行版 B/S（--web）容器入口脚本。
# 只做环境变量到 `zcode --web` 参数的映射与透传，不承载任何业务状态。
#
# 以下 ZCODE_WEB_* 变量由本镜像入口脚本消费（Docker 习惯的配置通道），
# 不是 CLI 产品的运行时环境变量；产品自身配置仍通过 Web 界面与 /data 下的数据文件管理：
#   ZCODE_WEB_HOST       监听地址，默认 0.0.0.0（容器内必须监听非回环地址，端口映射才能访问）
#   ZCODE_WEB_PORT       监听端口，默认 3030
#   ZCODE_WEB_WORKSPACE  默认工作区，默认 /workspace
#   ZCODE_WEB_TOKEN      固定访问令牌；未设置且未关闭时由 zcode 自动生成并打印在启动日志
#   ZCODE_WEB_NO_TOKEN   设为 1 关闭令牌认证（仅建议在隔离可信网络使用）
#
# docker run 末尾追加的参数原样透传给 zcode --web；同一选项后出现者优先。
set -e

set -- --port "${ZCODE_WEB_PORT:-3030}" --workspace "${ZCODE_WEB_WORKSPACE:-/workspace}" "$@"
if [ -n "${ZCODE_WEB_TOKEN:-}" ]; then
  set -- --token "$ZCODE_WEB_TOKEN" "$@"
elif [ "${ZCODE_WEB_NO_TOKEN:-0}" = "1" ]; then
  set -- --no-token "$@"
fi

exec node /opt/zcode/bin/zcode.mjs --web --host "${ZCODE_WEB_HOST:-0.0.0.0}" --no-open "$@"
