import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/600.css'
import '@fontsource/barlow-condensed/600.css'
import './style.css'

import { COMMAND_LABEL, CommandSmoother, steering, type Command } from './control'
import { createDrone, headingDeg, step, type Drone } from './drone'
import { FieldView } from './map'
import { HandTracker } from './vision'

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T

const field = new FieldView($<HTMLCanvasElement>('field'))
const tracker = new HandTracker($<HTMLVideoElement>('video'), $<HTMLCanvasElement>('overlay'))
const smoother = new CommandSmoother()

let drone: Drone = createDrone()
let handCommand: Command = 'none'
let handSteer = 0
const keys = new Set<string>()

// ---------- keyboard: always available, and wins over the camera while a key is held ----------
const KEY_COMMAND: Record<string, Command> = {
  KeyT: 'takeoff',
  KeyL: 'land',
  Space: 'hover',
  KeyW: 'climb',
  KeyS: 'descend',
  ArrowUp: 'forward',
}
const STEER_KEYS = new Set(['ArrowLeft', 'ArrowRight'])

window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLElement && e.target.closest('input, textarea')) return
  if (e.code in KEY_COMMAND || STEER_KEYS.has(e.code)) {
    e.preventDefault()
    keys.add(e.code)
  }
})
window.addEventListener('keyup', (e) => keys.delete(e.code))
window.addEventListener('blur', () => keys.clear())

function keyboardInput(): { cmd: Command; steer: number } | null {
  if (keys.size === 0) return null
  let cmd: Command = 'hover'
  for (const code of keys) if (KEY_COMMAND[code]) cmd = KEY_COMMAND[code]
  const steer = (keys.has('ArrowRight') ? 1 : 0) - (keys.has('ArrowLeft') ? 1 : 0)
  return { cmd, steer }
}

// ---------- camera ----------
const camStatus = $('cam-status')
$('cam-start').addEventListener('click', async () => {
  camStatus.classList.remove('err')
  try {
    await tracker.start((msg) => (camStatus.textContent = msg))
    $('cam-empty').hidden = true
    $('cam-stop').hidden = false
  } catch (err) {
    tracker.stop()
    const name = err instanceof DOMException ? err.name : ''
    camStatus.textContent =
      name === 'NotAllowedError'
        ? 'Camera permission was blocked. Allow it in the address bar, or fly with the keyboard.'
        : name === 'NotFoundError'
          ? 'No camera found. You can still fly with the keyboard.'
          : `Couldn't start: ${err instanceof Error ? err.message : String(err)}`
    camStatus.classList.add('err')
  }
})
$('cam-stop').addEventListener('click', () => {
  tracker.stop()
  smoother.reset()
  handCommand = 'none'
  handSteer = 0
  $('cam-empty').hidden = false
  $('cam-stop').hidden = true
  camStatus.textContent = ''
})
$('reset').addEventListener('click', () => {
  drone = createDrone()
  field.clearTrail()
  smoother.reset()
})

// ---------- main loop ----------
const ui = {
  alt: $('alt'),
  spd: $('spd'),
  hdg: $('hdg'),
  pos: $('pos'),
  phase: $('phase'),
  source: $('source'),
  gesture: $('gesture'),
  score: $('score'),
  meter: $('meter'),
  command: $('command'),
  steer: $('steer'),
}

const PHASE_LABEL = { landed: 'Landed', 'taking-off': 'Taking off', flying: 'Flying', landing: 'Landing' } as const
let last = performance.now()

function frame(now: number) {
  const dt = (now - last) / 1000
  last = now

  const reading = tracker.read(now)
  if (reading) {
    handCommand = smoother.push(reading)
    handSteer = steering(reading.handX)
    ui.gesture.textContent = reading.gesture === 'None' ? 'no hand' : reading.gesture.replace('_', ' ').toLowerCase()
    ui.score.textContent = reading.score ? `${Math.round(reading.score * 100)}%` : ''
    ui.meter.style.width = `${smoother.progress * 100}%`
  }

  const kb = keyboardInput()
  const cmd = kb ? kb.cmd : handCommand
  const steer = kb ? kb.steer : handSteer
  drone = step(drone, cmd, steer, dt)

  field.draw(drone, now)
  ui.alt.textContent = drone.alt.toFixed(1)
  ui.spd.textContent = drone.speed.toFixed(1)
  ui.hdg.textContent = String(headingDeg(drone.heading)).padStart(3, '0')
  ui.pos.textContent = `${Math.round(drone.x) + 0}, ${Math.round(drone.y) + 0}` // +0 turns -0 into 0
  ui.phase.textContent = PHASE_LABEL[drone.phase]
  ui.phase.className = `chip ${drone.phase === 'flying' ? 'live' : drone.phase === 'landed' ? '' : 'warn'}`
  ui.source.textContent = kb ? 'Keyboard' : tracker.running ? 'Camera' : 'Keyboard'
  ui.command.textContent = COMMAND_LABEL[cmd]
  const s = Math.max(-1, Math.min(1, steer))
  ui.steer.style.left = s < 0 ? `${50 + s * 50}%` : '50%'
  ui.steer.style.width = `${Math.abs(s) * 50}%`

  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)
