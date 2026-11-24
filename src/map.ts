/** Top-down view of the flying field. */

import { LIMITS, type Drone } from './drone'

const C = {
  ground: '#0f1412',
  grid: '#1b2420',
  gridMajor: '#263330',
  fence: '#3b4a44',
  pad: '#f5a524',
  trail: 'rgba(245,165,36,0.35)',
  body: '#e9ece8',
  arm: '#9aa7a1',
  rotor: 'rgba(233,236,232,0.28)',
  nose: '#ef4444',
  shadow: 'rgba(0,0,0,0.45)',
}

export class FieldView {
  private trail: { x: number; y: number }[] = []
  private ctx: CanvasRenderingContext2D
  private readonly canvas: HTMLCanvasElement

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')!
  }

  private fit() {
    const dpr = window.devicePixelRatio || 1
    const { clientWidth: w, clientHeight: h } = this.canvas
    if (this.canvas.width !== Math.round(w * dpr) || this.canvas.height !== Math.round(h * dpr)) {
      this.canvas.width = Math.round(w * dpr)
      this.canvas.height = Math.round(h * dpr)
    }
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    return { w, h }
  }

  draw(d: Drone, t: number) {
    const { w, h } = this.fit()
    const ctx = this.ctx
    const span = LIMITS.arena * 2 + 6
    const scale = Math.min(w, h) / span // px per metre
    const toX = (m: number) => w / 2 + m * scale
    const toY = (m: number) => h / 2 - m * scale

    ctx.fillStyle = C.ground
    ctx.fillRect(0, 0, w, h)

    // grid every 5 m, stronger every 20 m
    for (let m = -LIMITS.arena; m <= LIMITS.arena; m += 5) {
      ctx.strokeStyle = m % 20 === 0 ? C.gridMajor : C.grid
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(toX(m), toY(-LIMITS.arena))
      ctx.lineTo(toX(m), toY(LIMITS.arena))
      ctx.moveTo(toX(-LIMITS.arena), toY(m))
      ctx.lineTo(toX(LIMITS.arena), toY(m))
      ctx.stroke()
    }
    ctx.strokeStyle = C.fence
    ctx.lineWidth = 2
    ctx.setLineDash([6, 6])
    ctx.strokeRect(toX(-LIMITS.arena), toY(LIMITS.arena), LIMITS.arena * 2 * scale, LIMITS.arena * 2 * scale)
    ctx.setLineDash([])

    // helipad
    ctx.strokeStyle = C.pad
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(toX(0), toY(0), 2.2 * scale, 0, Math.PI * 2)
    ctx.stroke()
    ctx.fillStyle = C.pad
    ctx.font = `600 ${Math.max(10, 2.2 * scale)}px "Barlow Condensed", sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('H', toX(0), toY(0) + 1)

    // north marker
    ctx.fillStyle = '#6b7a73'
    ctx.font = '600 12px "JetBrains Mono", monospace'
    ctx.fillText('N', toX(0), toY(LIMITS.arena) - 10)

    // trail
    const last = this.trail.at(-1)
    if (d.alt > 0.05 && (!last || Math.hypot(last.x - d.x, last.y - d.y) > 0.4)) this.trail.push({ x: d.x, y: d.y })
    if (this.trail.length > 400) this.trail.shift()
    if (this.trail.length > 1) {
      ctx.strokeStyle = C.trail
      ctx.lineWidth = 2
      ctx.beginPath()
      this.trail.forEach((p, i) => (i ? ctx.lineTo(toX(p.x), toY(p.y)) : ctx.moveTo(toX(p.x), toY(p.y))))
      ctx.stroke()
    }

    // drone: grows a little with altitude, shadow drifts away from it
    const size = Math.max(22, 3 * scale) * (1 + d.alt / 14) // drawn larger than life so it reads on the map
    const sx = toX(d.x) + d.alt * 1.6
    const sy = toY(d.y) + d.alt * 2.2
    ctx.fillStyle = C.shadow
    ctx.beginPath()
    ctx.ellipse(sx, sy, size * 0.55, size * 0.42, 0, 0, Math.PI * 2)
    ctx.fill()

    ctx.save()
    ctx.translate(toX(d.x), toY(d.y))
    ctx.rotate(d.heading)
    const arm = size * 0.48
    ctx.strokeStyle = C.arm
    ctx.lineWidth = Math.max(2, size * 0.09)
    ctx.beginPath()
    ctx.moveTo(-arm, -arm)
    ctx.lineTo(arm, arm)
    ctx.moveTo(arm, -arm)
    ctx.lineTo(-arm, arm)
    ctx.stroke()
    const spinning = d.phase !== 'landed'
    for (const [rx, ry] of [
      [-arm, -arm],
      [arm, -arm],
      [arm, arm],
      [-arm, arm],
    ]) {
      ctx.fillStyle = C.rotor
      ctx.beginPath()
      ctx.arc(rx, ry, size * 0.3, 0, Math.PI * 2)
      ctx.fill()
      if (spinning) {
        ctx.strokeStyle = 'rgba(233,236,232,0.7)'
        ctx.lineWidth = 1.5
        const a = t * 0.04 + rx
        ctx.beginPath()
        ctx.moveTo(rx + Math.cos(a) * size * 0.28, ry + Math.sin(a) * size * 0.28)
        ctx.lineTo(rx - Math.cos(a) * size * 0.28, ry - Math.sin(a) * size * 0.28)
        ctx.stroke()
      }
    }
    ctx.fillStyle = C.body
    ctx.fillRect(-size * 0.2, -size * 0.24, size * 0.4, size * 0.48)
    ctx.fillStyle = C.nose
    ctx.beginPath()
    ctx.moveTo(0, -size * 0.42)
    ctx.lineTo(size * 0.12, -size * 0.24)
    ctx.lineTo(-size * 0.12, -size * 0.24)
    ctx.closePath()
    ctx.fill()
    ctx.restore()
  }

  clearTrail() {
    this.trail = []
  }
}
