import type { CameraDeviceState } from '../hooks/useCameraDevice'

/**
 * 共通カメラコントロール：
 *  - 0.5× / 1× / 2× / 5× の論理ズーム プリセット（使えるものだけ）
 *  - 細かいズーム調整スライダー
 *  - 利用可能な背面カメラ一覧（融合／超広角／標準／望遠）
 *
 * useCameraDevice フックの結果を渡すだけで動く。
 */
export function CameraToolbar({ cam, disabled, compact }: {
  cam: CameraDeviceState
  /** 録画中など、切替を禁止したい時。 */
  disabled?: boolean
  /** スペースを節約する縦長レイアウト。 */
  compact?: boolean
}) {
  const HINT_LABEL: Record<string, string> = {
    FUSED: '🔁 融合（0.5–5×）',
    ULTRA_WIDE: '🌐 超広角 0.5×',
    WIDE: '📐 広角 1×',
    STANDARD: '📷 標準',
    TELE: '🔭 望遠 2–5×',
  }

  const hardwareSupported = cam.zoomCap.supported
  const sliderZoom = hardwareSupported ? cam.zoomCap.current : cam.digitalZoom
  const sliderMin = hardwareSupported ? cam.zoomCap.min : 1
  const sliderMax = hardwareSupported ? cam.zoomCap.max : 3
  const sliderStep = hardwareSupported ? cam.zoomCap.step : 0.1

  return (
    <div className={`bg-court-card rounded-xl p-3 space-y-2 ${disabled ? 'opacity-50 pointer-events-none' : ''}`}>
      {/* プリセット 0.5×/1×/2×/5× */}
      <div>
        <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
          <span>📏 ズーム プリセット</span>
          <span className="font-mono text-court-info">
            {sliderZoom.toFixed(1)}×
            {!hardwareSupported && <span className="text-[9px] text-gray-500"> (CSS)</span>}
          </span>
        </div>
        <div className="grid grid-cols-4 gap-1.5">
          {[0.5, 1, 2, 5].map(z => {
            const isAvail = cam.availablePresets.includes(z)
            const isActive = Math.abs(cam.currentPreset - z) < 0.01
            return (
              <button key={z}
                onClick={() => cam.selectPreset(z)}
                disabled={!isAvail}
                title={isAvail ? '' : 'この端末では非対応です'}
                className={`py-2 rounded text-sm font-bold ${
                  isActive ? 'bg-court-accent text-white' :
                  isAvail ? 'bg-court-surface text-gray-300' :
                  'bg-court-surface/50 text-gray-600'
                }`}>
                {z === 0.5 ? '0.5×' : `${z}×`}
              </button>
            )
          })}
        </div>
        {cam.presetNote && (
          <div className={`text-[10px] mt-1 rounded px-2 py-1 ${cam.presetNote.startsWith('✅') ? 'bg-emerald-900/50 text-emerald-200' : 'bg-blue-900/50 text-blue-200'}`}>
            {cam.presetNote}
          </div>
        )}
        {!cam.availablePresets.includes(0.5) && (
          <div className="text-[10px] text-gray-500 mt-1">
            ℹ️ 0.5× には超広角カメラが必要です（背面カメラが 1 台のみの端末では使えません）。
          </div>
        )}
      </div>

      {/* 細かいスライダー */}
      <div>
        <div className="flex items-center gap-2">
          <button onClick={() => cam.setZoom(Math.max(sliderMin, sliderZoom - sliderStep))}
            className="w-8 h-8 bg-court-surface text-white rounded text-lg active:scale-95">−</button>
          <input type="range"
            min={sliderMin} max={sliderMax} step={sliderStep}
            value={sliderZoom}
            onChange={e => cam.setZoom(Number(e.target.value))}
            className="flex-1 accent-court-accent" />
          <button onClick={() => cam.setZoom(Math.min(sliderMax, sliderZoom + sliderStep))}
            className="w-8 h-8 bg-court-surface text-white rounded text-lg active:scale-95">＋</button>
        </div>
        <div className="text-[10px] text-gray-500 text-center mt-0.5">
          {hardwareSupported
            ? '光学／デジタル：カメラの実ズームを変更します'
            : 'この端末は光学ズーム非対応。CSS で見た目だけ拡大します（解析精度は変化なし）'}
        </div>
      </div>

      {/* カメラ一覧 */}
      {cam.cameras.length > 1 && (
        <div>
          <div className="text-xs text-gray-400 mb-1">📷 利用可能なカメラ</div>
          <div className={compact ? 'space-y-1' : 'grid grid-cols-2 gap-1.5'}>
            {cam.cameras.map((c, i) => (
              <button key={c.deviceId} onClick={() => cam.switchTo(c.deviceId)}
                className={`py-1.5 px-2 rounded text-xs text-left ${
                  c.deviceId === cam.activeDeviceId ? 'bg-court-accent text-white' : 'bg-court-surface text-gray-300'
                }`}>
                <div className="font-bold">{HINT_LABEL[c.hint] ?? `📷 カメラ ${i + 1}`}</div>
                <div className="text-[9px] opacity-70 truncate">{c.label}</div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
