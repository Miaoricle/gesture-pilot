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

export type Reading = { gesture: Gesture; score: number; handX: number | null }

export type SmootherOptions = { holdFrames: number; minScore: number; deadZone: number }

export const DEFAULTS: SmootherOptions = { holdFrames: 6, minScore: 0.6, deadZone: 0.12 }

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

/**
 * Steering from where the hand is in the frame: left of centre turns left.
 * `handX` is the wrist x in 0..1 of the *mirrored* preview, so it matches what
 * the user sees. Returns -1..1, with a dead zone in the middle.
 */
export function steering(handX: number | null, deadZone = DEFAULTS.deadZone): number {
  if (handX === null) return 0
  const offset = (handX - 0.5) * 2 // -1..1
  if (Math.abs(offset) <= deadZone) return 0
  const s = (Math.abs(offset) - deadZone) / (1 - deadZone)
  return Math.sign(offset) * Math.min(1, s)
}
