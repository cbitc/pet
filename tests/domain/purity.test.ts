/**
 * 分层纯净性守护：
 *   1) domain/ 只允许依赖自己与 shared/ 原语——一旦有人在领域里 import
 *      Electron / Pixi / DOM / ws / node，或反向依赖 contracts/adapters/app，
 *      这个测试会立刻失败。
 *   2) shared/ 是最底层，**不允许 import 任何东西**，防止它悄悄长成技术层。
 *
 * 领域模型必须能脱离技术栈被阅读、被测试、被复用。
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const DOMAIN_DIR = path.resolve(__dirname, '../../src/domain')
const SHARED_DIR = path.resolve(__dirname, '../../src/shared')

/** 允许领域引用的前缀：领域内部相对路径，或最底层的 shared 原语 */
const ALLOWED_DOMAIN_PREFIXES = ['./', '../shared/']

function listTsFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return listTsFiles(full)
    return entry.name.endsWith('.ts') ? [full] : []
  })
}

function importsOf(source: string): string[] {
  const specifiers: string[] = []
  const pattern = /^\s*(?:import|export)[^'"\n]*?from\s*['"]([^'"]+)['"]/gm
  let match: RegExpExecArray | null
  while ((match = pattern.exec(source))) specifiers.push(match[1])
  return specifiers
}

describe('领域纯净性', () => {
  const files = listTsFiles(DOMAIN_DIR)

  it('领域目录存在且非空', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  it('领域只依赖自己与 shared 原语（不碰技术栈，也不反向依赖外层）', () => {
    const violations: string[] = []

    for (const file of files) {
      const source = fs.readFileSync(file, 'utf8')
      for (const specifier of importsOf(source)) {
        const allowed = ALLOWED_DOMAIN_PREFIXES.some((prefix) => specifier.startsWith(prefix))
        if (!allowed) violations.push(`${path.relative(DOMAIN_DIR, file)} → ${specifier}`)
      }
    }

    expect(violations).toEqual([])
  })

  it('领域不使用浏览器/Node 全局对象（window/document/setTimeout/process…）', () => {
    const forbiddenGlobals = [
      'window.',
      'document.',
      'localStorage',
      'setTimeout',
      'setInterval',
      'process.',
      'require('
    ]
    const violations: string[] = []

    for (const file of files) {
      const source = fs.readFileSync(file, 'utf8')
      for (const token of forbiddenGlobals) {
        if (source.includes(token)) {
          violations.push(`${path.relative(DOMAIN_DIR, file)} 出现 ${token}`)
        }
      }
    }

    expect(violations).toEqual([])
  })
})

describe('shared 纯净性', () => {
  const files = listTsFiles(SHARED_DIR)

  it('shared 目录存在且非空', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  it('shared 是最底层，不 import 任何模块', () => {
    const violations = files
      .filter((file) => importsOf(fs.readFileSync(file, 'utf8')).length > 0)
      .map((file) => path.relative(SHARED_DIR, file))

    expect(violations).toEqual([])
  })
})
