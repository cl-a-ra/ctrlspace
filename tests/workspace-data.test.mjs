import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'

const source = await readFile(new URL('../src/workspace-data.ts', import.meta.url), 'utf8')
const compiled = ts.transpile(source, { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 })
const moduleUrl = `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`
const { createWorkspaceSnapshot, isWorkspaceSnapshot } = await import(moduleUrl)

test('creates a versioned workspace snapshot with every collection', () => {
  const snapshot = createWorkspaceSnapshot({ apps: [], collections: ['Design'], projects: [], activity: [] })

  assert.deepEqual(snapshot, {
    schemaVersion: 1,
    apps: [],
    collections: ['Design'],
    projects: [],
    activity: [],
  })
})

test('accepts only supported snapshot structure and schema version', () => {
  const valid = createWorkspaceSnapshot({ apps: [], collections: [], projects: [], activity: [] })

  assert.equal(isWorkspaceSnapshot(valid), true)
  assert.equal(isWorkspaceSnapshot({ ...valid, schemaVersion: 2 }), false)
  assert.equal(isWorkspaceSnapshot({ ...valid, collections: [1] }), false)
  assert.equal(isWorkspaceSnapshot({ ...valid, projects: null }), false)
  assert.equal(isWorkspaceSnapshot(null), false)
})
