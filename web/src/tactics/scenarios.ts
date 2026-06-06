import type { Scenario } from './types'
import { buildRally, RallyDef } from './rallyBuilder'

/**
 * 戦術シナリオ集。すべて buildRally で生成するため
 * 「ボールは打点かバウンドでしか方向を変えない」ことが保証される。
 *
 * 座標系（メートル）：
 *  - NEAR（自分側）= z<0、FAR（相手側）= z>0
 *  - ネット z=0、ベースライン z=±11.885、サービスライン z=±6.4
 *  - シングルス幅 ±4.115、ダブルス幅 ±5.485
 *  - y は高さ（打点 ≈ 1.0、バウンド = 0）
 */

const GREEN = '#4CAF50'
const BLUE = '#42A5F5'
const RED = '#EF5350'

// ════════════════════════════════════════════════════════════
//  シングルス
// ════════════════════════════════════════════════════════════

// ── 戻り位置（バイセクト） ──
const singlesBisect: RallyDef = {
  id: 'singles_bisect',
  category: 'SINGLES_POSITIONING',
  title: 'バイセクト戻り：ストレート深く',
  subtitle: 'ストレートに打った後の正しい戻り位置（二等分線）',
  goal: '相手が返せる最大角度を二等分する位置に戻り、オープンコートを最小化する。',
  proReference: 'ジョコビッチの基本ポジショニング。',
  rightHandedAssumption: true,
  visionConesOf: 'ALL',
  pressureRange: { startMs: 2600, endMs: 5200 },
  introBeat: '相手バック奥にストレートで深く打ちます。',
  players: [
    { role: 'YOU', label: 'あなた', side: 'NEAR', color: GREEN, home: [-1, -10.5] },
    { role: 'OPP1', label: '相手', side: 'FAR', color: RED, home: [0, 10.5] },
  ],
  contacts: [
    { tMs: 0, hitter: 'YOU', pos: [-1, 1.0, -10.5], bounce: [-3.4, 0, 9.2], bounceTMs: 1300,
      gateLabel: '深くストレート', showGate: true },
    { tMs: 2300, hitter: 'OPP1', pos: [-3.4, 1.0, 9.4], bounce: [2.6, 0, -9.0], bounceTMs: 3700,
      beat: '⚠️ センターに戻ると、相手のクロス展開で右オープンコートを突かれます。正解は二等分線上（やや左）。',
      beatEmphasized: true, danger: { center: [2.8, -8.5], radius: 3.0 } },
  ],
  endTMs: 6500,
  extraMoves: [
    // YOU が「正解の二等分線」へ戻る動き
    { role: 'YOU', tMs: 2400, pos: [-1.2, -10.2] },
    { role: 'YOU', tMs: 3600, pos: [-1.6, -10.2] },
  ],
}

// ── クロス3球→ダウンザライン（バグ修正版） ──
const singlesCrossDtl: RallyDef = {
  id: 'singles_cross_dtl',
  category: 'SINGLES_PATTERN',
  title: 'クロス3球→ダウンザライン',
  subtitle: 'クロスで揺さぶり、相手のスタンスが流れた瞬間に逆を突く',
  goal: '相手を片側に追い出してから空いた逆サイドを取る、最も基本かつ効果的なパターン。',
  proReference: 'ナダル／ティームの王道。',
  rightHandedAssumption: true,
  visionConesOf: 'ALL',
  introBeat: 'クロスラリー開始。相手を左に追い出す準備。',
  players: [
    { role: 'YOU', label: 'あなた', side: 'NEAR', color: GREEN, home: [-1, -10.5] },
    { role: 'OPP1', label: '相手', side: 'FAR', color: RED, home: [0, 10.5] },
  ],
  contacts: [
    { tMs: 0,     hitter: 'YOU',  pos: [-1, 1.0, -10.5], bounce: [-3.2, 0, 8.6], bounceTMs: 1300,
      beat: 'クロス1球目：深く厳しく' },
    { tMs: 2100,  hitter: 'OPP1', pos: [-3.2, 1.0, 9.0], bounce: [-1.8, 0, -8.5], bounceTMs: 3300 },
    { tMs: 4000,  hitter: 'YOU',  pos: [-1.8, 1.0, -9.5], bounce: [-3.9, 0, 8.6], bounceTMs: 5300,
      beat: 'クロス2球目：相手の重心が左に流れる' },
    { tMs: 6000,  hitter: 'OPP1', pos: [-3.9, 1.0, 9.0], bounce: [-2.2, 0, -8.5], bounceTMs: 7100 },
    { tMs: 7800,  hitter: 'YOU',  pos: [-2.2, 1.0, -9.5], bounce: [-4.5, 0, 9.0], bounceTMs: 9000,
      beat: 'クロス3球目：相手は完全に左寄り。逆サイドが大きく空く！', beatEmphasized: true,
      danger: { center: [3.0, 8.6], radius: 3.2 } },
    { tMs: 9600,  hitter: 'OPP1', pos: [-4.5, 1.0, 9.3], bounce: [-1.8, 0, -6.5], bounceTMs: 10600 },
    { tMs: 11100, hitter: 'YOU',  pos: [-1.8, 1.0, -6.5], bounce: [3.6, 0, 9.3], bounceTMs: 12300,
      beat: '🎯 今だ！ストレートに展開してウィナー！', beatEmphasized: true,
      gateLabel: '🎯 ストレート！', showGate: true, danger: { center: [3.6, 9.0], radius: 2.0 } },
  ],
  endTMs: 13500,
  extraMoves: [
    { role: 'OPP1', tMs: 11600, pos: [-2.0, 9.5] },   // 戻ろうとするが間に合わない
  ],
}

// ── サーブ：ワイド→オープンコート ──
const singlesServeWide: RallyDef = {
  id: 'singles_serve_wide',
  category: 'SINGLES_SERVE',
  title: 'ワイドサーブ → オープンコート',
  subtitle: 'ワイドで相手を外へ追い出し、空いた逆側を 3 球目で仕留める',
  goal: 'サーブで角度を作り、リターンが浅くなった瞬間にオープンコートを突く。',
  proReference: 'フェデラーの「サーブ＋1」基本パターン。',
  rightHandedAssumption: true,
  visionConesOf: 'ALL',
  introBeat: 'デュースサイドからワイドサーブを準備。',
  players: [
    { role: 'YOU', label: 'あなた', side: 'NEAR', color: GREEN, home: [-1.5, -10.5] },
    { role: 'OPP1', label: '相手', side: 'FAR', color: RED, home: [2.5, 10.5] },
  ],
  contacts: [
    { tMs: 0,    hitter: 'YOU',  pos: [-1.5, 1.6, -10.5], bounce: [3.8, 0, 5.6], bounceTMs: 900, apex: 0.3,
      beat: 'ワイドサーブで相手をコート外へ！', gateLabel: 'ワイドへ', showGate: true,
      danger: { center: [-3.5, 8.5], radius: 3.0 } },
    { tMs: 1700, hitter: 'OPP1', pos: [4.4, 1.0, 6.2], bounce: [0.5, 0, -7.5], bounceTMs: 2800,
      beat: '相手は外に出され、リターンが浅い…' },
    { tMs: 3500, hitter: 'YOU',  pos: [0.5, 1.0, -7.5], bounce: [-3.8, 0, 9.0], bounceTMs: 4700,
      beat: '🎯 空いた逆サイド（バック奥）へ叩き込む！', beatEmphasized: true,
      gateLabel: '🎯 オープンコート', showGate: true, danger: { center: [-3.8, 9.0], radius: 2.2 } },
  ],
  endTMs: 6200,
  extraMoves: [
    { role: 'OPP1', tMs: 3000, pos: [4.6, 10.0] },  // 外に出たまま戻れない
  ],
}

// ── サーブ：T センター → ボディ攻め ──
const singlesServeT: RallyDef = {
  id: 'singles_serve_t',
  category: 'SINGLES_SERVE',
  title: 'T センターサーブ → ボディ攻め',
  subtitle: 'センターで角度を消し、続けてボディに詰めて崩す',
  goal: '角度のないセンターサーブでリターンを限定し、懐を突いて主導権を握る。',
  rightHandedAssumption: true,
  visionConesOf: 'ALL',
  introBeat: 'デュースサイドから T（センター）へサーブ。',
  players: [
    { role: 'YOU', label: 'あなた', side: 'NEAR', color: GREEN, home: [-1.5, -10.5] },
    { role: 'OPP1', label: '相手', side: 'FAR', color: RED, home: [2.8, 10.5] },
  ],
  contacts: [
    { tMs: 0,    hitter: 'YOU',  pos: [-1.5, 1.6, -10.5], bounce: [0.4, 0, 5.8], bounceTMs: 900, apex: 0.3,
      beat: 'T へサーブ。相手は角度を作れない。', gateLabel: 'T センター', showGate: true },
    { tMs: 1700, hitter: 'OPP1', pos: [0.8, 1.0, 7.0], bounce: [-1.0, 0, -7.0], bounceTMs: 2800 },
    { tMs: 3500, hitter: 'YOU',  pos: [-1.0, 1.0, -7.5], bounce: [1.2, 0, 8.5], bounceTMs: 4700,
      beat: '🎯 相手のボディ（懐）に詰めて窮屈にさせる！', beatEmphasized: true,
      gateLabel: '🎯 ボディへ', showGate: true, danger: { center: [1.2, 8.5], radius: 1.8 } },
  ],
  endTMs: 6200,
}

// ── リターン：2nd を叩いて先手 ──
const singlesReturnAttack: RallyDef = {
  id: 'singles_return_attack',
  category: 'SINGLES_RETURN',
  title: 'セカンドサーブを叩いて先手',
  subtitle: '甘い 2nd を 1〜2 歩前で捉え、ライジングで深く返す',
  goal: '2nd サーブを前で叩いてベースラインの主導権を最初の一打で奪う。',
  proReference: 'ジョコビッチのアグレッシブリターン。',
  rightHandedAssumption: true,
  visionConesOf: 'ALL',
  introBeat: '相手の 2nd サーブ。1〜2 歩前で構える。',
  players: [
    { role: 'OPP1', label: '相手（サーバー）', side: 'FAR', color: RED, home: [1.5, 10.5] },
    { role: 'YOU', label: 'あなた（リターナー）', side: 'NEAR', color: GREEN, home: [-2.5, -9.0] },
  ],
  contacts: [
    { tMs: 0,    hitter: 'OPP1', pos: [1.5, 1.5, 10.5], bounce: [-2.5, 0, -5.5], bounceTMs: 1100, apex: 0.4,
      beat: '2nd サーブはバウンドが高く甘い。' },
    { tMs: 2000, hitter: 'YOU',  pos: [-2.5, 1.1, -5.0], bounce: [-3.5, 0, 9.2], bounceTMs: 3200,
      beat: '🎯 ライジングで叩いて深く！すぐ前進して主導権。', beatEmphasized: true,
      gateLabel: '🎯 深く叩く', showGate: true, danger: { center: [-3.5, 9.2], radius: 2.2 } },
    { tMs: 4200, hitter: 'OPP1', pos: [-3.5, 1.0, 9.3], bounce: [2.0, 0, -7.0], bounceTMs: 5400 },
    { tMs: 6000, hitter: 'YOU',  pos: [2.0, 1.0, -7.0], bounce: [3.5, 0, 9.0], bounceTMs: 7100,
      beat: '前で捌いてオープンコートへ。', gateLabel: 'フィニッシュ', showGate: true,
      danger: { center: [3.5, 9.0], radius: 1.8 } },
  ],
  endTMs: 8400,
  extraMoves: [
    { role: 'YOU', tMs: 3400, pos: [-1.5, -8.0] },  // リターン後に前進
  ],
}

// ── 守備：ムーンボールで立て直し ──
const singlesMoonball: RallyDef = {
  id: 'singles_moonball',
  category: 'SINGLES_DEFENSE',
  title: 'ムーンボールで立て直し',
  subtitle: '押されている時、高く深い球で時間を作りポジションを戻す',
  goal: '劣勢の局面で高い軌道の深い球を使い、相手のリズムを崩して体勢を立て直す。',
  proReference: 'マレーがピンチで使う切り替え。',
  visionConesOf: 'ALL',
  introBeat: '相手に攻め込まれ、コート外に追い出されている。',
  players: [
    { role: 'YOU', label: 'あなた', side: 'NEAR', color: GREEN, home: [-4.0, -10.0] },
    { role: 'OPP1', label: '相手', side: 'FAR', color: RED, home: [0, 9.0] },
  ],
  contacts: [
    { tMs: 0,    hitter: 'OPP1', pos: [0, 1.0, 9.0], bounce: [-4.0, 0, -9.5], bounceTMs: 1200,
      beat: '相手の鋭い一打。あなたは大きく振られている。' },
    { tMs: 2000, hitter: 'YOU',  pos: [-4.2, 1.0, -9.8], bounce: [0, 0, 9.5], bounceTMs: 3800, apex: 3.0,
      beat: '☁️ ここで高く深いムーンボール！相手を後ろに下げて時間を稼ぐ。', beatEmphasized: true,
      gateLabel: '☁️ 高く深く', showGate: true },
    { tMs: 4600, hitter: 'OPP1', pos: [0, 1.4, 10.5], bounce: [-1.0, 0, -7.0], bounceTMs: 5800 },
    { tMs: 6400, hitter: 'YOU',  pos: [-1.0, 1.0, -8.0], bounce: [2.0, 0, 8.0], bounceTMs: 7500,
      beat: '体勢を戻せた。ここからニュートラルに戻す。' },
  ],
  endTMs: 8800,
  extraMoves: [
    { role: 'YOU', tMs: 3900, pos: [-1.5, -9.5] },   // ムーンボール後に中央へ復帰
  ],
}

// ── ドロップ → ロブ ──
const singlesDropLob: RallyDef = {
  id: 'singles_drop_lob',
  category: 'SINGLES_PATTERN',
  title: 'ドロップ → 追い越しロブ',
  subtitle: '前後に大きく揺さぶり、体力と集中を削る',
  goal: 'ドロップで前に走らせ、止まったところをロブで頭上を抜く。',
  proReference: 'アルカラスの代名詞コンボ。',
  rightHandedAssumption: true,
  visionConesOf: 'ALL',
  introBeat: '深いラリーで「下がる」印象を作っておく。',
  players: [
    { role: 'YOU', label: 'あなた', side: 'NEAR', color: GREEN, home: [-1, -10.0] },
    { role: 'OPP1', label: '相手', side: 'FAR', color: RED, home: [0, 10.5] },
  ],
  contacts: [
    { tMs: 0,    hitter: 'YOU',  pos: [-1, 1.0, -10.0], bounce: [-2.5, 0, 9.5], bounceTMs: 1300,
      beat: 'まず深く打って相手を下げる。' },
    { tMs: 2100, hitter: 'OPP1', pos: [-2.5, 1.0, 10.0], bounce: [-1.5, 0, -8.5], bounceTMs: 3300 },
    { tMs: 4000, hitter: 'YOU',  pos: [-1.5, 1.0, -8.5], bounce: [1.0, 0, 1.5], bounceTMs: 5000, apex: 0.2,
      beat: '🎯 突然ドロップ！ネット際に落とす。', beatEmphasized: true,
      gateLabel: '🎯 ドロップ', showGate: true, danger: { center: [1.0, 1.5], radius: 1.5 } },
    { tMs: 5800, hitter: 'OPP1', pos: [1.0, 0.7, 1.8], bounce: [0.5, 0, -3.0], bounceTMs: 6700,
      beat: '相手は全力ダッシュでなんとか触る。' },
    { tMs: 7400, hitter: 'YOU',  pos: [0.5, 1.0, -4.0], bounce: [-1.0, 0, 10.5], bounceTMs: 9000, apex: 2.2,
      beat: '☁️ 止まった相手の頭上をロブで抜く！', beatEmphasized: true,
      gateLabel: '☁️ ロブで抜く', showGate: true, danger: { center: [-1.0, 10.5], radius: 2.0 } },
  ],
  endTMs: 10500,
  extraMoves: [
    { role: 'OPP1', tMs: 4800, pos: [0.8, 3.0] },   // ドロップに前へダッシュ
    { role: 'OPP1', tMs: 6700, pos: [0.8, 2.0] },   // 前に止まる→ロブで抜かれる
  ],
}

// ════════════════════════════════════════════════════════════
//  ダブルス
// ════════════════════════════════════════════════════════════

// ── 雁行陣：前衛ポーチのタイミング ──
const doublesPoach: RallyDef = {
  id: 'doubles_poach',
  category: 'DOUBLES_OPPOSITE',
  title: '雁行陣：前衛ポーチのタイミング',
  subtitle: 'クロスラリー中、前衛がポーチに動く瞬間とスイッチ',
  goal: '相手の 3 球目クロスを狙ってポーチに出る、ダブルスの基本攻撃。',
  proReference: 'ブライアン兄弟の代名詞。',
  visionConesOf: 'ALL',
  introBeat: 'クロスラリー開始。前衛（あなた）は相手の打球方向を注視。',
  players: [
    { role: 'YOU', label: 'あなた（前衛）', side: 'NEAR', color: GREEN, home: [2.5, -5.0] },
    { role: 'PARTNER', label: 'パートナー（後衛）', side: 'NEAR', color: BLUE, home: [-3.0, -10.0] },
    { role: 'OPP1', label: '相手（後衛）', side: 'FAR', color: RED, home: [-3.0, 10.0] },
    { role: 'OPP2', label: '相手（前衛）', side: 'FAR', color: RED, home: [3.0, 5.0] },
  ],
  contacts: [
    { tMs: 0,    hitter: 'PARTNER', pos: [-3.0, 1.0, -10.0], bounce: [-3.2, 0, 8.5], bounceTMs: 1300,
      beat: '後衛がクロスへ深く。' },
    { tMs: 2100, hitter: 'OPP1', pos: [-3.2, 1.0, 9.0], bounce: [-3.0, 0, -8.5], bounceTMs: 3300 },
    { tMs: 4100, hitter: 'PARTNER', pos: [-3.0, 1.0, -9.0], bounce: [-3.2, 0, 8.5], bounceTMs: 5300,
      beat: '前衛は「次のクロス」を狙ってポーチ準備…', beatEmphasized: true,
      danger: { center: [0, -2.0], radius: 1.6 } },
    // 相手のクロス（ボレーで取られる＝バウンドなし）
    { tMs: 6100, hitter: 'OPP1', pos: [-3.2, 1.0, 9.0],
      beat: '相手がクロスに返した瞬間…' },
    // 前衛がポーチでボレー
    { tMs: 7000, hitter: 'YOU', pos: [0, 1.1, -1.5], bounce: [3.6, 0, 7.5], bounceTMs: 8000,
      beat: '🔥 ポーチ！センターを横切って決める！', beatEmphasized: true,
      gateLabel: '🔥 ポーチ', showGate: true, danger: { center: [3.6, 7.5], radius: 2.0 } },
  ],
  endTMs: 9500,
  extraMoves: [
    { role: 'YOU', tMs: 5800, pos: [1.5, -3.0] },   // ポーチへ動き出す
    { role: 'YOU', tMs: 7600, pos: [3.0, -2.0] },   // 決めた後前進
    { role: 'PARTNER', tMs: 7200, pos: [2.5, -10.0] },  // スイッチして空いたサイドをカバー
    { role: 'OPP1', tMs: 7000, pos: [-2.0, 9.5] },  // ポーチに虚を突かれる
  ],
}

// ── 並行陣：ロブ対応とスイッチ ──
const doublesParallelLob: RallyDef = {
  id: 'doubles_parallel_lob',
  category: 'DOUBLES_PARALLEL',
  title: '並行陣：ロブ対応とスイッチ',
  subtitle: '相手のロブに「どちらが追い、どちらがカバーするか」',
  goal: 'ロブを上げられた瞬間の声出しと、連動した役割交代（スイッチ）。',
  visionConesOf: 'ALL',
  introBeat: '並行陣でネットを支配中。',
  players: [
    { role: 'YOU', label: 'あなた（前衛右）', side: 'NEAR', color: GREEN, home: [2.5, -4.5] },
    { role: 'PARTNER', label: 'パートナー（前衛左）', side: 'NEAR', color: BLUE, home: [-2.5, -4.5] },
    { role: 'OPP1', label: '相手（後衛）', side: 'FAR', color: RED, home: [-3.0, 9.0] },
    { role: 'OPP2', label: '相手（前衛）', side: 'FAR', color: RED, home: [3.0, 5.0] },
  ],
  contacts: [
    { tMs: 0,    hitter: 'PARTNER', pos: [-2.5, 1.1, -4.5], bounce: [-3.0, 0, 6.0], bounceTMs: 900,
      beat: 'ネット前のボレーラリー。' },
    { tMs: 1800, hitter: 'OPP1', pos: [-3.0, 1.0, 6.5], bounce: [2.8, 0, -10.5], bounceTMs: 4000, apex: 2.6,
      beat: '⚠️ ロブが上がる！「マイン！」と声を出して役割確認。', beatEmphasized: true,
      danger: { center: [2.8, -10.0], radius: 2.8 } },
    { tMs: 4900, hitter: 'YOU', pos: [2.8, 1.0, -10.5], bounce: [-1.0, 0, 9.0], bounceTMs: 6600, apex: 2.4,
      beat: '右に上がったので右前衛（あなた）が追って高いロブで返球。', beatEmphasized: true,
      gateLabel: '☁️ 高く返す', showGate: true },
  ],
  endTMs: 8000,
  extraMoves: [
    { role: 'PARTNER', tMs: 4900, pos: [-1.5, -3.0] },  // 前進してセンターケア
    { role: 'PARTNER', tMs: 6600, pos: [0, -2.5] },
    { role: 'YOU', tMs: 6800, pos: [2.5, -8.0] },       // 追ったあと復帰
  ],
}

// ── I フォーメーション ──
const doublesIFormation: RallyDef = {
  id: 'doubles_i_formation',
  category: 'DOUBLES_I_FORMATION',
  title: 'I フォーメーション基本',
  subtitle: '前衛がセンターでサインを出し、サーブ直後に動く方向を予告',
  goal: 'リターン側を惑わせ、ストレートリターンを牽制してポーチで先制。',
  visionConesOf: 'ALL',
  introBeat: '前衛がセンターラインに低く構える（I 字）。',
  players: [
    { role: 'YOU', label: 'あなた（サーバー）', side: 'NEAR', color: GREEN, home: [-1.0, -10.5] },
    { role: 'PARTNER', label: 'パートナー（I 前衛）', side: 'NEAR', color: BLUE, home: [0, -5.0] },
    { role: 'OPP1', label: '相手（リターナー）', side: 'FAR', color: RED, home: [-3.5, 10.5] },
    { role: 'OPP2', label: '相手（前衛）', side: 'FAR', color: RED, home: [3.0, 5.0] },
  ],
  contacts: [
    { tMs: 0,    hitter: 'YOU', pos: [-1.0, 1.6, -10.5], bounce: [-0.4, 0, 5.8], bounceTMs: 900, apex: 0.3,
      beat: 'T センターへサーブ。前衛は右にポーチ予定。', gateLabel: 'T へ', showGate: true },
    { tMs: 1700, hitter: 'OPP1', pos: [-0.8, 1.0, 7.0],
      beat: 'リターナーは前衛の動きが読めず…', beatEmphasized: true },
    { tMs: 2700, hitter: 'PARTNER', pos: [1.5, 1.1, -3.5], bounce: [3.6, 0, 8.0], bounceTMs: 3700,
      beat: '🔥 前衛が右へポーチで横取り！', beatEmphasized: true,
      gateLabel: '🔥 ポーチ', showGate: true, danger: { center: [3.6, 8.0], radius: 2.0 } },
  ],
  endTMs: 5400,
  extraMoves: [
    { role: 'YOU', tMs: 2500, pos: [-3.0, -9.0] },   // サーブ後に左へスイッチ
    { role: 'PARTNER', tMs: 1800, pos: [0.8, -4.0] }, // ポーチに動き出す
  ],
}

// ── オーストラリアン陣形 ──
const doublesAustralian: RallyDef = {
  id: 'doubles_australian',
  category: 'DOUBLES_I_FORMATION',
  title: 'オーストラリアン陣形',
  subtitle: 'サーバーと前衛が同サイドに並んでクロスを封じる',
  goal: '相手のクロスリターンが強い時、陣形を変えてストレートに振らせる。',
  proReference: '全豪オープンで多用される由来の戦術。',
  visionConesOf: 'ALL',
  introBeat: 'サーバーと前衛が同サイド（左）に並ぶ＝オーストラリアン陣形。',
  players: [
    { role: 'YOU', label: 'あなた（サーバー）', side: 'NEAR', color: GREEN, home: [-1.0, -10.5] },
    { role: 'PARTNER', label: 'パートナー（前衛）', side: 'NEAR', color: BLUE, home: [-2.5, -5.0] },
    { role: 'OPP1', label: '相手（リターナー）', side: 'FAR', color: RED, home: [-3.5, 10.5] },
    { role: 'OPP2', label: '相手（前衛）', side: 'FAR', color: RED, home: [3.0, 5.0] },
  ],
  contacts: [
    { tMs: 0,    hitter: 'YOU', pos: [-1.0, 1.6, -10.5], bounce: [-3.6, 0, 5.6], bounceTMs: 900, apex: 0.3,
      beat: 'ワイドサーブで相手リターナーを外へ。', gateLabel: 'ワイドへ', showGate: true },
    { tMs: 1700, hitter: 'OPP1', pos: [-4.2, 1.0, 6.2],
      beat: '⚠️ クロスは塞いだ。相手はストレートに打つしかない！', beatEmphasized: true,
      danger: { center: [-2.5, -3.0], radius: 1.8 } },
    { tMs: 2700, hitter: 'PARTNER', pos: [-2.0, 1.1, -3.5], bounce: [3.5, 0, 8.0], bounceTMs: 3700,
      beat: '🔥 ストレートを前衛がボレーで仕留める！', beatEmphasized: true,
      gateLabel: '🔥 ボレー', showGate: true, danger: { center: [3.5, 8.0], radius: 2.0 } },
  ],
  endTMs: 5400,
  extraMoves: [
    { role: 'YOU', tMs: 2500, pos: [2.5, -9.0] },   // サーブ後すぐ右へスイッチ
  ],
}

// ── ダブルス・ネット：足元へ沈めてポーチ封じ ──
const doublesNetDip: RallyDef = {
  id: 'doubles_net_dip',
  category: 'DOUBLES_NET',
  title: 'リターンを足元に沈める',
  subtitle: '相手前衛のポーチを防ぎ、ローボレーを上げさせて叩く',
  goal: 'リターンを相手前衛／ネット選手の足元に低く沈め、浮いた球を仕留める。',
  visionConesOf: 'ALL',
  introBeat: '相手はネットに詰める並行陣。',
  players: [
    { role: 'OPP1', label: '相手（サーバー）', side: 'FAR', color: RED, home: [1.5, 10.5] },
    { role: 'OPP2', label: '相手（前衛）', side: 'FAR', color: RED, home: [-2.5, 5.0] },
    { role: 'YOU', label: 'あなた（リターナー）', side: 'NEAR', color: GREEN, home: [-2.5, -9.0] },
    { role: 'PARTNER', label: 'パートナー', side: 'NEAR', color: BLUE, home: [2.5, -9.5] },
  ],
  contacts: [
    { tMs: 0,    hitter: 'OPP1', pos: [1.5, 1.6, 10.5], bounce: [-2.6, 0, -5.6], bounceTMs: 900, apex: 0.3,
      beat: '相手のサーブ。' },
    { tMs: 1700, hitter: 'YOU', pos: [-2.6, 1.0, -5.6], bounce: [-2.5, 0, 4.5], bounceTMs: 2700, apex: 0.15,
      beat: '🎯 相手前衛の足元へ低く沈める（トップスピン）。', beatEmphasized: true,
      gateLabel: '🎯 足元へ', showGate: true, danger: { center: [-2.5, 4.5], radius: 1.4 } },
    { tMs: 3300, hitter: 'OPP2', pos: [-2.5, 0.5, 4.8], bounce: [0, 0, -3.0], bounceTMs: 4200,
      beat: '相手は低いローボレーを上げるしかない…' },
    { tMs: 4900, hitter: 'PARTNER', pos: [0, 1.2, -3.5], bounce: [3.5, 0, 7.5], bounceTMs: 5800,
      beat: '🔥 浮いた球をパートナーがパンチボレーで決める！', beatEmphasized: true,
      gateLabel: '🔥 決める', showGate: true, danger: { center: [3.5, 7.5], radius: 2.0 } },
  ],
  endTMs: 7200,
  extraMoves: [
    { role: 'YOU', tMs: 2900, pos: [-1.5, -5.0] },   // リターン後に前進
    { role: 'PARTNER', tMs: 3500, pos: [0.5, -5.5] }, // ネットに詰める
  ],
}

// ════════════════════════════════════════════════════════════

const RALLIES: RallyDef[] = [
  singlesBisect,
  singlesCrossDtl,
  singlesServeWide,
  singlesServeT,
  singlesReturnAttack,
  singlesMoonball,
  singlesDropLob,
  doublesPoach,
  doublesParallelLob,
  doublesIFormation,
  doublesAustralian,
  doublesNetDip,
]

export const SCENARIOS: Scenario[] = RALLIES.map(buildRally)

/** カテゴリで絞り込み。 */
export function scenariosByCategory(): Map<Scenario['category'], Scenario[]> {
  const m = new Map<Scenario['category'], Scenario[]>()
  for (const s of SCENARIOS) {
    if (!m.has(s.category)) m.set(s.category, [])
    m.get(s.category)!.push(s)
  }
  return m
}

/** 利き手反転（左利き設定）。 */
export function mirrorScenarioForLefty(s: Scenario): Scenario {
  const flip2 = (p: [number, number]): [number, number] => [-p[0], p[1]]
  const flip3 = (p: [number, number, number]): [number, number, number] => [-p[0], p[1], p[2]]
  return {
    ...s,
    ballPath: s.ballPath.map(k => ({ ...k, pos: flip3(k.pos) })),
    players: s.players.map(p => ({
      ...p,
      keyframes: p.keyframes.map(k => ({
        ...k, pos: flip2(k.pos),
        facing: k.facing !== undefined ? -k.facing : undefined,
      })),
    })),
    dangerZones: s.dangerZones.map(d => ({ ...d, center: flip2(d.center) })),
    targetGates: s.targetGates?.map(g => ({
      ...g, pos: flip3(g.pos), normal: flip3(g.normal),
    })),
  }
}
