/**
 * カメラ列挙・選択・ズーム制御の共通ユーティリティ。
 *
 * - 端末に複数の背面カメラ（広角／超広角／望遠）がある場合に切替えられる
 * - VideoTrack の `applyConstraints` で光学／デジタルズームを操作（対応端末のみ）
 * - 非対応端末では「拡大は CSS scale で代替」「広角は無効」など UI 側で fallback
 *
 * MediaDevices API の zoom サポート状況：
 *  - Chrome Android（多くの端末）：OK（実機テスト要）
 *  - iOS Safari：iOS 17+ でようやく一部対応、未対応端末も多い
 *  - デスクトップ：ほぼ未対応
 */

export interface CameraDeviceInfo {
  deviceId: string
  label: string
  /** 推定：'environment'（背面）/'user'（前面）/不明。 */
  facing: 'environment' | 'user' | 'unknown'
  /** ラベルから推測した役割（広角／超広角／望遠／標準）。確実ではない。 */
  hint: 'WIDE' | 'ULTRA_WIDE' | 'TELE' | 'STANDARD'
}

export interface ZoomCapability {
  supported: boolean
  min: number
  max: number
  step: number
  current: number
}

/**
 * 利用可能なカメラを列挙。
 * 注意：`enumerateDevices` は `getUserMedia` の許可後にしか label を返さないため、
 * 先に一度カメラ起動して許可を取ってから呼ぶこと。
 */
export async function listCameras(): Promise<CameraDeviceInfo[]> {
  if (!navigator.mediaDevices?.enumerateDevices) return []
  const all = await navigator.mediaDevices.enumerateDevices()
  return all
    .filter(d => d.kind === 'videoinput')
    .map(d => {
      const lower = (d.label || '').toLowerCase()
      let facing: CameraDeviceInfo['facing'] = 'unknown'
      if (/back|rear|environment|背面/i.test(d.label)) facing = 'environment'
      else if (/front|user|face|前面/i.test(d.label)) facing = 'user'
      let hint: CameraDeviceInfo['hint'] = 'STANDARD'
      if (/ultra ?wide|超広角|0\.5x/.test(lower)) hint = 'ULTRA_WIDE'
      else if (/wide|広角/.test(lower)) hint = 'WIDE'
      else if (/tele|望遠|telephoto|2x|3x|5x/.test(lower)) hint = 'TELE'
      return { deviceId: d.deviceId, label: d.label || '不明なカメラ', facing, hint }
    })
}

/** よく使う「背面の広角／超広角／望遠」を優先順序で返す。 */
export function backCameras(cams: CameraDeviceInfo[]): CameraDeviceInfo[] {
  const back = cams.filter(c => c.facing === 'environment' || c.facing === 'unknown')
  // ULTRA_WIDE → STANDARD → WIDE → TELE の順で並べる（広角優先）
  const order: CameraDeviceInfo['hint'][] = ['ULTRA_WIDE', 'STANDARD', 'WIDE', 'TELE']
  return back.sort((a, b) => order.indexOf(a.hint) - order.indexOf(b.hint))
}

/** カメラを起動する標準パターン。deviceId 指定があれば優先。 */
export async function openCamera(opts: {
  deviceId?: string
  facingMode?: 'environment' | 'user'
  audio?: boolean
  width?: number
  height?: number
}): Promise<MediaStream> {
  const videoConstraints: MediaTrackConstraints = {
    width: { ideal: opts.width ?? 1280 },
    height: { ideal: opts.height ?? 720 },
  }
  if (opts.deviceId) {
    videoConstraints.deviceId = { exact: opts.deviceId }
  } else if (opts.facingMode) {
    videoConstraints.facingMode = opts.facingMode
  }
  return navigator.mediaDevices.getUserMedia({
    video: videoConstraints,
    audio: opts.audio ?? false,
  })
}

/** トラックのズーム能力を取得（非対応なら supported:false）。 */
export function getZoomCapability(stream: MediaStream | null): ZoomCapability {
  const track = stream?.getVideoTracks()[0]
  if (!track) return { supported: false, min: 1, max: 1, step: 0.1, current: 1 }
  const caps: any = typeof track.getCapabilities === 'function' ? track.getCapabilities() : {}
  const settings: any = typeof track.getSettings === 'function' ? track.getSettings() : {}
  if (typeof caps.zoom !== 'object' || typeof caps.zoom.min !== 'number') {
    return { supported: false, min: 1, max: 1, step: 0.1, current: 1 }
  }
  return {
    supported: true,
    min: caps.zoom.min,
    max: caps.zoom.max,
    step: caps.zoom.step ?? 0.1,
    current: settings.zoom ?? caps.zoom.min,
  }
}

/** ハードウェアズームを適用（非対応端末では何もしない）。 */
export async function applyHardwareZoom(stream: MediaStream | null, zoom: number): Promise<boolean> {
  const track = stream?.getVideoTracks()[0]
  if (!track) return false
  try {
    // @ts-expect-error advanced は型定義に含まれない実験仕様
    await track.applyConstraints({ advanced: [{ zoom }] })
    return true
  } catch {
    return false
  }
}
