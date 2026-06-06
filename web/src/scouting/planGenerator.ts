import type { GamePlan, PlanStep, PlayStyle, PlayerScouting, WeaknessZone } from './types'
import { STYLE_LABEL, WEAKNESS_LABEL } from './types'

/**
 * AI 必勝プラン生成。
 *
 * 仕組み：
 *  - 「私のスタイル × 相手のスタイル × 相手の弱点」の組み合わせから
 *    最適プランを選択
 *  - ベースは事前定義したプランテンプレート
 *  - 文章は弱点ゾーン・スタイル名を埋め込んで生成
 *  - 音声ナレーション原稿も同時に生成
 */

export function generateGamePlans(
  me: PlayerScouting, opp: PlayerScouting,
): GamePlan[] {
  const plans: GamePlan[] = []
  const myStyle = me.style
  const oppStyle = opp.style

  // ── ベースプラン群 ────────────────────────────
  // プラン A：相手の弱点徹底攻撃
  if (opp.weaknesses.length > 0) {
    plans.push(planA_weaknessAttack(me, opp))
  }

  // プラン B：スタイル相性ベース
  plans.push(planB_styleMatchup(me, opp))

  // プラン C：序盤の情報収集 → 終盤の決め
  plans.push(planC_buildAndFinish(me, opp))

  // プラン D：相手がメンタル弱い場合
  if (opp.ratings.underPressure <= 2) {
    plans.push(planD_mentalPressure(me, opp))
  }

  // 信頼度順にソート
  plans.sort((a, b) => b.confidence - a.confidence)
  return plans
}

// ── プラン A：相手の弱点徹底攻撃 ─────────────────────

function planA_weaknessAttack(me: PlayerScouting, opp: PlayerScouting): GamePlan {
  const mainWeakness = opp.weaknesses[0]
  const steps = stepsForWeakness(mainWeakness, opp)
  return {
    id: 'plan_a_' + mainWeakness,
    myStyle: me.style,
    opponentStyle: opp.style,
    name: `🎯 プランA：${WEAKNESS_LABEL[mainWeakness]}を徹底粉砕`,
    summary: `${opp.name} の最大弱点は「${WEAKNESS_LABEL[mainWeakness]}」。` +
      `毎ポイントこのエリアを狙ってミスを誘発、もしくはチャンスボールを引き出して仕留めます。`,
    steps,
    caveats: [
      `相手が ${WEAKNESS_LABEL[mainWeakness]} を克服してきたら別プランへ切り替え`,
      `単調なパターンは読まれやすい。3〜5 ゲームに 1 回は揺さぶりを混ぜる`,
    ],
    scenarioIds: scenarioIdsForWeakness(mainWeakness),
    confidence: 0.85,
    narration: buildNarration_planA(me, opp, mainWeakness, steps),
  }
}

function stepsForWeakness(w: WeaknessZone, opp: PlayerScouting): PlanStep[] {
  switch (w) {
    case 'BH_DEEP':
      return [
        { order: 1, instruction: 'サーブをワイドへ → 相手をデュースサイドに引き出す', targetZone: 'FH_WIDE' },
        { order: 2, instruction: '3 球目をクロスから一気にバック奥へ深く', targetZone: 'BH_DEEP' },
        { order: 3, instruction: 'バックで返ってきた甘い球を回り込みフォアで逆突き', targetZone: 'FH_WIDE' },
      ]
    case 'BH_HIGH':
      return [
        { order: 1, instruction: '1stはセンターへキック気味で深く', targetZone: 'CENTER' },
        { order: 2, instruction: '高いトップスピンで相手バック肩口を狙う', targetZone: 'BH_DEEP' },
        { order: 3, instruction: '中ロブ気味の返球が来たら前進してフォアで決める', targetZone: 'FH_WIDE' },
      ]
    case 'FH_WIDE':
      return [
        { order: 1, instruction: '1stをワイドへ → フォアサイドで振らせる', targetZone: 'FH_WIDE' },
        { order: 2, instruction: '相手がコート外に出たら逆クロスで広く展開', targetZone: 'BH_DEEP' },
        { order: 3, instruction: 'バック側オープンコートに決め球', targetZone: 'BH_DEEP' },
      ]
    case 'FH_LOW':
      return [
        { order: 1, instruction: 'スライスでフォア側の足元へ低く滑らせる', targetZone: 'FH_WIDE' },
        { order: 2, instruction: '上げ気味で返ってきた球を一気に叩く', targetZone: 'BH_DEEP' },
      ]
    case 'BODY':
      return [
        { order: 1, instruction: 'ボディサーブで詰まらせる', targetZone: 'BODY' },
        { order: 2, instruction: '浮いてきたリターンを前に出てボレー', targetZone: 'NET_LOW' },
      ]
    case 'NET_LOW':
      return [
        { order: 1, instruction: '深いクロスで相手をベースラインに張り付ける', targetZone: 'BH_DEEP' },
        { order: 2, instruction: '突如ドロップで前に走らせる', targetZone: 'NET_LOW' },
        { order: 3, instruction: '相手が苦手な低い球を上げたところを叩く', targetZone: 'FH_WIDE' },
      ]
    case 'LOB':
      return [
        { order: 1, instruction: 'ネット詰めで相手を下げさせる', targetZone: 'NET_LOW' },
        { order: 2, instruction: 'ロブで頭上を抜く（相手は処理が苦手）', targetZone: 'LOB' },
      ]
    case 'SECOND_SERVE':
      return [
        { order: 1, instruction: '相手の 2nd を 1〜2 歩前で叩く', targetZone: 'BH_DEEP' },
        { order: 2, instruction: 'ライジングで深く返してベースライン主導権を奪う', targetZone: 'BH_DEEP' },
        { order: 3, instruction: 'リターン後すぐ前進してネット詰め', targetZone: 'NET_LOW' },
      ]
  }
}

function scenarioIdsForWeakness(w: WeaknessZone): string[] {
  switch (w) {
    case 'BH_DEEP': return ['singles_cross_dtl']
    case 'BH_HIGH': return ['singles_cross_dtl']
    case 'FH_WIDE': return ['singles_bisect_straight']
    default: return ['singles_cross_dtl']
  }
}

function buildNarration_planA(
  me: PlayerScouting, opp: PlayerScouting,
  w: WeaknessZone, steps: PlanStep[],
): string {
  return (
    `今日の対戦相手、${opp.name} さんは ${STYLE_LABEL[opp.style]} タイプです。` +
    `最大の弱点は「${WEAKNESS_LABEL[w]}」。\n\n` +
    `この弱点を集中して攻めるプランで臨みます。\n\n` +
    steps.map(s => `${s.order} 球目：${s.instruction}。`).join('\n') +
    `\n\n単調にならないよう、3 ゲームに 1 回は揺さぶりを混ぜましょう。` +
    `あなたの集中力と再現性が、このプランの成否を決めます。`
  )
}

// ── プラン B：スタイル相性 ─────────────────────────

function planB_styleMatchup(me: PlayerScouting, opp: PlayerScouting): GamePlan {
  const matchup = pickMatchupPlan(me.style, opp.style)
  return {
    id: 'plan_b_' + me.style + '_vs_' + opp.style,
    myStyle: me.style, opponentStyle: opp.style,
    name: `🆚 プランB：${STYLE_LABEL[me.style]} vs ${STYLE_LABEL[opp.style]}`,
    summary: matchup.summary,
    steps: matchup.steps,
    caveats: matchup.caveats,
    scenarioIds: matchup.scenarioIds,
    confidence: matchup.confidence,
    narration: matchup.narration,
  }
}

interface MatchupPlan {
  summary: string
  steps: PlanStep[]
  caveats: string[]
  scenarioIds: string[]
  confidence: number
  narration: string
}

function pickMatchupPlan(me: PlayStyle, opp: PlayStyle): MatchupPlan {
  // 代表的な相性プラン
  if (opp === 'BIG_SERVER') {
    return {
      summary: 'ビッグサーバー相手はリターンが鍵。1st を確実にコートに入れる守備的リターンと、2nd を叩く攻撃リターンを切り替えて主導権を奪います。',
      steps: [
        { order: 1, instruction: '1st サーブはブロックリターンで深く中央へ', targetZone: 'CENTER' },
        { order: 2, instruction: '2nd サーブは 1〜2 歩前で叩いて主導権', targetZone: 'BH_DEEP' },
        { order: 3, instruction: '自分のサービスゲームはキープに集中（ブレークは 1 回でも価値大）', targetZone: 'CENTER' },
      ],
      caveats: ['長いラリーは相手の体力消耗を狙う', 'タイブレークになりやすいので集中力配分を意識'],
      scenarioIds: ['singles_cross_dtl'],
      confidence: 0.78,
      narration: '相手はビッグサーバー。1st は守って入れ、2nd を狙って叩きます。'
    }
  }
  if (opp === 'PUSHER') {
    return {
      summary: 'プッシャー相手は焦って攻めるとミスが増えます。深い球で押し続け、短い球が来た時だけ前進してネットで決めます。',
      steps: [
        { order: 1, instruction: 'ベースライン深く、両側に振る', targetZone: 'BH_DEEP' },
        { order: 2, instruction: '浅い球が来たらアプローチでネットへ', targetZone: 'NET_LOW' },
        { order: 3, instruction: 'ボレーで角度をつけて決める', targetZone: 'FH_WIDE' },
      ],
      caveats: ['1 球で決めようとせず、3〜5 球計画で'],
      scenarioIds: ['singles_cross_dtl'],
      confidence: 0.80,
      narration: '相手はプッシャー。焦らず深く押して、短い球が来たらネットで決めます。'
    }
  }
  if (opp === 'SERVE_VOLLEYER') {
    return {
      summary: 'サーブ＆ボレー相手はリターンの足元への沈み球が決め手。低いトップスピンで沈めて、ボレーが浮いたところを抜きます。',
      steps: [
        { order: 1, instruction: 'リターンを相手の足元に沈める（強いトップスピン）', targetZone: 'NET_LOW' },
        { order: 2, instruction: '浮いたボレーをパッシングで抜く', targetZone: 'BH_DEEP' },
        { order: 3, instruction: 'ロブも織り交ぜて相手の前進を抑止', targetZone: 'LOB' },
      ],
      caveats: ['足元沈め球の精度が要。風が強い日は別プラン推奨'],
      scenarioIds: ['singles_bisect_straight'],
      confidence: 0.82,
      narration: '相手はサーブ＆ボレーヤー。リターンを足元に沈めて、ボレーが浮いたら抜きます。'
    }
  }
  if (opp === 'AGGRESSIVE_BASELINER') {
    return {
      summary: 'アグレッシブな相手は時間を奪われます。深い高い弾道で相手のリズムを崩し、左右に揺さぶってミスを誘発します。',
      steps: [
        { order: 1, instruction: '深く高い弾道で時間を作る', targetZone: 'BH_DEEP' },
        { order: 2, instruction: 'バック側を集中攻撃', targetZone: 'BH_DEEP' },
        { order: 3, instruction: 'チャンスが来たら逆クロスで決める', targetZone: 'FH_WIDE' },
      ],
      caveats: ['手打ちにならないよう体幹で打つ'],
      scenarioIds: ['singles_cross_dtl'],
      confidence: 0.75,
      narration: '相手はアグレッシブ・ベースライナー。深く高い球で時間を奪い、バックを集中攻撃します。'
    }
  }
  if (opp === 'COUNTER_PUNCHER') {
    return {
      summary: 'カウンター相手は安定感が武器。粘りに付き合わず、自分から攻めて短いポイントを作ります。',
      steps: [
        { order: 1, instruction: '1st サーブで先手を取る', targetZone: 'CENTER' },
        { order: 2, instruction: '3 球目で前進、ボレーまで持ち込む', targetZone: 'NET_LOW' },
        { order: 3, instruction: '長いラリーに巻き込まれないよう早めに勝負', targetZone: 'FH_WIDE' },
      ],
      caveats: ['焦って攻めすぎるとミスが嵩む。バランス重要'],
      scenarioIds: ['singles_bisect_straight'],
      confidence: 0.77,
      narration: '相手はカウンターパンチャー。粘りに付き合わず、3 球目までに勝負を決めましょう。'
    }
  }
  // デフォルト
  return {
    summary: '基本に忠実に。1st サーブを確実に入れ、ラリーで深さを保ち、短い球を狙って前進。',
    steps: [
      { order: 1, instruction: '1st サーブを 65% 以上の確率で', targetZone: 'CENTER' },
      { order: 2, instruction: '深く、両側に揺さぶる', targetZone: 'BH_DEEP' },
      { order: 3, instruction: 'チャンスは前進して決める', targetZone: 'NET_LOW' },
    ],
    caveats: ['試合の流れを観察し、必要に応じてプラン切替'],
    scenarioIds: ['singles_cross_dtl'],
    confidence: 0.65,
    narration: '基本の試合運びで。1st 確率を高く保ち、両側に深く揺さぶります。'
  }
}

// ── プラン C：序盤情報収集 → 終盤勝負 ───────────────

function planC_buildAndFinish(me: PlayerScouting, opp: PlayerScouting): GamePlan {
  return {
    id: 'plan_c_buildup',
    myStyle: me.style, opponentStyle: opp.style,
    name: '📈 プランC：観察→分析→勝負',
    summary: '序盤の 3 ゲームは情報収集に徹し、相手の癖が見えてから本気の攻めに切り替えます。',
    steps: [
      { order: 1, instruction: '【1〜3 ゲーム目】深く返してミスを最小化、相手のパターンを観察', targetZone: 'BH_DEEP' },
      { order: 2, instruction: '【4 ゲーム目以降】見えた弱点を集中攻撃', targetZone: 'BH_DEEP' },
      { order: 3, instruction: '【リード後】サービスゲーム死守 + リターンチャレンジ継続' },
    ],
    caveats: ['情報収集中に失点しすぎないよう守備寄りに', 'ビハインドのまま終盤に入らないこと'],
    scenarioIds: ['singles_cross_dtl'],
    confidence: 0.70,
    narration: '序盤は情報収集。相手の癖が見えてから本気で攻めます。'
  }
}

// ── プラン D：メンタル攻撃 ─────────────────────────

function planD_mentalPressure(me: PlayerScouting, opp: PlayerScouting): GamePlan {
  return {
    id: 'plan_d_mental',
    myStyle: me.style, opponentStyle: opp.style,
    name: '🧠 プランD：メンタル揺さぶり',
    summary: '相手はプレッシャー耐性に課題があります。長いラリー＋接戦の流れに持ち込めば自滅を誘えます。',
    steps: [
      { order: 1, instruction: '深いラリーを 6 球以上続ける', targetZone: 'BH_DEEP' },
      { order: 2, instruction: 'デュースに持ち込んでプレッシャーをかける', targetZone: 'CENTER' },
      { order: 3, instruction: '自分は冷静に：ガット整え＋深呼吸ルーティン', targetZone: 'CENTER' },
    ],
    caveats: ['自分が先に切れないよう感情制御を最優先'],
    scenarioIds: ['singles_cross_dtl'],
    confidence: 0.72,
    narration: '相手はプレッシャーに弱め。長いラリーとデュースで揺さぶり、自分は冷静に。'
  }
}
