import { useEffect, useRef } from 'react'
import type { Scenario } from '../tactics/types'
import {
  sampleBall, sampleDangerZone, samplePlayer,
} from '../tactics/interpolate'

export type CameraMode = 'DRONE' | 'POV'

interface Props {
  scenario: Scenario
  tMs: number              // 現在の再生時刻
  cameraMode: CameraMode
  showLabels?: boolean
}

/**
 * Three.js による戦術ボード。three は dynamic import なのでこのコンポーネントが
 * マウントされたときだけバンドルがロードされる。
 *
 * 設計：
 *  - シーンを一度作って useRef に保持
 *  - tMs / scenario / cameraMode が変わるたびに setFrame() でオブジェクト位置を更新
 *  - 自前 RAF は使わず、親の setTMs によって再レンダリングされる
 *    （※ Three.js 側は render を呼ぶだけ、状態は外）
 */
export function TacticalBoard3D({ scenario, tMs, cameraMode, showLabels = true }: Props) {
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
      const ctx = createScene(THREE, host)
      ctxRef.current = ctx
      const onResize = () => {
        const w = host.clientWidth
        const h = host.clientHeight
        if (w !== lastSizeRef.current.w || h !== lastSizeRef.current.h) {
          lastSizeRef.current = { w, h }
          ctx.renderer.setSize(w, h)
          ctx.camera.aspect = w / Math.max(1, h)
          ctx.camera.updateProjectionMatrix()
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
  }, [])

  // シナリオが変わったら選手・ボールの数や色を更新
  useEffect(() => {
    const ctx = ctxRef.current
    if (!ctx) return
    ctx.setScenario(scenario, showLabels)
    ctx.render()
  }, [scenario, showLabels])

  // 時刻 / カメラモード変更で位置更新→レンダ
  useEffect(() => {
    const ctx = ctxRef.current
    if (!ctx) return
    ctx.setCameraMode(cameraMode)
    ctx.setFrame(scenario, tMs)
    ctx.render()
  }, [tMs, cameraMode, scenario])

  return (
    <div ref={hostRef}
      className="relative w-full bg-gradient-to-b from-sky-900 to-emerald-950 rounded-xl overflow-hidden"
      style={{ aspectRatio: '16/10' }}
    />
  )
}

// ── Three.js シーン管理 ─────────────────────────────────────

type ThreeModule = typeof import('three')

interface SceneCtx {
  renderer: any
  scene: any
  camera: any    // drone
  povCamera: any
  setScenario: (s: Scenario, showLabels: boolean) => void
  setFrame: (s: Scenario, tMs: number) => void
  setCameraMode: (m: CameraMode) => void
  render: () => void
  dispose: () => void
  onCleanup?: () => void
}

function createScene(THREE: ThreeModule, host: HTMLElement): SceneCtx {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setClearColor(0x0a1a0a, 1)
  host.appendChild(renderer.domElement)

  const scene = new THREE.Scene()
  scene.fog = new THREE.Fog(0x0a1a0a, 35, 80)

  // 環境光
  scene.add(new THREE.AmbientLight(0xffffff, 0.7))
  const dir = new THREE.DirectionalLight(0xffffff, 0.6)
  dir.position.set(8, 15, 5)
  scene.add(dir)

  // コート
  buildCourt(THREE, scene)

  // カメラ：俯瞰
  const camera = new THREE.PerspectiveCamera(45, 16 / 10, 0.1, 200)
  camera.position.set(0, 22, 18)
  camera.lookAt(0, 0, 0)

  // カメラ：プレイヤー視点
  const povCamera = new THREE.PerspectiveCamera(70, 16 / 10, 0.05, 100)
  povCamera.position.set(0, 1.7, -10.5)
  povCamera.lookAt(0, 1.0, 10)

  // 動的オブジェクト
  const ball = buildBall(THREE)
  scene.add(ball)
  const playerObjs = new Map<string, any>()   // role -> { group, label }
  const dangerZone = buildDangerZone(THREE)
  scene.add(dangerZone)

  let currentCamera: any = camera

  const setCameraMode = (m: CameraMode) => {
    currentCamera = m === 'DRONE' ? camera : povCamera
  }

  const setScenario = (s: Scenario, _showLabels: boolean) => {
    // 既存プレイヤーをクリア
    for (const [, obj] of playerObjs) scene.remove(obj)
    playerObjs.clear()
    for (const p of s.players) {
      const g = buildPlayer(THREE, p.color, p.label, p.role === 'YOU')
      scene.add(g)
      playerObjs.set(p.role, g)
    }
  }

  const setFrame = (s: Scenario, tMs: number) => {
    // ボール
    const bp = sampleBall(s.ballPath, tMs)
    if (bp) {
      ball.position.set(bp[0], Math.max(0.1, bp[1] + 0.1), bp[2])
    }
    // プレイヤー
    for (const p of s.players) {
      const obj = playerObjs.get(p.role)
      if (!obj) continue
      const sp = samplePlayer(p.keyframes, tMs)
      if (sp) {
        obj.position.set(sp.pos[0], 0, sp.pos[1])
        obj.rotation.y = sp.facing
      }
    }
    // デンジャーゾーン
    const dz = sampleDangerZone(s.dangerZones, tMs)
    if (dz && dz.visible && dz.radius > 0.05) {
      dangerZone.position.set(dz.center[0], 0.02, dz.center[1])
      dangerZone.scale.set(dz.radius, 1, dz.radius)
      dangerZone.visible = true
      // パルス
      const pulse = 0.7 + 0.3 * Math.sin(tMs * 0.005)
      ;(dangerZone.material as any).opacity = pulse * 0.55
    } else {
      dangerZone.visible = false
    }
    // POV カメラ：YOU の位置から相手方向を見る
    const you = s.players.find(p => p.role === 'YOU')
    if (you) {
      const sp = samplePlayer(you.keyframes, tMs)
      if (sp) {
        povCamera.position.set(sp.pos[0], 1.7, sp.pos[1])
        povCamera.lookAt(0, 1.2, sp.pos[1] > 0 ? -5 : 5)
      }
    }
  }

  const render = () => {
    renderer.render(scene, currentCamera)
  }

  const dispose = () => {
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

  return { renderer, scene, camera, povCamera, setScenario, setFrame, setCameraMode, render, dispose }
}

function buildCourt(THREE: ThreeModule, scene: any) {
  // 外周エリア（草）
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(40, 40),
    new THREE.MeshStandardMaterial({ color: 0x0a3a1a }),
  )
  ground.rotation.x = -Math.PI / 2
  ground.position.y = -0.001
  scene.add(ground)

  // コート本体（ハードコート色）
  const court = new THREE.Mesh(
    new THREE.PlaneGeometry(11, 24),
    new THREE.MeshStandardMaterial({ color: 0x1e6fa5 }),
  )
  court.rotation.x = -Math.PI / 2
  court.position.y = 0.001
  scene.add(court)

  // ラインを白で
  const lineMat = new THREE.LineBasicMaterial({ color: 0xffffff })

  const addLine = (...pts: [number, number, number][]) => {
    const g = new THREE.BufferGeometry().setFromPoints(
      pts.map(p => new THREE.Vector3(...p))
    )
    const line = new THREE.Line(g, lineMat)
    scene.add(line)
  }

  const yL = 0.02
  // ダブルスサイドライン
  addLine([-5.485, yL, -11.885], [-5.485, yL, 11.885])
  addLine([5.485, yL, -11.885], [5.485, yL, 11.885])
  // シングルスサイドライン
  addLine([-4.115, yL, -11.885], [-4.115, yL, 11.885])
  addLine([4.115, yL, -11.885], [4.115, yL, 11.885])
  // ベースライン
  addLine([-5.485, yL, -11.885], [5.485, yL, -11.885])
  addLine([-5.485, yL, 11.885], [5.485, yL, 11.885])
  // サービスライン
  addLine([-4.115, yL, -6.4], [4.115, yL, -6.4])
  addLine([-4.115, yL, 6.4], [4.115, yL, 6.4])
  // センターサービスライン
  addLine([0, yL, -6.4], [0, yL, 6.4])
  // T
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
  // 影代わりの円
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
  // 胴体
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.25, 0.85, 4, 8),
    new THREE.MeshStandardMaterial({ color, roughness: 0.6 }),
  )
  body.position.y = 0.85
  g.add(body)
  // 頭
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.2, 12, 8),
    new THREE.MeshStandardMaterial({ color: 0xfde9c0, roughness: 0.7 }),
  )
  head.position.y = 1.7
  g.add(head)
  // 「あなた」マーカー
  if (isYou) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.45, 0.6, 24),
      new THREE.MeshBasicMaterial({ color: 0xffeb3b, side: THREE.DoubleSide, transparent: true, opacity: 0.85 }),
    )
    ring.rotation.x = -Math.PI / 2
    ring.position.y = 0.03
    g.add(ring)
  }
  // 影
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
  // ネオンレッドの脈動円
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
