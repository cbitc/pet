# 0003 · 声明式重构：边界解析、穷尽分支、原语收敛

> 状态：已关闭（已落地） · 类型：重构 · 日期：2026-09-23 · 关联：[0004](0004-shared-primitives.md)

---

## 1. 背景与问题

约 3000 行的前端里存在大量「同一件事写了多遍」的样板与命令式代码：

- **手写解析/校验**：`poseFrom` / `preferencesFrom` / `defineAppearance` / `sanitizeConfig` /
  `toReplyMessage` 各自用 `typeof`、逐字段 clamp、`Object.entries` 过滤，边界值散落 3 处；
- **手写 `switch` 分发**：运行时的事件/手势/回话三处 switch，新增分支漏处理不会报错；
- **重复小工具**：`clamp` 有 3 份，矩形命中判定有 3 份（padding 还不一致：12 / 6）；
- **重复窗口参数**：安全三件套在 4 处、诊断 HTML 在 2 处各写一遍。

目标：把「数据长什么样、坏值怎么办」写成声明式，把「按类型分发」变成穷尽匹配，
把重复工具收敛到单点。

## 2. 目标与非目标

- **目标**：削掉上述样板；新增领域事件/手势/协议消息时漏处理要**编译期报错**；
  改边界值只需改一处。
- **非目标**：不引入前端框架；不替换 `deepMerge` / `DeepPartial`；不重写模拟大脑；
  不改变既有的业务行为（坏数据回退语义保持不变）。

## 3. 验收标准

- [x] `npm run typecheck` 通过（双工程）
- [x] `npm test` 通过，且解析/回退行为与重构前一致（新增 `tests/contracts/schemas.test.ts`）
- [x] `npm run build` 通过（zod / ts-pattern 在 main / preload / renderer 均可打包）
- [x] 领域纯净性守护继续通过（domain 不引入 zod）
- [x] 事件/手势/回话的 `match(...).exhaustive()` 覆盖全部判别分支

## 4. 方案

| 步骤 | 做法 | 主要落点 |
|---|---|---|
| ① 原语收敛 | 新增几何/数值模块，`clamp` / `rectContains` 各留一份 | `domain/geometry.ts`（后被 0004 提升为 `shared/`） |
| ② 边界解析 | 引入 **zod**，`unknown → 类型` 全部改为 schema；默认值与坏值回退写在 schema 上 | 新增 `contracts/schemas.ts`；改写 `contracts/app-config.ts`、`adapters/bridge/*`、`adapters/shell/asset-catalog.ts` |
| ③ 穷尽分支 | 引入 **ts-pattern**，`match(...).exhaustive()` 替换手写 switch | `app/pet-runtime.ts`、`adapters/bridge/ipc-brain-channel.ts` |
| ④ 类型去重 | `IPC.brainStatus` 用 `BrainStatus`；`EmotionName` / `EMOTIONS` 收敛到领域 | `contracts/ipc.ts`、`contracts/wire-protocol.ts`、`adapters/brain/brain-link.ts` |
| ⑤ 窗口/诊断收敛 | 安全三件套 + 透明层参数抽预设；诊断 HTML 抽常量表 | 新增 `adapters/shell/window-presets.ts`、`diagnostic-pages.ts` |

## 5. 决策记录

| 决策 | 理由 | 备选（未采用） |
|---|---|---|
| zod 只放 `contracts/` 与 `adapters/`，`domain/` 不引入 | 保住「领域零技术依赖」的卖点与可读性；解析本就属于边界 | domain 内直接用 zod（依赖变重、纯度测试虽未禁止但不划算） |
| 用 ts-pattern 代替「类型映射表」 | 类型收窄更顺、无需 `as never`，`.exhaustive()` 直接给穷尽检查 | 零依赖的 `{ [E in Event['type']]: handler }` 映射表（可行但啰嗦） |
| 解析函数移出 domain，集中到 `contracts/schemas.ts` | 单一真相源；domain 只留类型与纯规则 | 保留 `defineAppearance` / `poseFrom` 在 domain 内净化 |
| 默认值由 schema 产出（`DEFAULT_CONFIG = AppConfigSchema.parse({})`） | 默认值与校验规则同处，改一处即可 | 保留手写 `sanitizeConfig` 逐字段 clamp |

## 6. 执行与结果

- 新增 `contracts/schemas.ts`（`parsePose` / `parseAppearanceSpec` / `parsePreferences` /
  `preferencesFromConfig` / `ModelManifestSchema` / `BrainInboundSchema`）。
- 测试从 57 → 64（新增 `tests/contracts/schemas.test.ts` 覆盖坏数据回退与默认值）。
- 文档同步：`docs/domain.md` 的规则出处、`docs/architecture.md` 的净化描述。
- 原语模块随后被 [0004](0004-shared-primitives.md) 提升到 `src/shared/`（本 issue 的 ① 是铺垫）。

## 7. 如何验证

```bash
npm run typecheck
npm test
npm run build
```

## 8. 关联

- 关键文件：`src/contracts/schemas.ts`、`src/app/pet-runtime.ts`、
  `src/adapters/shell/window-presets.ts`、`src/adapters/shell/diagnostic-pages.ts`
- 全局文档：[../architecture.md](../architecture.md)、[../conventions.md](../conventions.md)
