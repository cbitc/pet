# 0005 · 补齐外围工程：格式化、静态检查与提交门禁

> 状态：已关闭（已落地） · 类型：重构 · 日期：2026-09-23 · 关联：[0003](0003-declarative-refactor.md) / [0004](0004-shared-primitives.md)

---

## 1. 背景与问题

代码逻辑已有 `typecheck + test + docs:check` 保障，但外围工程几乎空白：

- **没有格式化**：缩进/引号/换行全凭手感，协作时产生大量无意义 diff；
- **没有静态检查**：`void promise` 之外真正漏掉的悬空 Promise、Promise 误用无从发现；
- **没有编辑器/行尾规范**：仓库此前长期出现「整文件 CRLF 变更」的噪声 diff；
- **没有提交门禁**：坏代码可以直接进主干；
- **没有覆盖率视角**：不知道纯逻辑层的测试盲区；
- **两份 tsconfig 重复** 全部 compilerOptions；`modelEntryUrl` 被重复实现。

## 2. 目标与非目标

- **目标**：`format / lint / editorconfig / gitattributes / hooks / coverage` 一应俱全，
  且与既有风格（无分号、单引号、2 空格）零冲突。
- **非目标**：不改业务行为；不引入前端框架；不启用会制造大量噪声的严格开关
  （`noUncheckedIndexedAccess`、`exactOptionalPropertyTypes`）；不强制 commit message 规范。

## 3. 验收标准

- [x] `npm run format:check`、`npm run lint`、`npm run typecheck` 全绿
- [x] `npm test`（66 用例）与 `npm run test:coverage` 通过
- [x] `npm run docs:check` 通过
- [x] `npm run build` 通过
- [x] `npm run check` 一条命令跑完全部校验
- [x] `pre-commit` 钩子生效

## 4. 方案

| 关注点        | 选型                                              | 落点                                  |
| ------------- | ------------------------------------------------- | ------------------------------------- |
| 格式          | Prettier 3（`semi:false` / 单引号 / 100 列 / LF） | `.prettierrc.json`、`.prettierignore` |
| 静态检查      | ESLint 10 flat + typescript-eslint 8（类型感知）  | `eslint.config.mjs`                   |
| 编辑器/行尾   | EditorConfig + `.gitattributes`（`eol=lf`）       | `.editorconfig`、`.gitattributes`     |
| 提交门禁      | husky 9 + lint-staged                             | `.husky/pre-commit`、`package.json`   |
| 覆盖率        | `@vitest/coverage-v8`（含阈值门禁）               | `vitest.config.ts`                    |
| 版本锚定      | `.nvmrc`（24）+ `engines.node>=20`                | 根目录 / `package.json`               |
| 许可          | MIT `LICENSE`                                     | 根目录                                |
| tsconfig 去重 | 抽 `tsconfig.base.json`，node/web `extends`       | `tsconfig.*.json`                     |

**工具分工**：`tsc` 管类型，Prettier 管排版，ESLint 只保留类型感知的高价值规则——
`no-floating-promises`、`no-misused-promises`、`await-thenable`、`consistent-type-imports`
（最后用 `eslint-config-prettier` 关掉全部冲突项）。

## 5. 决策记录

| 决策                                             | 理由                                                     | 备选（未采用）                              |
| ------------------------------------------------ | -------------------------------------------------------- | ------------------------------------------- |
| ESLint 只启「类型管不到的错」，排版全交 Prettier | 规则不重叠、无互相打架；避免格式化规则泛滥               | 用 ESLint 承担格式化（与 Prettier 冲突）    |
| 启用类型感知（`projectService`）但只挑 4 条规则  | 拿到悬空 Promise 等高价值检查，又不被上百条风格告警淹没  | 直接上 `recommendedTypeChecked`（噪声过大） |
| `.gitattributes` 设 `* text=auto eol=lf`         | 根治长期存在的 CRLF 整文件 diff                          | 靠各人 `core.autocrlf`（不可控）            |
| Markdown 也纳入 Prettier                         | 与仓库既有已对齐的表格一致；`proseWrap` 默认保留手工换行 | 忽略 `*.md`（文档风格不统一）               |
| coverage 只统计 `domain/shared/contracts/app`    | 适配器依赖 Electron/DOM，在 node 环境统计无意义          | 全量统计（大量 0% 噪声）                    |

## 6. 执行与结果

- 自动修复了 9 处 `consistent-type-imports`；手工清理脚本中的未使用变量；
  为 `gpu-probe.cjs` 放行 CJS `require`；给 `app.whenReady().then(...)` 补 `void`。
- 严格开关新增：`noUnusedParameters` / `noImplicitReturns` / `noImplicitOverride` /
  `noFallthroughCasesInSwitch`（均无新增错误）。
- 顺带修复两处「缺失」：
  - `renderer.ts` 的本地 `modelEntryUrl` 与 `contracts/model-catalog.ts` 重复 → 改为复用后者；
  - 上一轮结构重构删掉 `docs/brain-protocol.md` 后遗留的 4 处引用 → 统一指向
    `contracts/wire-protocol.ts` 与 `architecture.md` §8。

## 7. 如何验证

```bash
npm ci
npm run check          # typecheck + lint + format:check + docs:check + test
npm run test:coverage
npm run build
```

## 8. 关联

- 关键文件：`eslint.config.mjs`、`.prettierrc.json`、`.editorconfig`、`.gitattributes`、
  `.husky/pre-commit`、`tsconfig.base.json`
- 全局文档：[../conventions.md](../conventions.md) §2/§4/§10
