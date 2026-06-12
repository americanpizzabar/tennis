import { useCallback, useEffect, useRef, useState } from 'react'
import {
  listCameras, backCameras, openCamera, getZoomCapability, applyHardwareZoom,
  planLogicalZoom, type CameraDeviceInfo, type ZoomCapability,
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
  const streamRef = useRef<MediaStream | null>(null)

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

  // 起動／切替の共通ロジック
  const open = useCallback(async (deviceId?: string) => {
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
      })
      attach(newStream)
      setZoomCap(getZoomCapability(newStream))
      setDigitalZoom(1)
      const settings = newStream.getVideoTracks()[0]?.getSettings()
      setActiveId(settings?.deviceId ?? deviceId)
      // 許可後のカメラ列挙
      const cams = await listCameras()
      setCameras(backCameras(cams))
    } catch (e: any) {
      setError('カメラへのアクセスに失敗：' + (e?.message ?? String(e)))
    }
  }, [opts.audio, opts.width, opts.height, attach])

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
    const plan = planLogicalZoom(level, cameras)
    if (!plan) {
      // フォールバック：今のカメラのまま CSS デジタル
      setDigitalZoom(level)
      return
    }
    // 必要なら別カメラに切替
    if (plan.deviceId !== activeDeviceId) {
      await open(plan.deviceId)
    }
    // ハードウェアズームを適用
    if (plan.hardwareZoom != null) {
      const ok = await applyHardwareZoom(streamRef.current, plan.hardwareZoom)
      if (ok) {
        setZoomCap(c => ({ ...c, current: plan.hardwareZoom! }))
        setDigitalZoom(1)
      } else {
        // ハード非対応 → CSS で代替
        setDigitalZoom(level)
      }
    } else {
      setDigitalZoom(1)
    }
  }, [cameras, activeDeviceId, open])

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
    availablePresets, error,
    switchTo, selectPreset, setZoom, stop,
    openInitial: () => open(),
  }
}

function computeAvailablePresets(cams: CameraDeviceInfo[], cap: ZoomCapability): number[] {
  if (cams.length === 0) {
    // カメラ列挙できない場合（ラベルが取れない）。ハード zoom だけで判断。
    return PRESET_LEVELS.filter(z => z >= cap.min && z <= cap.max)
  }
  return PRESET_LEVELS.filter(z => planLogicalZoom(z, cams) !== null)
}
