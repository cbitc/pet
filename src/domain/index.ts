/**
 * 领域层对外入口。领域代码只依赖本目录内的东西，
 * 且不 import 任何技术栈（electron / pixi / DOM / ws / node）——由 tests/domain/purity.test.ts 守护。
 */

export * from './appearance'
export * from './conversation'
export * from './emotion'
export * from './events'
export * from './pet'
export * from './ports'
export * from './pose'
export * from './preferences'
