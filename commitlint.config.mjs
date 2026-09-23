/**
 * 提交信息规范（Conventional Commits）。
 *
 * 由 husky 的 commit-msg 钩子在提交时调用；规则说明见 docs/conventions.md §7。
 * 设计取向：能自动查的才设成 error，风格类与「建议」类一律 warn，避免卡住合理提交。
 */
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // 主题用中文：关闭大小写与句号检查
    'subject-case': [0],
    'subject-full-stop': [0],
    'header-max-length': [2, 'always', 100],
    'body-max-line-length': [1, 'always', 120],

    // 推荐作用域（警告，不阻断合理的新作用域）
    'scope-enum': [
      1,
      'always',
      [
        'domain',
        'shared',
        'contracts',
        'app',
        'adapters',
        'shell',
        'brain',
        'bridge',
        'presentation',
        'stage',
        'chat',
        'entries',
        'renderer',
        'scripts',
        'docs',
        'deps',
        'build'
      ]
    ],

    // issue 驱动：期望非琐碎提交引用过程记录（Refs: docs/issues/NNNN-*.md）
    'references-empty': [1, 'always']
  }
}
