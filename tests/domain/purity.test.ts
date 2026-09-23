/**
 * 领域纯净性守护：domain/ 只允许依赖自己。
 * 一旦有人在领域里 import 了 Electron / Pixi / DOM / ws / node，
 * 这个测试会立刻失败——领域模型必须能脱离技术栈被阅读、被测试、被复用。
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const DOMAIN_DIR = path.resolve(__dirname, '../../src/domain')

/** 允许的依赖：领域内部相对路径。其余一律禁止。 */
const FORBIDDEN = [
  'electron',
  'pixi.js',
  '@jannchie',
  'ws',
  'node:',
  'fs',
  'path',
  'child_process'
]

function listDomainFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return listDomainFiles(full)
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
  const files = listDomainFiles(DOMAIN_DIR)

  it('领域目录存在且非空', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  it('领域不依赖任何技术栈（只允许领域内部相对引用）', () => {
    const violations: string[] = []

    for (const file of files) {
      const source = fs.readFileSync(file, 'utf8')
      for (const specifier of importsOf(source)) {
        const isInternal = specifier.startsWith('./') || specifier.startsWith('../')
        const isForbidden = FORBIDDEN.some((bad) => specifier.includes(bad))
        if (!isInternal || isForbidden) {
          violations.push(`${path.relative(DOMAIN_DIR, file)} → ${specifier}`)
        }
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
