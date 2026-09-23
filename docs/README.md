# 文档地图

> 这里是 `docs/` 的入口。先看下表找到该读的那一份，再按各文档内部的交叉链接深入。
> 仓库总览与快速开始见 [../README.md](../README.md)。

---

## 1. 我想……

| 我想知道 / 做什么                  | 读这份                             | 性质     |
| ---------------------------------- | ---------------------------------- | -------- |
| 宠物是什么、有什么规矩、术语怎么用 | [domain.md](domain.md)             | 全局常青 |
| 技术怎么落地、代码为什么这样组织   | [architecture.md](architecture.md) | 全局常青 |
| 代码 / 测试 / 文档「什么算合格」   | [conventions.md](conventions.md)   | 全局常青 |
| 这件事为什么做、怎么做、结果如何   | [issues/](issues/README.md)        | 过程记录 |

**推荐的第一次阅读顺序**：`domain.md`（业务）→ `architecture.md`（技术）→ `conventions.md`（规矩）。

## 2. 目录结构

```
docs/
├─ README.md              本文件：地图与维护约定
├─ domain.md              全局：领域模型、通用语言、不变量、边界
├─ architecture.md        全局：分层、进程/窗口模型、代码映射、坑与扩展点
├─ conventions.md         全局：分层规则、代码与文档规范、测试验收、许可红线
└─ issues/                过程：issue 驱动开发
   ├─ README.md           工作流与索引
   ├─ TEMPLATE.md         新 issue 模板
   ├─ 0001-white-screen.md
   └─ 0002-live2d-texture-gc.md
```

## 3. 维护约定（摘要）

完整规则见 [conventions.md](conventions.md) §5。

- **单一真相源**：同一信息只写一处，别处链接。术语查 `domain.md` §2，架构查 `architecture.md`。
- **代码与文档同级维护**：改动令文档失真时，同一次改动内修正，不留「以后补」。
- **变更先开 issue**：任何值得记录的变更，先在 `docs/issues/` 建文档并登记索引；
  完成后回写受影响的全局文档。
- **链接用相对路径**：文档之间互引用相对链接；代码注释引用文档写 `docs/…` 仓库路径。
  `npm run docs:check` 会自动检查死链。
- **新增全局文档的门槛**：只有「跨模块、长期有效」的内容才进 `docs/` 根目录；
  一次性的过程记录一律进 `issues/`。
