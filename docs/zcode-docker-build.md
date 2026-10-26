# ZCode Docker 构建操作手册（SOP）

面向**重复构建操作**的速查手册：环境要求、标准命令、常用变体、产物清单、故障速查。架构原理、B/S 运行细节与完整 FAQ 见 [ZCode 命令行版 Docker 构建与 B/S 运行指南](zcode-docker-web-guide.md)。

## 1. 前置条件（一次性确认）

| 项 | 要求 | 检查命令 |
| --- | --- | --- |
| 宿主 | x86_64 Linux（Ubuntu 等），磁盘 ≥ 20 GB | `uname -m && df -h .` |
| Docker | ≥ 23，含 BuildKit/buildx | `docker buildx version` |
| 权限 | 当前用户可执行 docker | `docker version` |
| 网络 | 能访问 npm registry、Debian 源、（可选）Docker Hub 或其镜像源 | `curl -sI https://registry.npmjs.org` |

宿主机**不需要** Node.js / pnpm——构建全部在容器内完成。

## 2. 标准构建（一条命令）

```bash
scripts/zcode-docker.sh build
```

本机网络环境（docker.io 不可达，经 daocloud 镜像源拉基础镜像）使用：

```bash
NODE_BUILD_IMAGE=docker.m.daocloud.io/library/node:24.14.0-bookworm \
NODE_RUNTIME_IMAGE=docker.m.daocloud.io/library/node:24.14.0-bookworm-slim \
scripts/zcode-docker.sh build
```

**产出**（构建完成后即可用）：

| 产物 | 位置 | 用途 |
| --- | --- | --- |
| 运行包 tar.gz | `dist/zcode/releases/<版本>/zcode-<版本>.tar.gz` | 宿主机/目标机部署（与官方 `pnpm build:zcode` 产物一致） |
| 校验摘要 | `dist/zcode/releases/<版本>/sha256.txt` | `sha256sum -c` 完整性校验 |
| 安装脚本 | `dist/zcode/install.sh` | 裸跑即装（自动识别同目录 latest.json 走本地） |
| B/S 镜像 | `zcode-web:<版本>` 与 `zcode-web:latest` | `docker run -d -p 3030:3030 ...` |

首次构建约 15–25 分钟；源码改动后的重建（缓存热）约 5–8 分钟。

## 3. 常用变体

```bash
# 仅导出发行包，不构建镜像
scripts/zcode-docker.sh export

# 自定义镜像标签（可多个）
scripts/zcode-docker.sh build my-registry/zcode-web:v1.16

# 连接测试环境（provider 与端点按 test 分流）
ZCODE_ENV=test scripts/zcode-docker.sh build

# 指定下载根地址（写入 install.sh/latest.json 元数据，默认占位地址）
ZCODE_DIST_BASE_URL=https://downloads.example.com/zcode/ scripts/zcode-docker.sh build

# npm 依赖走镜像源（网络受限时）
NPM_REGISTRY=https://registry.npmmirror.com scripts/zcode-docker.sh build
```

**构建参数速查**（环境变量或同名 build-arg）：

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `NODE_BUILD_IMAGE` | `node:24.14.0-bookworm` | builder 基础镜像（Docker Hub 不可达时覆盖为镜像源前缀） |
| `NODE_RUNTIME_IMAGE` | `node:24.14.0-bookworm-slim` | 运行镜像基础镜像（同上） |
| `ZCODE_ENV` | `production` | `test` / `production` 产品环境分流 |
| `ELECTRON_MIRROR` | npmmirror | 构建期 electron 依赖下载镜像 |
| `NPM_REGISTRY` | 仓库 `.npmrc` | 覆盖依赖下载源 |
| `ZCODE_DIST_BASE_URL` | 占位地址 | install.sh 元数据，发布到自建下载站时替换 |

**缓存**：三类 BuildKit 缓存卷跨次复用（`zcode-docker-pnpm-store` / `-electron-cache` / `-turbo-cache`）。磁盘紧张时 `docker builder prune` 清理（下次构建变慢）。

## 4. 部署与升级（三步）

```bash
# ① 停现有实例（找到进程 Ctrl+C 或按端口清理）
# ② 安装最新包（自动装到 ~/.zcode/runtime 并创建 ~/.local/bin/zcode）
bash dist/zcode/install.sh
# ③ 原参数重启，浏览器 Ctrl+Shift+R 强刷
zcode --web --host 0.0.0.0 --port <端口> --workspace <目录> --token <令牌>
```

## 5. 故障速查

| 现象 | 处理 |
| --- | --- |
| `failed to resolve source metadata for docker.io/...` 超时 | Docker Hub 不可达：按第 2 节加 `NODE_BUILD_IMAGE` / `NODE_RUNTIME_IMAGE` 镜像源前缀 |
| `Could not resolve host`（apt/pnpm 下载） | 检查宿主网络与代理；npm 加 `NPM_REGISTRY` |
| 构建中断/导出阶段偶发失败 | 直接重跑同一命令，编译层全部命中缓存，仅重试失败步骤 |
| 磁盘不足 | `docker system df` 查占用；`docker builder prune` 清构建缓存 |
| `install.sh` 本地安装报域名解析 | 确认在 `dist/zcode/` 目录内裸跑（自动走本地 file://），或 `ZCODE_DIST_BASE_URL` 显式指定 |
| 改了代码但页面行为没变 | 服务端升级后浏览器需 Ctrl+Shift+R；确认实例进程加载的是 `~/.zcode/runtime/current`（安装后重启） |

## 6. 构建流水线内部（了解即可）

```
scripts/zcode-docker.sh build
  ├─ docker build --target export   → dist/zcode/（官方 build:zcode 产物）
  └─ docker build --target runtime  → zcode-web:<版本> 镜像
        builder（node:24.14.0-bookworm）
          pnpm install --frozen-lockfile
          tsc -b packages/shared（+model-option-map）   ← 官方路径依赖的无 build 脚本根包
          pnpm build:zcode（CLI/TUI + server + web + 组包）
        runtime（node:24.14.0-bookworm-slim）
          解包发行 tar.gz + git/tini/健康检查 + 非 root 运行
```

完整参数语义、B/S 令牌与运行手册：[docs/zcode-docker-web-guide.md](zcode-docker-web-guide.md)。
