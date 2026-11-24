/**
 * Gesture -> flight command, with temporal smoothing.
 *
 * A single video frame is noisy: hands blur, the recognizer flickers between
 * classes. A command only changes once the same gesture has been seen for
 * `holdFrames` frames in a row above `minScore`. That idea is the same one
 * behind using a sequence model (LSTM) instead of per-frame classification.
 */

export type Gesture = 'None' | 'Closed_Fist' | 'Open_Palm' | 'Pointing_Up' | 'Thumb_Down' | 'Thumb_Up' | 'Victory' | 'ILoveYou'

export type Command = 'takeoff' | 'land' | 'hover' | 'climb' | 'descend' | 'forward' | 'none'

export const GESTURE_COMMAND: Record<Gesture, Command> = {
  Thumb_Up: 'takeoff',
  Closed_Fist: 'land',
  Open_Palm: 'hover',
  Pointing_Up: 'climb',
  Thumb_Down: 'descend',
  Victory: 'forward',
  ILoveYou: 'none',
  None: 'none',
}

export const COMMAND_LABEL: Record<Command, string> = {
  takeoff: 'Take off',
  land: 'Land',
  hover: 'Hover',
  climb: 'Climb',
  descend: 'Descend',
  forward: 'Forward',
  none: '—',
}

/** tilt: hand tilt in degrees (see handTilt), null when no hand is visible */
export type Reading = { gesture: Gesture; score: number; tilt: number | null }

export type SmootherOptions = { holdFrames: number; minScore: number; deadZone: number }

// deadZone is in degrees of hand tilt
export const DEFAULTS: SmootherOptions = { holdFrames: 6, minScore: 0.6, deadZone: 12 }

export class CommandSmoother {
  private candidate: Command = 'none'
  private streak = 0
  current: Command = 'none'
  /** 0..1, how close the candidate is to being accepted (for the UI meter) */
  progress = 0

  private readonly opts: SmootherOptions

  constructor(opts: SmootherOptions = DEFAULTS) {
    this.opts = opts
  }

  /** Feed one frame. Returns the accepted command (which may be unchanged). */
  push(r: Reading): Command {
    const cmd = r.score >= this.opts.minScore ? GESTURE_COMMAND[r.gesture] : 'none'
    if (cmd === 'none') {
      // losing the hand: keep the last command but stop building a new one
      this.candidate = 'none'
      this.streak = 0
      this.progress = 0
      return this.current
    }
    if (cmd === this.candidate) this.streak++
    else {
      this.candidate = cmd
      this.streak = 1
    }
    this.progress = Math.min(1, this.streak / this.opts.holdFrames)
    if (this.streak >= this.opts.holdFrames) this.current = cmd
    return this.current
  }

  reset() {
    this.candidate = 'none'
    this.streak = 0
    this.progress = 0
    this.current = 'none'
  }
}

type Point = { x: number; y: number }

/**
 * How far the hand is tilted, in degrees: 0 = fingers straight up,
 * positive = leaning right *as seen in the mirrored preview*.
 *
 * Uses the line from the wrist (landmark 0) to the middle-finger knuckle
 * (landmark 9), which barely changes between gestures, so you can steer
 * while holding any of them. Landmarks are normalised to the camera frame,
 * so x is scaled by the frame's aspect ratio to get a true angle.
 */
export function handTilt(wrist: Point, knuckle: Point, aspect = 4 / 3): number {
  const dx = -(knuckle.x - wrist.x) * aspect // minus: the preview is mirrored
  const dy = wrist.y - knuckle.y // image y grows downwards
  return (Math.atan2(dx, dy) * 180) / Math.PI
}

/** Tilt in degrees -> steering -1..1, with a dead zone so a relaxed hand flies straight. */
export function steering(tiltDeg: number | null, deadZone = DEFAULTS.deadZone, fullTilt = 40): number {
  if (tiltDeg === null) return 0
  const a = Math.abs(tiltDeg)
  if (a <= deadZone) return 0
  return Math.sign(tiltDeg) * Math.min(1, (a - deadZone) / (fullTilt - deadZone))
}
