# 0004 · 抽出 `shared/` 最底层：与业务无关的通用原语

> 状态：已关闭（已落地） · 类型：重构 · 日期：2026-09-23 · 关联：[0003](0003-declarative-refactor.md) · 提交：`1a91712`

---

## 1. 背景与问题

[0003](0003-declarative-refactor.md) 把 `clamp` / `rectContains` 收进了 `domain/geometry.ts`，
但这两个函数并不属于「宠物业务」：`contracts/schemas.ts`（解析）与
`adapters/presentation/`（命中检测）也要用。放在 `domain/` 造成两个问题：

- 语义错位：它们与宠物无关，却挂在领域层；
- 依赖别扭：`contracts/` 反过来 import 领域模块才能拿到底层数值工具，层级方向拧了。

## 2. 目标与非目标

- **目标**：给「与业务无关的通用原语」一个零依赖的最底层位置，并把它写进机器守护。
- **非目标**：不趁机搬动其他模块；不改变 `clamp` / `rectContains` 的行为。

## 3. 验收标准

- [x] `src/shared/` 存在，且**不 import 任何模块**（测试守护）
- [x] `domain/` 只允许依赖领域内部与 `../shared/`
- [x] `clamp` / `rectContains` 全仓库仅一份实现
- [x] `npm run typecheck` / `npm test` / `npm run build` 通过

## 4. 方案

- 新建 `src/shared/geometry.ts`：`clamp` / `rectContains` 改为**结构化类型参数**
  （直接接受任何 `{x,y}` / `{x,y,width,height}`），因此不必依赖 domain 的
  `ScreenPoint` / `Rect` 类型定义。
- `domain/ports.ts` 重新自带「点 / 矩形 / 视口」词汇（端口与世界对话用的类型），
  与 shared 的实现解耦。
- `tests/domain/purity.test.ts` 扩展为两组守护：
  1. `domain/` 只能 `./` 或 `../shared/`，且不得出现 `window.` / `document.` / `setTimeout` / `process.`；
  2. `shared/` 必须零 import。
- `tsconfig.node.json` / `tsconfig.web.json` 的 include 纳入 `src/shared`。

## 5. 决策记录

| 决策                              | 理由                                                                                 | 备选（未采用）                                          |
| --------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------- |
| 新建 `shared/` 而非留在 `domain/` | 归属判据：**把桌宠业务整个换掉，这段代码依然成立**；且避免 contracts 反向依赖 domain | 留在 `domain/` 并把 purity 白名单放宽（层级语义被稀释） |
| shared 用结构化类型参数           | 零依赖最底层不能反向依赖任何类型                                                     | 让 shared import domain 的 `Rect`（依赖倒挂）           |
| 在 shared 上再设「零 import」守护 | 防止它随时间悄悄长成技术层                                                           | 只靠约定（迟早失守）                                    |
| 复制一份实现给各层                | ——                                                                                   | 直接否决：违背单点，0003 的收敛白做                     |

## 6. 执行与结果

- 落地于提交 `1a91712`（`opt/remove geometry`）：删除 `src/domain/geometry.ts`，
  新增 `src/shared/geometry.ts`，改写 5 处 import 与 purity 测试。
- `README.md`、`docs/architecture.md` 同步了分层说明与目录树。
- 测试文件中 `purity.test.ts` 从 3 例增至 5 例（新增 shared 组）。

## 7. 如何验证

```bash
npm run typecheck
npm test          # 含 domain 与 shared 两组纯净性守护
npm run build
```

## 8. 关联

- 关键文件：`src/shared/geometry.ts`、`src/domain/ports.ts`、`tests/domain/purity.test.ts`
- 全局文档：[../architecture.md](../architecture.md) §1 / §10、[../conventions.md](../conventions.md) §1
