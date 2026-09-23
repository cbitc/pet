# 变更日志

记录用户可见的行为变更：当前进行的改动放在 `[Unreleased]`，条目链接过程记录
（`docs/issues/NNNN-slug.md`）。规范见 [docs/conventions.md](docs/conventions.md) §8。

## [Unreleased]

### Added

- 提交信息门禁（commitlint）与分支校验 CI（[0006](docs/issues/0006-commit-branch-change-conventions.md)）

## [0.1.0] - 2026-09-23

首个可用基线（目标 tag `v0.1.0`）：Electron 透明置顶窗 + Live2D 形象 + 可插拔大脑的桌宠前端。

### Added

- **领域层**：宠物聚合根与六个端口（舞台 / 桌面 / 心智 / 对话 / 偏好），领域纯净性由测试守护
- **运行时可插拔大脑**：主进程 WebSocket 网关（指数退避重连）+ 内置 Mock 大脑全链路联调
- **形象层**：PixiJS + Live2D（Cubism 4），形象清单驱动的情绪映射，缺资产时降级为占位躯体
- **桌面交互**：整屏透明窗 + 动态点击穿透、拖拽挪窝（位置持久化）、点击聊天、口型同步
- **对话界面**：流式气泡（追赶式打字机）、输入条、连接状态角标
- **配置与外壳**：JSON 配置持久化、托盘菜单、设置页、开机自启、`pet://` 资产协议
- **诊断与自检**：白屏 / 纹理 GC 排查工具链、三层冒烟（含透明窗白屏回归）
- **工程护栏**：Prettier / ESLint（类型感知）/ husky + lint-staged / CI / 覆盖率门槛
  （[0005](docs/issues/0005-engineering-tooling.md)）

### Changed

- 边界解析统一为 zod schema，分支统一为 ts-pattern 穷尽匹配，通用原语下沉到 `shared/`
  （[0003](docs/issues/0003-declarative-refactor.md)、[0004](docs/issues/0004-shared-primitives.md)）

### Fixed

- 透明窗白屏：`premultipliedAlpha: false`（[0001](docs/issues/0001-white-screen.md)）
- Live2D 模型静置后消失：关闭 Pixi GC 并显式销毁纹理
  （[0002](docs/issues/0002-live2d-texture-gc.md)）
