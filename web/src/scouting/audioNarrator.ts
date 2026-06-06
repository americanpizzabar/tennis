/**
 * 音声ナレーション（Web Speech API ラッパー）。
 *
 * ブラウザ標準の SpeechSynthesis を使用するため追加依存なし。
 * iOS / Android / デスクトップ全てで動作（音声品質はブラウザ依存）。
 */

export interface NarratorState {
  speaking: boolean
  paused: boolean
  /** 進捗（0〜1）。文字数ベースの近似値。 */
  progress: number
}

type Listener = (s: NarratorState) => void

class Narrator {
  private utter: SpeechSynthesisUtterance | null = null
  private listeners: Set<Listener> = new Set()
  private state: NarratorState = { speaking: false, paused: false, progress: 0 }

  isSupported(): boolean {
    return typeof window !== 'undefined' && 'speechSynthesis' in window
  }

  speak(text: string, opts?: { rate?: number; pitch?: number }) {
    if (!this.isSupported()) return
    this.stop()
    const u = new SpeechSynthesisUtterance(text)
    u.lang = 'ja-JP'
    u.rate = opts?.rate ?? 1.0
    u.pitch = opts?.pitch ?? 1.0

    // 日本語ボイス優先
    const voices = window.speechSynthesis.getVoices()
    const ja = voices.find(v => v.lang.startsWith('ja'))
    if (ja) u.voice = ja

    const total = text.length
    u.onstart = () => this.setState({ speaking: true, paused: false, progress: 0 })
    u.onend = () => this.setState({ speaking: false, paused: false, progress: 1 })
    u.onpause = () => this.setState({ ...this.state, paused: true })
    u.onresume = () => this.setState({ ...this.state, paused: false })
    u.onboundary = (ev) => {
      if (total > 0) {
        this.setState({ ...this.state, progress: Math.min(1, ev.charIndex / total) })
      }
    }
    u.onerror = () => this.setState({ speaking: false, paused: false, progress: 0 })

    this.utter = u
    window.speechSynthesis.speak(u)
  }

  pause() {
    if (!this.isSupported()) return
    window.speechSynthesis.pause()
  }

  resume() {
    if (!this.isSupported()) return
    window.speechSynthesis.resume()
  }

  stop() {
    if (!this.isSupported()) return
    window.speechSynthesis.cancel()
    this.setState({ speaking: false, paused: false, progress: 0 })
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    listener(this.state)
    return () => { this.listeners.delete(listener) }
  }

  private setState(s: NarratorState) {
    this.state = s
    for (const l of this.listeners) l(s)
  }
}

export const narrator = new Narrator()
