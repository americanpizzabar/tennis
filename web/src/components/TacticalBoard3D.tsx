import { useEffect, useRef } from 'react'
import type { Scenario } from '../tactics/types'
import {
  sampleBall, sampleDangerZone, samplePlayer, sampleTargetGate,
} from '../tactics/interpolate'
import { buildSectorVertices } from '../tactics/visionCone'

export type CameraMode = 'DRONE' | 'POV'

interface Props {
  scenario: Scenario
  tMs: number
  cameraMode: CameraMode
  /** POV モード時、誰の視点に入るか。未指定なら YOU。 */
  povRole?: 'YOU' | 'PARTNER' | 'OPP1' | 'OPP2'
  showLabels?: boolean
  /** プレイヤーをタップしたとき：そのプレイヤーの POV にダイブ。 */
  onPlayerTap?: (role: 'YOU' | 'PARTNER' | 'OPP1' | 'OPP2') => void
  /** ピンチイン（指をすぼめる）でドローンへ。 */
  onPinchOut?: () => void
  /** プレッシャー効果（POV のみで適用）。 */
  pressureLevel?: number
}

/**
 * Three.js による高精度戦術ボード。
 *
 * 視野コーン、ターゲットゲート、滑らかカメラ遷移、タップ/ピンチ操作に対応。
 * three は dynamic import なのでこのコンポーネントがマウントされたときだけ
 * バンドルがロードされる。
 */
export function TacticalBoard3D({
  scenario, tMs, cameraMode, povRole = 'YOU', showLabels = true,
  onPlayerTap, onPinchOut, pressureLevel = 0,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const ctxRef = useRef<SceneCtx | null>(null)
  const lastSizeRef = useRef({ w: 0, h: 0 })

  // 初期化
  useEffect(() => {
    let cancelled = false
    const init = async () => {
      const THREE = await import('three')
      if (cancelled || !hostRef.current) return
      const host = hostRef.current
      const ctx = createScene(THREE, host, {
        onPlayerTap,
        onPinchOut,
      })
      ctxRef.current = ctx
      const onResize = () => {
        const w = host.clientWidth
        const h = host.clientHeight
        if (w !== lastSizeRef.current.w || h !== lastSizeRef.current.h) {
          lastSizeRef.current = { w, h }
          ctx.renderer.setSize(w, h)
          ctx.droneCamera.aspect = w / Math.max(1, h)
          ctx.droneCamera.updateProjectionMatrix()
          ctx.povCamera.aspect = w / Math.max(1, h)
          ctx.povCamera.updateProjectionMatrix()
          ctx.render()
        }
      }
      onResize()
      const ro = new ResizeObserver(onResize)
      ro.observe(host)
      ctx.onCleanup = () => ro.disconnect()
    }
    init()
    return () => {
      cancelled = true
      const c = ctxRef.current
      if (c) {
        c.onCleanup?.()
        c.dispose()
        ctxRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ハンドラ参照を更新
  useEffect(() => {
    const ctx = ctxRef.current
    if (!ctx) return
    ctx.setHandlers(onPlayerTap, onPinchOut)
  }, [onPlayerTap, onPinchOut])

  // シナリオが変わったらシーン再構築
  useEffect(() => {
    const ctx = ctxRef.current
    if (!ctx) return
    ctx.setScenario(scenario, showLabels)
    ctx.render()
  }, [scenario, showLabels])

  // 時刻 / カメラモード / POV ロール変更で更新
  useEffect(() => {
    const ctx = ctxRef.current
    if (!ctx) return
    ctx.setCameraTarget(cameraMode, povRole)
    ctx.setFrame(scenario, tMs)
    ctx.render()
  }, [tMs, cameraMode, povRole, scenario])

  // プレッシャー効果
  useEffect(() => {
    const ctx = ctxRef.current
    if (!ctx) return
    ctx.setPressure(pressureLevel)
    ctx.render()
  }, [pressureLevel])

  // POV モード時のトンネル視野を CSS で重ねる
  const tunnelOpacity = cameraMode === 'POV' ? Math.min(0.9, pressureLevel) : 0

  return (
    <div className="relative w-full" style={{ aspectRatio: '16/10' }}>
      <div
        ref={hostRef}
        className="absolute inset-0 bg-gradient-to-b from-sky-900 to-emerald-950 rounded-xl overflow-hidden"
      />
      {/* トンネル視野（プレッシャー演出） */}
      <div
        className="absolute inset-0 pointer-events-none rounded-xl transition-opacity duration-500"
        style={{
          opacity: tunnelOpacity,
          background:
            'radial-gradient(ellipse at center, transparent 30%, rgba(0,0,0,0.95) 90%)',
        }}
      />
      {/* カメラモード切替バッジ */}
      <div className="absolute top-2 left-2 bg-black/60 text-xs text-white px-2 py-1 rounded pointer-events-none">
        {cameraMode === 'DRONE' ? '🛸 俯瞰' : `👁 ${povRoleLabel(povRole)}視点`}
      </div>
      {/* 操作ヒント */}
      <div className="absolute bottom-2 right-2 bg-black/60 text-xs text-white/70 px-2 py-1 rounded pointer-events-none">
        {cameraMode === 'DRONE' ? 'プレイヤーをタップ → POV' : 'ピンチイン → 俯瞰'}
      </div>
    </div>
  )
}

function povRoleLabel(r: string): string {
  switch (r) {
    case 'YOU': return 'あなた'
    case 'PARTNER': return 'パートナー'
    case 'OPP1': return '相手1'
    case 'OPP2': return '相手2'
    default: return ''
  }
}

// ── Three.js シーン管理 ─────────────────────────────────────

type ThreeModule = typeof import('three')

interface Handlers {
  onPlayerTap?: (role: 'YOU' | 'PARTNER' | 'OPP1' | 'OPP2') => void
  onPinchOut?: () => void
}

interface SceneCtx {
  renderer: any
  scene: any
  droneCamera: any
  povCamera: any
  setScenario: (s: Scenario, showLabels: boolean) => void
  setFrame: (s: Scenario, tMs: number) => void
  setCameraTarget: (m: CameraMode, povRole: string) => void
  setHandlers: (a?: Handlers['onPlayerTap'], b?: Handlers['onPinchOut']) => void
  setPressure: (level: number) => void
  render: () => void
  dispose: () => void
  onCleanup?: () => void
}

interface CameraTween {
  startPos: any
  endPos: any
  startTarget: any
  endTarget: any
  startMs: number
  durationMs: number
}

function createScene(THREE: ThreeModule, host: HTMLElement, handlers: Handlers): SceneCtx {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setClearColor(0x0a1a0a, 1)
  host.appendChild(renderer.domElement)

  const scene = new THREE.Scene()
  scene.fog = new THREE.Fog(0x0a1a0a, 35, 80)

  // ライト
  scene.add(new THREE.AmbientLight(0xffffff, 0.7))
  const dir = new THREE.DirectionalLight(0xffffff, 0.6)
  dir.position.set(8, 15, 5)
  scene.add(dir)

  buildCourt(THREE, scene)

  // カメラ
  const droneCamera = new THREE.PerspectiveCamera(45, 16 / 10, 0.1, 200)
  droneCamera.position.set(0, 22, 18)
  droneCamera.lookAt(0, 0, 0)
  const povCamera = new THREE.PerspectiveCamera(70, 16 / 10, 0.05, 100)
  povCamera.position.set(0, 1.7, -10.5)
  povCamera.lookAt(0, 1.0, 10)

  let currentCamera: any = droneCamera

  // 動的オブジェクト
  const ball = buildBall(THREE)
  scene.add(ball)
  const playerObjs = new Map<string, any>()
  const visionCones = new Map<string, any>()
  const dangerZone = buildDangerZone(THREE)
  scene.add(dangerZone)
  const targetGate = buildTargetGate(THREE)
  scene.add(targetGate)

  // ターゲットゲートラベル用スプライト
  const gateLabel = buildLabelSprite(THREE, '')
  gateLabel.visible = false
  scene.add(gateLabel)

  // カメラトゥイーン
  let tween: CameraTween | null = null
  const tweenTargetVec = new THREE.Vector3()
  const tweenPosVec = new THREE.Vector3()

  // ── インタラクション ──────────────
  const raycaster = new THREE.Raycaster()
  const mouse = new THREE.Vector2()
  let h = handlers

  const onClick = (e: PointerEvent) => {
    if (e.pointerType === 'touch' && e.isPrimary === false) return
    const rect = renderer.domElement.getBoundingClientRect()
    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
    mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
    raycaster.setFromCamera(mouse, currentCamera)
    const candidates: any[] = []
    for (const [, obj] of playerObjs) candidates.push(obj)
    const intersects = raycaster.intersectObjects(candidates, true)
    if (intersects.length > 0 && h.onPlayerTap) {
      // 親グループを探す
      let g: any = intersects[0].object
      while (g && !g.userData?.role) g = g.parent
      if (g?.userData?.role) {
        h.onPlayerTap(g.userData.role)
      }
    }
  }

  // ピンチ：2 本指で広げる
  let pinchStartDist = 0
  const onTouchStart = (e: TouchEvent) => {
    if (e.touches.length === 2) {
      pinchStartDist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY,
      )
    }
  }
  const onTouchMove = (e: TouchEvent) => {
    if (e.touches.length === 2 && pinchStartDist > 0) {
      const d = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY,
      )
      const delta = d - pinchStartDist
      // 指を広げる（ピンチアウト）でも、すぼめる（ピンチイン）でも俯瞰へ
      if (Math.abs(delta) > 40) {
        h.onPinchOut?.()
        pinchStartDist = 0
      }
    }
  }
  const onTouchEnd = () => { pinchStartDist = 0 }

  renderer.domElement.addEventListener('pointerdown', onClick)
  renderer.domElement.addEventListener('touchstart', onTouchStart, { passive: true })
  renderer.domElement.addEventListener('touchmove', onTouchMove, { passive: true })
  renderer.domElement.addEventListener('touchend', onTouchEnd)

  // ── API ──────────────
  const setScenario = (s: Scenario, _showLabels: boolean) => {
    for (const [, obj] of playerObjs) scene.remove(obj)
    playerObjs.clear()
    for (const [, vc] of visionCones) scene.remove(vc)
    visionCones.clear()
    for (const p of s.players) {
      const g = buildPlayer(THREE, p.color, p.label, p.role === 'YOU')
      g.userData = { role: p.role }
      scene.add(g)
      playerObjs.set(p.role, g)
      // 視野コーン
      const cone = buildVisionCone(THREE, p.color)
      cone.visible = s.visionConesOf !== 'NONE'
      scene.add(cone)
      visionCones.set(p.role, cone)
    }
  }

  const setFrame = (s: Scenario, tMs: number) => {
    // ボール
    const bp = sampleBall(s.ballPath, tMs)
    if (bp) ball.position.set(bp[0], Math.max(0.1, bp[1] + 0.1), bp[2])

    // プレイヤー＋視野コーン
    const playerPositions = new Map<string, [number, number, number]>()
    for (const p of s.players) {
      const obj = playerObjs.get(p.role)
      if (!obj) continue
      const sp = samplePlayer(p.keyframes, tMs)
      if (sp) {
        obj.position.set(sp.pos[0], 0, sp.pos[1])
        obj.rotation.y = sp.facing
        playerPositions.set(p.role, [sp.pos[0], 0, sp.pos[1]])
      }
      // 視野コーンを足元に追従、コートの相手方向を向ける
      const cone = visionCones.get(p.role)
      if (cone) {
        const shouldShow =
          s.visionConesOf === 'ALL' ||
          s.visionConesOf === p.role ||
          (s.visionConesOf === undefined)
        cone.visible = shouldShow && s.visionConesOf !== 'NONE'
        if (shouldShow) {
          cone.position.copy(obj.position)
          // 自分側プレイヤーは +z 方向（相手側）を見るので facing は 0、相手側は -z
          // facing がボールを見ているなら facing そのままで OK
          cone.rotation.y = obj.rotation.y
        }
      }
    }

    // デンジャーゾーン
    const dz = sampleDangerZone(s.dangerZones, tMs)
    if (dz && dz.visible && dz.radius > 0.05) {
      dangerZone.position.set(dz.center[0], 0.02, dz.center[1])
      dangerZone.scale.set(dz.radius, 1, dz.radius)
      dangerZone.visible = true
      const pulse = 0.7 + 0.3 * Math.sin(tMs * 0.005)
      ;(dangerZone.material as any).opacity = pulse * 0.55
    } else {
      dangerZone.visible = false
    }

    // ターゲットゲート
    if (s.targetGates && s.targetGates.length > 0) {
      const g = sampleTargetGate(s.targetGates, tMs)
      if (g && g.visible && g.radius > 0.05) {
        targetGate.position.set(g.pos[0], g.pos[1], g.pos[2])
        // 法線方向に向ける
        const normal = new THREE.Vector3(g.normal[0], g.normal[1], g.normal[2]).normalize()
        const up = new THREE.Vector3(0, 1, 0)
        const q = new THREE.Quaternion().setFromUnitVectors(up, normal)
        targetGate.quaternion.copy(q)
        targetGate.scale.set(g.radius, g.radius, g.radius)
        targetGate.visible = true
        // パルス
        const pulse = 0.8 + 0.2 * Math.sin(tMs * 0.007)
        ;(targetGate.material as any).opacity = pulse * 0.85
        ;(targetGate.material as any).emissiveIntensity = pulse * 0.7
        // ラベル
        if (g.label) {
          gateLabel.position.set(g.pos[0], g.pos[1] + g.radius + 0.4, g.pos[2])
          ;(gateLabel.userData.setText as any)?.(g.label)
          gateLabel.visible = true
        } else {
          gateLabel.visible = false
        }
      } else {
        targetGate.visible = false
        gateLabel.visible = false
      }
    } else {
      targetGate.visible = false
      gateLabel.visible = false
    }

    // トゥイーン処理
    if (tween) {
      const elapsed = performance.now() - tween.startMs
      const t = Math.min(1, elapsed / tween.durationMs)
      const e = easeInOutCubic(t)
      tweenPosVec.copy(tween.startPos).lerp(tween.endPos, e)
      tweenTargetVec.copy(tween.startTarget).lerp(tween.endTarget, e)
      currentCamera.position.copy(tweenPosVec)
      currentCamera.lookAt(tweenTargetVec)
      if (t >= 1) tween = null
    }
  }

  const setCameraTarget = (mode: CameraMode, povRole: string) => {
    const targetPos = new THREE.Vector3()
    const targetLook = new THREE.Vector3()
    if (mode === 'DRONE') {
      targetPos.set(0, 22, 18)
      targetLook.set(0, 0, 0)
    } else {
      // POV：指定された役の足元 +1.7m に
      const obj = playerObjs.get(povRole) ?? playerObjs.get('YOU')
      if (obj) {
        targetPos.set(obj.position.x, 1.7, obj.position.z)
        // ネット方向を見る
        const lookZ = obj.position.z > 0 ? -5 : 5
        targetLook.set(0, 1.2, lookZ)
      } else {
        targetPos.set(0, 1.7, -10.5)
        targetLook.set(0, 1.2, 10)
      }
    }
    currentCamera = mode === 'DRONE' ? droneCamera : povCamera
    // トゥイーン起動
    tween = {
      startPos: currentCamera.position.clone(),
      endPos: targetPos.clone(),
      startTarget: currentCamera.getWorldDirection(new THREE.Vector3()).add(currentCamera.position),
      endTarget: targetLook.clone(),
      startMs: performance.now(),
      durationMs: 700,
    }
  }

  const setHandlers = (a?: Handlers['onPlayerTap'], b?: Handlers['onPinchOut']) => {
    h = { onPlayerTap: a, onPinchOut: b }
  }

  let pressureLvl = 0
  const setPressure = (l: number) => {
    pressureLvl = l
  }

  const render = () => {
    // pressureLvl による FOV 微調整（緊張で視野が狭くなる）
    if (currentCamera === povCamera && pressureLvl > 0) {
      povCamera.fov = 70 - pressureLvl * 15
      povCamera.updateProjectionMatrix()
    } else {
      povCamera.fov = 70
      povCamera.updateProjectionMatrix()
    }
    renderer.render(scene, currentCamera)
  }

  const dispose = () => {
    renderer.domElement.removeEventListener('pointerdown', onClick)
    renderer.domElement.removeEventListener('touchstart', onTouchStart)
    renderer.domElement.removeEventListener('touchmove', onTouchMove)
    renderer.domElement.removeEventListener('touchend', onTouchEnd)
    renderer.dispose()
    if (renderer.domElement.parentElement === host) {
      host.removeChild(renderer.domElement)
    }
    scene.traverse((obj: any) => {
      if (obj.geometry) obj.geometry.dispose()
      if (obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach((m: any) => m.dispose())
        else obj.material.dispose()
      }
    })
  }

  return {
    renderer, scene, droneCamera, povCamera,
    setScenario, setFrame, setCameraTarget,
    setHandlers, setPressure, render, dispose,
  }
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

function buildCourt(THREE: ThreeModule, scene: any) {
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(40, 40),
    new THREE.MeshStandardMaterial({ color: 0x0a3a1a }),
  )
  ground.rotation.x = -Math.PI / 2
  ground.position.y = -0.001
  scene.add(ground)

  const court = new THREE.Mesh(
    new THREE.PlaneGeometry(11, 24),
    new THREE.MeshStandardMaterial({ color: 0x1e6fa5 }),
  )
  court.rotation.x = -Math.PI / 2
  court.position.y = 0.001
  scene.add(court)

  const lineMat = new THREE.LineBasicMaterial({ color: 0xffffff })
  const addLine = (...pts: [number, number, number][]) => {
    const g = new THREE.BufferGeometry().setFromPoints(
      pts.map(p => new THREE.Vector3(...p))
    )
    scene.add(new THREE.Line(g, lineMat))
  }
  const yL = 0.02
  addLine([-5.485, yL, -11.885], [-5.485, yL, 11.885])
  addLine([5.485, yL, -11.885], [5.485, yL, 11.885])
  addLine([-4.115, yL, -11.885], [-4.115, yL, 11.885])
  addLine([4.115, yL, -11.885], [4.115, yL, 11.885])
  addLine([-5.485, yL, -11.885], [5.485, yL, -11.885])
  addLine([-5.485, yL, 11.885], [5.485, yL, 11.885])
  addLine([-4.115, yL, -6.4], [4.115, yL, -6.4])
  addLine([-4.115, yL, 6.4], [4.115, yL, 6.4])
  addLine([0, yL, -6.4], [0, yL, 6.4])
  addLine([0, yL, -0.2], [0, yL, 0.2])

  // ネット
  const netGroup = new THREE.Group()
  const netPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(11, 1.07),
    new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0.5, side: THREE.DoubleSide,
    }),
  )
  netPlane.position.set(0, 0.535, 0)
  netGroup.add(netPlane)
  const post1 = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.05, 1.07),
    new THREE.MeshStandardMaterial({ color: 0x444444 }),
  )
  post1.position.set(-5.485, 0.535, 0)
  netGroup.add(post1)
  const post2 = post1.clone()
  post2.position.set(5.485, 0.535, 0)
  netGroup.add(post2)
  scene.add(netGroup)
}

function buildBall(THREE: ThreeModule) {
  const g = new THREE.Group()
  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(0.12, 16, 12),
    new THREE.MeshStandardMaterial({ color: 0xd2f04a, emissive: 0x556600, roughness: 0.7 }),
  )
  g.add(sphere)
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.15, 16),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3 }),
  )
  shadow.rotation.x = -Math.PI / 2
  shadow.position.y = -0.1
  g.add(shadow)
  return g
}

function buildPlayer(THREE: ThreeModule, color: string, label: string, isYou: boolean) {
  const g = new THREE.Group()
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.25, 0.85, 4, 8),
    new THREE.MeshStandardMaterial({ color, roughness: 0.6 }),
  )
  body.position.y = 0.85
  g.add(body)
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.2, 12, 8),
    new THREE.MeshStandardMaterial({ color: 0xfde9c0, roughness: 0.7 }),
  )
  head.position.y = 1.7
  g.add(head)
  if (isYou) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.45, 0.6, 24),
      new THREE.MeshBasicMaterial({
        color: 0xffeb3b, side: THREE.DoubleSide,
        transparent: true, opacity: 0.85,
      }),
    )
    ring.rotation.x = -Math.PI / 2
    ring.position.y = 0.03
    g.add(ring)
  }
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.35, 16),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35 }),
  )
  shadow.rotation.x = -Math.PI / 2
  shadow.position.y = 0.01
  g.add(shadow)
  ;(g as any).userData = { label }
  return g
}

function buildDangerZone(THREE: ThreeModule) {
  const geom = new THREE.RingGeometry(0.7, 1.0, 64)
  const mat = new THREE.MeshBasicMaterial({
    color: 0xff3344,
    transparent: true,
    opacity: 0.55,
    side: THREE.DoubleSide,
    depthWrite: false,
  })
  const m = new THREE.Mesh(geom, mat)
  m.rotation.x = -Math.PI / 2
  m.visible = false
  return m
}

function buildTargetGate(THREE: ThreeModule) {
  // 光るホログラム的なリング
  const geom = new THREE.TorusGeometry(1, 0.08, 16, 48)
  const mat = new THREE.MeshStandardMaterial({
    color: 0x00e676,
    emissive: 0x00ff88,
    emissiveIntensity: 0.7,
    transparent: true,
    opacity: 0.9,
    side: THREE.DoubleSide,
  })
  const m = new THREE.Mesh(geom, mat)
  m.visible = false
  return m
}

function buildVisionCone(THREE: ThreeModule, color: string) {
  // 200° 視野角の扇形を地面上に描画
  const { positions, indices } = buildSectorVertices(4.5, 200, 48)
  const geom = new THREE.BufferGeometry()
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geom.setIndex(new THREE.BufferAttribute(indices, 1))
  geom.computeVertexNormals()
  const mat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.10,
    side: THREE.DoubleSide,
    depthWrite: false,
  })
  const m = new THREE.Mesh(geom, mat)
  m.position.y = 0.015
  return m
}

function buildLabelSprite(THREE: ThreeModule, text: string) {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 128
  const ctx = canvas.getContext('2d')!
  const draw = (t: string) => {
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.font = 'bold 64px sans-serif'
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = '#00e676'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(t, canvas.width / 2, canvas.height / 2)
  }
  draw(text)
  const texture = new THREE.CanvasTexture(canvas)
  const material = new THREE.SpriteMaterial({ map: texture, depthWrite: false })
  const sprite = new THREE.Sprite(material)
  sprite.scale.set(2.5, 0.6, 1)
  ;(sprite as any).userData = {
    setText: (t: string) => {
      draw(t)
      texture.needsUpdate = true
    },
  }
  return sprite
}
