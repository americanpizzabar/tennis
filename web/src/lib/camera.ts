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
  /**
   * ラベルから推測した役割。
   *  - FUSED：複数レンズを融合した「Triple／Dual Camera」（iOS 系で 0.5×〜5× をサポート）
   *  - ULTRA_WIDE：0.5× 超広角単焦点
   *  - WIDE：1× 標準（広角）単焦点
   *  - TELE：望遠（2×／3×／5×）
   *  - STANDARD：不明だが何らかの単焦点
   */
  hint: 'FUSED' | 'ULTRA_WIDE' | 'WIDE' | 'TELE' | 'STANDARD'
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
      if (/back|rear|environment|背面/.test(lower)) facing = 'environment'
      else if (/front|user|face|前面/.test(lower)) facing = 'user'
      let hint: CameraDeviceInfo['hint'] = 'STANDARD'
      // 「Back Triple Camera」「背面トリプルカメラ」などの融合カメラ（0.5×可）を優先判定
      if (/triple|dual|トリプル|デュアル/.test(lower)) hint = 'FUSED'
      else if (/ultra[\s-]?wide|超広角|0[.,]5x?/.test(lower)) hint = 'ULTRA_WIDE'
      else if (/tele|望遠|telephoto|[2-9]x|zoom/.test(lower)) hint = 'TELE'
      else if (/wide|広角/.test(lower)) hint = 'WIDE'
      return { deviceId: d.deviceId, label: d.label || '不明なカメラ', facing, hint }
    })
}

/** 背面カメラだけを「0.5×が使えそうな順」に並べ替えて返す。 */
export function backCameras(cams: CameraDeviceInfo[]): CameraDeviceInfo[] {
  const back = cams.filter(c => c.facing === 'environment' || c.facing === 'unknown')
  // FUSED（0.5×〜マルチ）→ ULTRA_WIDE → STANDARD → WIDE → TELE
  const order: CameraDeviceInfo['hint'][] = ['FUSED', 'ULTRA_WIDE', 'STANDARD', 'WIDE', 'TELE']
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

/**
 * 「0.5× / 1× / 2× / 5×」のような論理ズームレベルを、
 * その端末で「どのカメラ × どのハードウェアズーム値」で実現するかに変換。
 *
 * - 0.5× を実現できる順位：FUSED（min=0.5）＞ ULTRA_WIDE 単独
 * - 1×：FUSED または STANDARD／WIDE
 * - 2× 以上：FUSED で zoom 設定／TELE 単独
 *
 * 戻り値の `deviceId` に切替え、ストリームを開いてから zoom を適用する。
 */
export interface LogicalZoomPlan {
  deviceId: string
  /** ハードウェアズームで設定する値（カメラ側の min..max にクランプ）。 */
  hardwareZoom?: number
  /** どのカメラを使うかの説明。 */
  rationale: string
}

export function planLogicalZoom(
  level: number, cams: CameraDeviceInfo[],
): LogicalZoomPlan | null {
  const back = backCameras(cams)
  if (back.length === 0) return null

  // 1) 融合カメラ（0.5× 起点）があれば最優先
  const fused = back.find(c => c.hint === 'FUSED')
  // 2) 各単焦点
  const ultra = back.find(c => c.hint === 'ULTRA_WIDE')
  const wide = back.find(c => c.hint === 'WIDE')
  const standard = back.find(c => c.hint === 'STANDARD')
  const tele = back.find(c => c.hint === 'TELE')

  // 0.5× 圏
  if (level < 1) {
    if (ultra) return { deviceId: ultra.deviceId, rationale: '0.5× → 超広角カメラ' }
    if (fused) return { deviceId: fused.deviceId, hardwareZoom: 0.5, rationale: '0.5× → 融合カメラの広角端' }
    return null
  }
  // 2× 圏（望遠が望ましい）
  if (level >= 2) {
    if (tele) return { deviceId: tele.deviceId, hardwareZoom: level >= 5 ? undefined : level, rationale: `${level}× → 望遠カメラ` }
    if (fused) return { deviceId: fused.deviceId, hardwareZoom: level, rationale: `${level}× → 融合カメラ` }
    if (wide ?? standard) {
      const d = (wide ?? standard)!
      return { deviceId: d.deviceId, hardwareZoom: level, rationale: `${level}× → 標準カメラ＋デジタルズーム` }
    }
    return null
  }
  // 1× 圏：融合 or 標準
  const target = fused ?? wide ?? standard ?? back[0]
  return { deviceId: target.deviceId, hardwareZoom: 1, rationale: '1× → 標準' }
}
