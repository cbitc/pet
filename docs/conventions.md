# 项目规范

> 这份文档是「什么算合格」的规则集：代码怎么写、边界怎么处理、测试怎么验收、文档放哪里。
> 「业务是什么」见 [domain.md](domain.md)；「技术怎么落地」见 [architecture.md](architecture.md)；
> 「做过哪些事」见 [issues/](issues/README.md)。
>
> 规则中**能自动化的部分已经自动化**（类型检查、领域纯净性测试、单元测试、冒烟），
> 阅读时以本文为准，执行时以命令为准。

---

## 1. 分层与依赖方向

```
entries/    组装根：唯一允许「什么都知道」的地方
    │
    ▼
adapters/   技术：Electron / Pixi / DOM / WebSocket / 磁盘
    │
    ▼
app/        用例编排：只对着端口说话
    │
    ▼
domain/     业务：纯逻辑，只依赖自己与 shared
    │
    ▼
shared/     通用原语：零 import 最底层（clamp / 命中判定）
```

| 层           | 可以依赖                                       | 禁止                                        |
| ------------ | ---------------------------------------------- | ------------------------------------------- |
| `shared/`    | 无（零 import）                                | 依赖任何模块                                |
| `domain/`    | `domain/` 内部、`shared/`                      | electron / pixi / DOM / ws / node / **zod** |
| `app/`       | `domain/`（经端口）、`shared/`                 | 技术栈、DOM                                 |
| `adapters/`  | `domain/`、`contracts/`、`shared/`、各自技术库 | 被上层反向依赖                              |
| `entries/`   | 全部（组装）                                   | 把业务规则写在这里                          |
| `contracts/` | `domain/` 类型与常量、`shared/`、`zod`         | 被 `domain/` 依赖                           |

- **依赖单向且无环**：`entries → adapters → app → domain → shared`。
  领域绝不反向依赖外层，适配器之间不互相依赖。
- **分层纯净性**由 `tests/domain/purity.test.ts` 守护：`domain/` 只允许 import 领域内部与
  `../shared/`；`shared/` 必须零 import；`domain/` 一旦使用 `window.` / `document.` /
  `setTimeout` / `process.` 立即失败。
- **`shared/` 的归属判据**：把「桌宠」业务整个换掉，这段代码依然成立（如 `clamp`、命中判定）；
  与宠物有关的规则一律留在 `domain/`。
- **`contracts/` 是边界层**：跨进程、跨项目、来自磁盘的数据形状都放这里；
  zod 只允许出现在 `contracts/` 与 `adapters/`，**领域层不引入 zod**。

## 2. 代码规范

### 2.1 声明式优先，语义自足

- **解析**：`unknown → 类型` 一律用 zod schema，集中在 `contracts/schemas.ts`。
  禁止手写 `typeof` 校验、`Object.entries` 过滤、逐字段 clamp；默认值与坏值回退写在
  schema 上（`.catch()` / `.transform()`），调用点直接 `parse`。
- **分支**：领域事件、手势、协议消息这类判别联合用 `ts-pattern` 的
  `match(...).exhaustive()`；**禁止手写 switch 兜底**——新增分支漏处理必须编译期报错。
- **几何/数值**：`clamp`、`rectContains` 等只留一份，放 `src/shared/geometry.ts`
  （零依赖最底层，各层共用）；禁止在适配器里复制实现。
- **命名与常量**：魔法数字必须命名并注释「为什么是这个值」（如 `HIT_PADDING_PX`、
  `TYPE_TICK_MS`）；阈值、节奏、上限放文件顶部集中管理。
- **注释写「为什么」**：代码说明「做了什么」，注释说明「为什么这么做、不做会怎样」。
  涉及踩过的坑，直接指向对应 issue 文档（如 `docs/issues/0002-…`）。

### 2.2 领域层

- 行为方法**只返回领域事件**，不做副作用（不画图、不写盘、不发网络）。
- 业务规则只写在 `domain/`，不寄居在适配器或界面控制器里。
- 新增或修改规则必须同步 `tests/domain/` 用例；不变量清单见 [domain.md](domain.md) §4。
- 端口（`domain/ports.ts`）只保留**当前有真实实现**的能力，不为想象中的未来建端口。

### 2.3 适配器层

- **降级不崩溃**：缺资产、坏数据、断线都要有兜底路径，并给出「给人看的」原因。
- **渲染栈隔离**：Live2D / Pixi 代码只允许出现在 `adapters/presentation/stage/`。
- **能力最小化**：渲染进程无 Node、无直连网络；危险能力经 preload 白名单收口。
- `try/catch` 吞异常必须注释「为什么可以吞」，否则视为缺陷。

## 3. 新增依赖的门槛

引入第三方库前先回答：**它替换了多少手写样板？** 满足其一才引：

1. 消除一整类样板（如 zod 之于解析、ts-pattern 之于穷尽分支）；
2. 有明确的安全/正确性收益（如 `ws`）。

引库后必须同步更新 [architecture.md](architecture.md) 的技术栈表，并把被替换的手写实现删干净
（不要留下两套并存）。

## 4. 测试与验收

| 改动面                   | 至少跑                                                              |
| ------------------------ | ------------------------------------------------------------------- |
| 任何改动                 | `npm run check`（typecheck + lint + format + docs + test 一次跑完） |
| 领域规则 / 解析 / 运行时 | `npm test`（覆盖率 `npm run test:coverage`）                        |
| 壳、渲染、窗口、交互     | `npm run smoke`（含透明区白屏回归）                                 |
| 打包配置                 | `npm run build`（必要时 `dist:win`）                                |

- 领域规则用例放 `tests/domain/`；边界解析用例放 `tests/contracts/`；
  运行时编排用例放 `tests/app/`（用 `tests/support/fakes.ts` 的端口替身）。
- 新增/移动通用原语时先套归属判据：**与业务无关 → `shared/`；与宠物有关 → `domain/`**，
  并保持 `purity.test.ts` 继续通过。
- **工具分工**：`tsc` 管类型，ESLint 管「类型管不到的错」（悬空 Promise、Promise 误用等），
  Prettier 管格式。两者规则互不重叠：ESLint 不承担排版，Prettier 不做语义检查。
- **提交门禁**：husky 的 `pre-commit` 用 lint-staged 对暂存文件跑 `eslint --fix` +
  `prettier --write`；推送到远端由 CI（`.github/workflows/ci.yml`）跑全量校验。
- **测试是规格**：修 bug 先写失败用例；改行为先改用例再改实现。
- 端口替身只记录「运行时对它做了什么」，不做真实技术动作。

## 5. 文档规范

### 5.1 文档分类，各归其位

| 类别 | 位置                                                    | 回答的问题                       |
| ---- | ------------------------------------------------------- | -------------------------------- |
| 全局 | `docs/domain.md` / `architecture.md` / `conventions.md` | 是什么、怎么落地、什么算合格     |
| 过程 | `docs/issues/`                                          | 这件事为什么做、怎么做、结果如何 |
| 入口 | `README.md` / `docs/README.md`                          | 先读什么                         |

**单一真相源（SSOT）**：同一信息只在一处写，其他位置链接过去。术语以
[domain.md](domain.md) §2 的通用语言表为准；架构以 [architecture.md](architecture.md) 为准。

### 5.2 何时更新哪份

| 变化                              | 更新                                                                    |
| --------------------------------- | ----------------------------------------------------------------------- |
| 业务规则 / 术语                   | `domain.md`（+ `tests/domain/`）                                        |
| 技术结构 / 依赖 / 脚本 / 环境变量 | `architecture.md`                                                       |
| 写码、测试、文档的「规矩」        | 本文（`conventions.md`）                                                |
| 大脑消息格式                      | `contracts/wire-protocol.ts`（类型即契约；设计见 `architecture.md` §8） |
| 任何值得记录的变更                | 先开 `docs/issues/`，完成后回写上面的全局文档                           |

**代码与文档同级维护**：代码改动使文档失真时，必须在同一次改动里修正文档，不留「以后补」。

### 5.3 issue 工作流（摘要）

1. 复制 [issues/TEMPLATE.md](issues/TEMPLATE.md) → `issues/NNNN-slug.md`，登记到索引；
2. 状态：`提案 → 进行中 → 已关闭`（暂停用 `搁置`）；
3. 关键取舍写进「决策记录」，完成时补「执行与结果 / 如何验证」；
4. 详见 [issues/README.md](issues/README.md)。

**决策记录（ADR-lite）**：本项目暂不单设 `docs/adr/`。不可逆的技术决策先写进 issue 的
「决策记录」；当它跨 issue 稳定下来，沉淀进 [architecture.md](architecture.md) 的「关键设计」
或「已修复的坑」。若将来出现成规模的架构决策，再拆出 `adr/`。

## 6. 资产与许可（红线）

- `resources/core/live2dcubismcore.min.js`：**禁止再分发、不入库**；由 `npm run fetch:assets`
  从官方下载。发布前确认符合 Live2D SDK 许可。
- 示例模型（Haru / Shizuku）仅限开发学习；正式发布替换为有授权的模型。
- 若做成「用户自行加载任意模型」的公开应用，需先向 Live2D 报备审查。

## 7. 常用命令

| 命令                              | 用途                                                         |
| --------------------------------- | ------------------------------------------------------------ |
| `npm run dev`                     | 开发（renderer HMR）                                         |
| `npm run typecheck`               | 双工程类型检查（node 侧 / web 侧，严格模式）                 |
| `npm run lint` / `lint:fix`       | ESLint（类型感知；悬空 Promise / Promise 误用 / 类型导入）   |
| `npm run format` / `format:check` | Prettier 写入 / 校验                                         |
| `npm test` / `test:coverage`      | 单元测试 / 覆盖率报告（text + html）                         |
| `npm run docs:check`              | 文档相对链接自检（死链即失败）                               |
| `npm run check`                   | 一次跑完 typecheck + lint + format:check + docs:check + test |
| `npm run smoke`                   | 端到端冒烟 + 透明窗白屏回归（截图存 `.smoke/`）              |
| `npm run fetch:assets`            | 下载 Cubism Core 与示例模型（可重复执行）                    |
| `npm run build` / `dist:win`      | 构建 / 打包 Windows 安装包                                   |

> 环境变量与排障开关（`PET_DIAG`、`PET_SMOKE`、`PET_RENDER_QUERY` 等）见
> [architecture.md](architecture.md) §14。
