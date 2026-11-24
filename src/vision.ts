/** Webcam + MediaPipe gesture recognizer. Everything runs on this device; frames are never uploaded. */

import { DrawingUtils, FilesetResolver, GestureRecognizer } from '@mediapipe/tasks-vision'
import { handTilt, type Gesture, type Reading } from './control'

// Google's pre-trained canned-gesture model (float16, ~8 MB)
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task'
const WASM_PATH = `${import.meta.env.BASE_URL}mediapipe`

export class HandTracker {
  private recognizer: GestureRecognizer | null = null
  private stream: MediaStream | null = null
  private lastTime = -1
  private draw: DrawingUtils
  private readonly video: HTMLVideoElement
  private readonly overlay: HTMLCanvasElement

  constructor(video: HTMLVideoElement, overlay: HTMLCanvasElement) {
    this.video = video
    this.overlay = overlay
    this.draw = new DrawingUtils(overlay.getContext('2d')!)
  }

  get running() {
    return this.stream !== null && this.recognizer !== null
  }

  async start(onStatus: (msg: string) => void) {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('This browser has no camera access (try Chrome, Edge or Firefox over https).')
    onStatus('Asking for camera…')
    this.stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: 'user' }, audio: false })
    this.video.srcObject = this.stream
    await this.video.play()

    if (!this.recognizer) {
      onStatus('Loading hand model…')
      const files = await FilesetResolver.forVisionTasks(WASM_PATH)
      const make = (delegate: 'GPU' | 'CPU') =>
        GestureRecognizer.createFromOptions(files, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate },
          runningMode: 'VIDEO',
          numHands: 1,
          minHandDetectionConfidence: 0.6,
          minTrackingConfidence: 0.5,
        })
      try {
        this.recognizer = await make('GPU')
      } catch {
        this.recognizer = await make('CPU') // no WebGL2: slower, still works
      }
    }
    onStatus('')
  }

  stop() {
    this.stream?.getTracks().forEach((t) => t.stop())
    this.stream = null
    this.video.srcObject = null
    this.overlay.getContext('2d')!.clearRect(0, 0, this.overlay.width, this.overlay.height)
  }

  /** Run the model on the current frame. Returns null if there's no new frame. */
  read(now: number): Reading | null {
    if (!this.running || this.video.readyState < 2) return null
    if (this.video.currentTime === this.lastTime) return null
    this.lastTime = this.video.currentTime

    const result = this.recognizer!.recognizeForVideo(this.video, now)
    const ctx = this.overlay.getContext('2d')!
    if (this.overlay.width !== this.video.videoWidth) {
      this.overlay.width = this.video.videoWidth
      this.overlay.height = this.video.videoHeight
    }
    ctx.clearRect(0, 0, this.overlay.width, this.overlay.height)

    const hand = result.landmarks[0]
    if (!hand) return { gesture: 'None', score: 0, tilt: null }
    this.draw.drawConnectors(hand, GestureRecognizer.HAND_CONNECTIONS, { color: '#f5a524', lineWidth: 3 })
    this.draw.drawLandmarks(hand, { color: '#0e1110', fillColor: '#f5a524', radius: 3, lineWidth: 1 })

    const top = result.gestures[0]?.[0]
    const aspect = this.video.videoWidth / this.video.videoHeight || 4 / 3
    return { gesture: (top?.categoryName || 'None') as Gesture, score: top?.score ?? 0, tilt: handTilt(hand[0], hand[9], aspect) }
  }
}
