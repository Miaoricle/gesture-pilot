import { describe, expect, it } from 'vitest'
import { CommandSmoother, steering, type Gesture } from './control'
import { createDrone, headingDeg, LIMITS, step, type Drone } from './drone'

const frames = (s: CommandSmoother, gesture: Gesture, n: number, score = 0.9) => {
  let out = s.current
  for (let i = 0; i < n; i++) out = s.push({ gesture, score, handX: 0.5 })
  return out
}

describe('CommandSmoother', () => {
  it('needs a steady gesture before switching command', () => {
    const s = new CommandSmoother({ holdFrames: 5, minScore: 0.6, deadZone: 0.1 })
    expect(frames(s, 'Thumb_Up', 4)).toBe('none')
    expect(s.progress).toBeCloseTo(0.8)
    expect(frames(s, 'Thumb_Up', 1)).toBe('takeoff')
  })

  it('ignores a flicker to another class', () => {
    const s = new CommandSmoother({ holdFrames: 3, minScore: 0.6, deadZone: 0.1 })
    frames(s, 'Open_Palm', 3)
    frames(s, 'Closed_Fist', 2) // two noisy frames
    expect(frames(s, 'Open_Palm', 1)).toBe('hover')
    expect(s.current).toBe('hover')
  })

  it('ignores low-confidence frames and keeps the last command when the hand is lost', () => {
    const s = new CommandSmoother({ holdFrames: 2, minScore: 0.6, deadZone: 0.1 })
    frames(s, 'Victory', 2)
    expect(frames(s, 'Closed_Fist', 5, 0.3)).toBe('forward')
    expect(frames(s, 'None', 10)).toBe('forward')
  })
})

describe('steering', () => {
  it('has a dead zone and saturates at the edges', () => {
    expect(steering(0.5)).toBe(0)
    expect(steering(0.55, 0.12)).toBe(0)
    expect(steering(1, 0.12)).toBe(1)
    expect(steering(0, 0.12)).toBe(-1)
    expect(steering(null)).toBe(0)
    expect(steering(0.75, 0)).toBeCloseTo(0.5)
  })
})

const fly = (d: Drone, cmd: Parameters<typeof step>[1], seconds: number, steer = 0) => {
  for (let t = 0; t < seconds; t += 0.02) d = step(d, cmd, steer, 0.02)
  return d
}

describe('drone', () => {
  it('ignores flight commands while landed', () => {
    const d = fly(createDrone(), 'forward', 2)
    expect([d.alt, d.x, d.y, d.phase]).toEqual([0, 0, 0, 'landed'])
  })

  it('takes off to cruise altitude, then holds', () => {
    let d = fly(createDrone(), 'takeoff', 4)
    expect(d.phase).toBe('flying')
    const alt = d.alt
    expect(alt).toBeGreaterThanOrEqual(LIMITS.cruiseAlt)
    d = fly(d, 'hover', 3)
    expect(d.alt).toBeCloseTo(alt, 0)
  })

  it('flies along its heading and turns with steering', () => {
    let d = fly(createDrone(), 'takeoff', 4)
    d = fly(d, 'forward', 3)
    expect(d.y).toBeGreaterThan(5) // north
    expect(Math.abs(d.x)).toBeLessThan(0.01)
    d = fly(d, 'hover', 0.98, 1) // turn right for ~1 s
    expect(headingDeg(d.heading)).toBeGreaterThan(80)
    expect(headingDeg(d.heading)).toBeLessThan(100)
  })

  it('lands and stops on the ground', () => {
    let d = fly(createDrone(), 'takeoff', 4)
    d = fly(d, 'land', 5)
    expect([d.alt, d.phase]).toEqual([0, 'landed'])
  })

  it('respects the ceiling and the arena fence', () => {
    let d = fly(createDrone(), 'takeoff', 4)
    d = fly(d, 'climb', 30)
    expect(d.alt).toBe(LIMITS.ceiling)
    d = fly(d, 'forward', 60)
    expect(d.y).toBe(LIMITS.arena)
  })

  it('does not jump after a long frame gap', () => {
    const d = step(fly(createDrone(), 'takeoff', 4), 'forward', 0, 5)
    expect(d.speed).toBeLessThan(1)
  })
})
