import js from '@eslint/js'
import prettier from 'eslint-config-prettier'
import globals from 'globals'
import tseslint from 'typescript-eslint'

/**
 * ESLint 扁平配置。
 *
 * 分工：`tsc` 管类型，Prettier 管格式，ESLint 只管「类型管不到的错」。
 * 因此这里不启用任何排版类规则，只保留类型感知的高价值规则
 * （悬空 Promise、Promise 误用等），最后用 eslint-config-prettier 关掉冲突项。
 */
export default tseslint.config(
  {
    ignores: ['node_modules/**', 'out/**', 'dist/**', '.smoke/**', '.diag/**', 'resources/**']
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    files: ['**/*.ts'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname
      },
      globals: { ...globals.node, ...globals.browser }
    },
    rules: {
      // 类型检查已覆盖未定义标识符；TS 版未使用变量规则支持 `_` 前缀豁免
      'no-undef': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }
      ],
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],

      // 高价值：异步错误必须被显式处理（用 `void` 明确表示「有意不等待」）
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/await-thenable': 'error'
    }
  },

  {
    files: ['**/*.mjs'],
    languageOptions: { globals: { ...globals.node } }
  },

  {
    // CJS 脚本按定义就用 require()
    files: ['**/*.cjs'],
    languageOptions: { globals: { ...globals.node } },
    rules: { '@typescript-eslint/no-require-imports': 'off' }
  },

  prettier
)
