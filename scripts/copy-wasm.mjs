// Copies MediaPipe's WebAssembly runtime into public/ so the app serves it itself
// (same version as the npm package, no third-party CDN at runtime).
import { cpSync, mkdirSync } from 'node:fs'

const from = 'node_modules/@mediapipe/tasks-vision/wasm'
const to = 'public/mediapipe'
mkdirSync(to, { recursive: true })
// only the classic (non-module) build is loaded by FilesetResolver.forVisionTasks(path)
for (const f of ['vision_wasm_internal.js', 'vision_wasm_internal.wasm']) cpSync(`${from}/${f}`, `${to}/${f}`)
console.log(`copied ${from} -> ${to}`)
