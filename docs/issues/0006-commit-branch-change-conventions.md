# 0006 · 提交、分支与变更规范

> 状态：已关闭（已落地） · 类型：文档 · 日期：2026-09-23 · 关联：[0005](0005-engineering-tooling.md)

---

## 1. 背景与问题

[0005](0005-engineering-tooling.md) 补齐了格式化、静态检查与提交门禁，但「协作过程」仍无章法：

- **提交信息自由**：中英混杂、无类型/范围，无法检索与归类；
- **分支无约定**：功能分支命名随意，看不出对应的 issue；
- **变更无记录**：用户可见的行为变更散落在提交里，没有一份可读的变更日志；
- **issue 与代码未挂钩**：有了 `docs/issues/`，但提交/分支没有指回它，issue 驱动断了一环。

> 本项目为单人 / 本地开发，**不需要 CI/CD 与正式发布流程**，因此规范只覆盖可在本地
> 自动把关的提交、分支与变更记录。

## 2. 目标与非目标

- **目标**：让「分支名、提交信息、变更记录」都有明文规范，且尽量由本地钩子自动把关；
  每条非琐碎改动都能从提交 → 分支 → issue 文档追溯到。
- **非目标**：不搭建 CI/CD；不做 PR 模板；不引入 Changesets / release-it 等发布工具；
  不追溯改写历史提交（历史遗留的非规范提交保持原样）。

## 3. 验收标准

- [x] 无效提交被 `commit-msg` 钩子拦截，规范提交通过
- [x] 分支命名规范成文
- [x] `CHANGELOG.md` 就位，并纳入 `docs:check` 链接检查
- [x] `npm run check`、`npm run docs:check` 通过

## 4. 方案

| 关注点   | 选型                                      | 落点                                         |
| -------- | ----------------------------------------- | -------------------------------------------- |
| 提交信息 | Conventional Commits + commitlint         | `commitlint.config.mjs`、`.husky/commit-msg` |
| 分支命名 | `<type>/<issue>-<slug>`                   | `docs/conventions.md` §6                     |
| 变更记录 | `CHANGELOG.md`（六类 + `[Unreleased]`）   | `CHANGELOG.md`                               |
| 追溯     | 提交 footer `Refs: docs/issues/NNNN-*.md` | 规范 §7 + commitlint 提醒                    |

## 5. 决策记录

| 决策                                                                       | 理由                                                           | 备选（未采用）                           |
| -------------------------------------------------------------------------- | -------------------------------------------------------------- | ---------------------------------------- |
| 用 Conventional Commits                                                    | 生态成熟、工具链齐全、便于检索                                 | 自定义格式（无现成工具）                 |
| commitlint 仅对「能机械判定」的项设 error，风格与「建议引用 issue」设 warn | 中文主题/句号等无法套用英文规则；避免卡住合理提交              | 全部设 error（噪声大、易误伤）           |
| 提交 footer 引用**本地 issue 文档**，GitHub Issue 可选                     | 与既有 `docs/issues/` 机制一致，不强依赖跟踪器                 | 强制每条提交关联网站 issue               |
| 手动维护 changelog，不上自动生成工具                                       | 现有历史非规范提交，自动生成会产出垃圾；issue 文档已是权威叙述 | `commit-and-tag-version` / Changesets    |
| 只做本地钩子把关，不搭 CI/CD 与 PR 流程                                    | 单人 / 本地开发，远端流水线与评审是额外开销                    | GitHub Actions + PR 模板（本仓库不需要） |

## 6. 执行与结果

- 新增 `commitlint.config.mjs` 与 `.husky/commit-msg`；`scope-enum` / `references-empty` 为警告。
- `CHANGELOG.md` 建立 `[Unreleased]` + `0.1.0` 基线，条目链接 issue 文档；
  `scripts/check-docs.mjs` 扩展为扫描仓库根与 `docs/` 下的所有 Markdown。
- `docs/conventions.md` 更新为 §6 分支命名 / §7 提交信息 / §8 变更记录
  （原「资产与许可」「常用命令」顺延为 §9 / §10）。

## 7. 如何验证

```bash
# 规范提交通过、非法提交被拒（本地等价于 commit-msg 钩子）
printf 'feat(domain): 支持待机小动作\n\nRefs: docs/issues/0006-commit-branch-change-conventions.md\n' \
  > .msg && npx --no -- commitlint --edit .msg && rm .msg

npm run docs:check
npm run check
```

## 8. 关联

- 关键文件：`commitlint.config.mjs`、`.husky/commit-msg`、`CHANGELOG.md`
- 全局文档：[../conventions.md](../conventions.md) §6 / §7 / §8
