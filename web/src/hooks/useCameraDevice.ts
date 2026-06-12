import { useCallback, useEffect, useRef, useState } from 'react'
import {
  listCameras, backCameras, openCamera, getZoomCapability, applyHardwareZoom,
  planLogicalZoom, setCachedZoomRange, type CameraDeviceInfo, type ZoomCapability,
} from '../lib/camera'

/**
 * 再利用可能なカメラ管理フック。
 *
 *  - 起動／切替／ズーム適用を 1 か所に集約
 *  - 0.5×/1×/2×/5× のプリセットを最適なカメラ + ハードウェアズームに変換
 *  - 多くの端末（iPhone Triple Camera / Android デュアル等）で 0.5× が機能する
 *
 * 使い方：
 *   const cam = useCameraDevice(videoRef, { audio: true })
 *   // ...
 *   <CameraToolbar cam={cam} disabled={recording} />
 *   const stream = cam.stream  // MediaRecorder 等で利用
 */
export interface UseCameraDeviceOpts {
  audio?: boolean
  width?: number
  height?: number
  /** 自動起動するかどうか。false なら openInitial() を呼ぶまで起動しない。 */
  autoStart?: boolean
}

export interface CameraDeviceState {
  stream: MediaStream | null
  cameras: CameraDeviceInfo[]
  activeDeviceId: string | undefined
  zoomCap: ZoomCapability
  /** 「論理ズーム」(0.5/1/2/5) のうちこの端末で利用可能なもの。 */
  availablePresets: number[]
  /** 現在の論理ズーム（最後にユーザが選んだ値）。 */
  currentPreset: number
  error: string | null
  /** プリセット切替時の案内（発見モードの「次のカメラを試して」等）。 */
  presetNote: string | null
  /** カメラを指定して再オープン。 */
  switchTo: (deviceId: string) => Promise<void>
  /** プリセット（0.5×/1×/2×/5×）に切替。最適カメラ＋ハードウェアズームを自動選択。 */
  selectPreset: (level: number) => Promise<void>
  /** スライダー用：絶対値でズーム適用（ハード→ダメなら CSS デジタル）。 */
  setZoom: (z: number) => Promise<void>
  /** ハードウェアズーム非対応端末用：CSS scale 倍率（プレビュー表示のみ）。 */
  digitalZoom: number
  /** 既にカメラが開いていれば停止。コンポーネントの cleanup でも自動実行。 */
  stop: () => void
  /** autoStart=false 時、最初の起動。 */
  openInitial: () => Promise<void>
}

const PRESET_LEVELS = [0.5, 1, 2, 5]

export function useCameraDevice(
  videoRef: React.RefObject<HTMLVideoElement>,
  opts: UseCameraDeviceOpts = {},
): CameraDeviceState {
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [cameras, setCameras] = useState<CameraDeviceInfo[]>([])
  const [activeDeviceId, setActiveId] = useState<string | undefined>(undefined)
  const [zoomCap, setZoomCap] = useState<ZoomCapability>({ supported: false, min: 1, max: 1, step: 0.1, current: 1 })
  const [digitalZoom, setDigitalZoom] = useState(1)
  const [currentPreset, setCurrentPreset] = useState(1)
  const [error, setError] = useState<string | null>(null)
  const [presetNote, setPresetNote] = useState<string | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const discoverIdxRef = useRef(0)   // 0.5× 発見モードの巡回インデックス

  // <video> に stream を貼り直す
  const attach = useCallback((s: MediaStream | null) => {
    streamRef.current = s
    setStream(s)
    const v = videoRef.current
    if (v) {
      v.srcObject = s
      if (s) v.play().catch(() => { /* autoplay 制限 */ })
    }
  }, [videoRef])

  // ズーム能力の読み取り＋キャッシュ。
  // Chrome Android は getUserMedia 直後だと capabilities が未設定のことがあるため、
  // 少し遅らせて再読込する（Pixel で 0.5× が見えなかった主因）。
  const refreshZoomCap = useCallback((deviceId?: string) => {
    const cap = getZoomCapability(streamRef.current)
    if (cap.supported) {
      setZoomCap(cap)
      if (deviceId) setCachedZoomRange(deviceId, cap.min, cap.max)
    }
    return cap
  }, [])

  // 起動／切替の共通ロジック
  const open = useCallback(async (deviceId?: string, initialZoom?: number) => {
    setError(null)
    try {
      // 既存ストリーム停止
      streamRef.current?.getTracks().forEach(t => t.stop())
      attach(null)
      const newStream = await openCamera({
        deviceId,
        facingMode: deviceId ? undefined : 'environment',
        audio: opts.audio ?? false,
        width: opts.width ?? 1280,
        height: opts.height ?? 720,
        initialZoom,
      })
      attach(newStream)
      setDigitalZoom(1)
      const settings = newStream.getVideoTracks()[0]?.getSettings()
      const realId = settings?.deviceId ?? deviceId
      setActiveId(realId)
      // 能力読み取り：即時＋遅延 2 回（capabilities の遅延 populate 対策）
      const immediate = getZoomCapability(newStream)
      setZoomCap(immediate)
      if (immediate.supported && realId) setCachedZoomRange(realId, immediate.min, immediate.max)
      window.setTimeout(() => refreshZoomCap(realId), 300)
      window.setTimeout(() => {
        refreshZoomCap(realId)
        // 遅延後の実測値をカメラ一覧へ反映（planLogicalZoom が学習結果を使えるように）
        listCameras().then(cams => setCameras(backCameras(cams)))
      }, 1200)
      // 許可後のカメラ列挙
      const cams = await listCameras()
      setCameras(backCameras(cams))
      return realId
    } catch (e: any) {
      setError('カメラへのアクセスに失敗：' + (e?.message ?? String(e)))
      return undefined
    }
  }, [opts.audio, opts.width, opts.height, attach, refreshZoomCap])

  // 自動起動
  useEffect(() => {
    if (opts.autoStart === false) return
    open()
    return () => {
      streamRef.current?.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // <video> が後から DOM に登場した場合（条件レンダリング対策）も再アタッチ
  useEffect(() => {
    const v = videoRef.current
    if (v && streamRef.current && !v.srcObject) {
      v.srcObject = streamRef.current
      v.play().catch(() => { /* noop */ })
    }
  })

  const switchTo = useCallback(async (deviceId: string) => {
    await open(deviceId)
  }, [open])

  const selectPreset = useCallback(async (level: number) => {
    setCurrentPreset(level)
    setPresetNote(null)
    // ① まず「現在のカメラのハードウェアズーム」で到達できるか確認。
    //    Android の多くは超広角を別カメラではなく zoom min=0.5 として公開するため、
    //    カメラ切替なしで 0.5× に到達できるケースが最多。
    if (zoomCap.supported && level >= zoomCap.min - 1e-6 && level <= zoomCap.max + 1e-6) {
      const ok = await applyHardwareZoom(streamRef.current, level)
      if (ok) {
        setZoomCap(c => ({ ...c, current: level }))
        setDigitalZoom(1)
        return
      }
    }
    // ②' 遅延 populate 対策：いったん能力を再読込してもう一度試す
    const fresh = refreshZoomCap(activeDeviceId)
    if (fresh.supported && level >= fresh.min - 1e-6 && level <= fresh.max + 1e-6) {
      const ok = await applyHardwareZoom(streamRef.current, level)
      if (ok) {
        setZoomCap(c => ({ ...c, current: level }))
        setDigitalZoom(1)
        return
      }
    }
    // ② カメラ切替プラン（iOS の Ultra Wide / Triple、実測キャッシュ済みカメラ）
    const plan = planLogicalZoom(level, cameras)
    if (plan) {
      if (plan.deviceId !== activeDeviceId) {
        await open(plan.deviceId)
      }
      if (plan.hardwareZoom != null) {
        const ok = await applyHardwareZoom(streamRef.current, plan.hardwareZoom)
        if (ok) {
          setZoomCap(c => ({ ...c, current: plan.hardwareZoom! }))
          setDigitalZoom(1)
        } else if (level >= 1) {
          setDigitalZoom(level)
        }
      } else {
        setDigitalZoom(1)
      }
      return
    }
    // ③ 0.5× の積極アプローチ：
    //    (a) まず「現在のカメラを zoom:0.5 を初期制約で再オープン」。
    //        Pixel 等は applyConstraints では拒否されても初期制約なら通ることがある。
    //    (b) ダメなら次の背面カメラへ巡回（Pixel の超広角は別 deviceId）。
    if (level < 1) {
      // (a) 現在カメラを 0.5 zoom 制約で再オープン
      try {
        await open(activeDeviceId, 0.5)
        const cap = refreshZoomCap(activeDeviceId)
        if (cap.supported && cap.min < 1 && (cap.current ?? 1) < 1) {
          setPresetNote('✅ 0.5× に切替えました。')
          return
        }
      } catch { /* fallthrough to (b) */ }
      // (b) 次の背面カメラへ巡回
      const others = cameras.filter(c => c.deviceId !== activeDeviceId)
      if (others.length === 0) {
        setPresetNote('⚠️ この端末では Web から 0.5× を取得できませんでした。Chrome のアドレスバーを長押し → サイト設定 → カメラ で「許可」になっているか確認してください。')
        return
      }
      const idx = discoverIdxRef.current % others.length
      discoverIdxRef.current++
      const newId = await open(others[idx].deviceId, 0.5)
      window.setTimeout(async () => {
        const cap = refreshZoomCap(newId)
        if (cap.supported && cap.min < 1) {
          await applyHardwareZoom(streamRef.current, Math.max(cap.min, level))
          setZoomCap(c => ({ ...c, current: Math.max(cap.min, level) }))
          setPresetNote('✅ 0.5× 対応カメラに切替えました。')
        } else {
          setPresetNote(`📷 カメラ ${idx + 1}/${others.length} に切替。画角が広がっていなければ、もう一度 0.5× をタップして次を試してください。`)
        }
      }, 500)
      return
    }
    // ④ フォールバック：拡大のみ CSS デジタル
    if (level >= 1) setDigitalZoom(level)
  }, [cameras, activeDeviceId, open, zoomCap, refreshZoomCap])

  const setZoom = useCallback(async (z: number) => {
    if (zoomCap.supported) {
      const clamped = Math.max(zoomCap.min, Math.min(zoomCap.max, z))
      const ok = await applyHardwareZoom(streamRef.current, clamped)
      if (ok) {
        setZoomCap(c => ({ ...c, current: clamped }))
        return
      }
    }
    setDigitalZoom(z)
  }, [zoomCap])

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    setStream(null)
  }, [])

  // この端末で意味のあるプリセットだけを返す
  const availablePresets = computeAvailablePresets(cameras, zoomCap)

  return {
    stream, cameras, activeDeviceId, zoomCap, currentPreset, digitalZoom,
    availablePresets, error, presetNote,
    switchTo, selectPreset, setZoom, stop,
    openInitial: async () => { await open() },
  }
}

function computeAvailablePresets(cams: CameraDeviceInfo[], cap: ZoomCapability): number[] {
  void cams; void cap
  // ボタンは常に押せるようにする。
  // クリックすると useCameraDevice.selectPreset が 3 段階で実現を試みる：
  //   ① 現在のカメラの applyConstraints({ zoom })
  //   ② 現在のカメラを zoom 初期制約付きで再オープン（PTZ 許可後に有効化されるケース）
  //   ③ 別の背面カメラに巡回（Pixel の超広角は別 deviceId）
  // 真の非対応はクリック後の presetNote でユーザにフィードバックする。
  return PRESET_LEVELS.slice()
}
