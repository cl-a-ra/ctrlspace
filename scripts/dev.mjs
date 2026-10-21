import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const children = [
  spawn(process.execPath, [resolve(root, 'server/index.mjs')], {
    cwd: root,
    env: { ...process.env, CTRLSPACE_API_PORT: '3001' },
    stdio: 'inherit',
  }),
  spawn(process.execPath, [resolve(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1'], {
    cwd: root,
    env: { ...process.env },
    stdio: 'inherit',
  }),
]

let stopping = false
function stop(code = 0) {
  if (stopping) return
  stopping = true
  for (const child of children) {
    if (child.exitCode === null) child.kill()
  }
  process.exitCode = code
}

for (const child of children) {
  child.on('error', (error) => {
    console.error('CTRLSPACE development process failed to start.', error)
    stop(1)
  })
  child.on('exit', (code) => {
    if (!stopping) stop(code ?? 1)
  })
}

process.on('SIGINT', () => stop(0))
process.on('SIGTERM', () => stop(0))
