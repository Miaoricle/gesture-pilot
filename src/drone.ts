/** A small, deterministic quadcopter model: enough physics to feel right, simple enough to test. */

import type { Command } from './control'

export type Phase = 'landed' | 'taking-off' | 'flying' | 'landing'

export type Drone = {
  x: number // metres, east
  y: number // metres, north (screen up)
  alt: number // metres
  heading: number // radians, 0 = north, clockwise
  speed: number // m/s along heading
  climb: number // m/s vertical
  phase: Phase
}

export const LIMITS = {
  arena: 40, // the drone stays within ±40 m
  ceiling: 12,
  cruiseAlt: 2.5,
  maxSpeed: 4,
  maxClimb: 1.5,
  turnRate: 1.6, // rad/s at full steering
  accel: 3,
  drag: 2.2,
}

export const createDrone = (): Drone => ({ x: 0, y: 0, alt: 0, heading: 0, speed: 0, climb: 0, phase: 'landed' })

const approach = (v: number, target: number, rate: number, dt: number) =>
  v < target ? Math.min(target, v + rate * dt) : Math.max(target, v - rate * dt)

/** Advance the simulation by dt seconds under a command and a steering input (-1..1). */
export function step(d: Drone, cmd: Command, steer: number, dt: number): Drone {
  const n = { ...d }
  dt = Math.min(dt, 0.1) // big gaps (tab switch) shouldn't teleport the drone

  // phase transitions
  if (cmd === 'takeoff' && n.phase === 'landed') n.phase = 'taking-off'
  if (cmd === 'land' && (n.phase === 'flying' || n.phase === 'taking-off')) n.phase = 'landing'

  const airborne = n.phase !== 'landed'
  let targetSpeed = 0
  let targetClimb = 0

  if (n.phase === 'taking-off') {
    targetClimb = LIMITS.maxClimb
    if (n.alt >= LIMITS.cruiseAlt) n.phase = 'flying'
  } else if (n.phase === 'landing') {
    targetClimb = -LIMITS.maxClimb
  } else if (n.phase === 'flying') {
    if (cmd === 'climb') targetClimb = LIMITS.maxClimb
    if (cmd === 'descend') targetClimb = -LIMITS.maxClimb
    if (cmd === 'forward') targetSpeed = LIMITS.maxSpeed
  }

  n.climb = approach(n.climb, targetClimb, LIMITS.accel, dt)
  n.speed = approach(n.speed, targetSpeed, targetSpeed > n.speed ? LIMITS.accel : LIMITS.drag, dt)
  if (airborne && n.phase !== 'landing') n.heading = (n.heading + steer * LIMITS.turnRate * dt) % (Math.PI * 2)

  n.alt += n.climb * dt
  n.x += Math.sin(n.heading) * n.speed * dt
  n.y += Math.cos(n.heading) * n.speed * dt

  // ground, ceiling and the fence
  if (n.alt > LIMITS.ceiling) {
    n.alt = LIMITS.ceiling
    n.climb = Math.min(0, n.climb)
  }
  if (n.alt <= 0) {
    n.alt = 0
    n.climb = 0
    if (n.phase === 'landing' || (n.phase === 'flying' && cmd === 'descend')) {
      n.phase = 'landed'
      n.speed = 0
    }
  }
  const fence = LIMITS.arena
  if (Math.abs(n.x) > fence || Math.abs(n.y) > fence) {
    n.x = Math.max(-fence, Math.min(fence, n.x))
    n.y = Math.max(-fence, Math.min(fence, n.y))
    n.speed = 0
  }
  return n
}

/** Compass heading in whole degrees, 0..359. */
export const headingDeg = (rad: number) => Math.round((((rad * 180) / Math.PI) % 360) + 360) % 360
