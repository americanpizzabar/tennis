import type { Scenario } from './types'

/**
 * 代表的な戦術シナリオ集。実コートの実寸（メートル）でキーフレームを記述。
 *
 * コート寸法（メートル）：
 *  - シングルス幅: 8.23 m （±4.115）
 *  - ダブルス幅: 10.97 m（±5.485）
 *  - 全長: 23.77 m（ベースライン z=±11.885）
 *  - サービスライン: z=±6.40
 */

// ── シングルス：バイセクト戻り位置（ストレート深く打った後） ──
const singlesBisectStraight: Scenario = {
  id: 'singles_bisect_straight',
  category: 'SINGLES_POSITIONING',
  title: 'バイセクト戻り：ストレート深く',
  subtitle: '相手バックハンド奥にストレートで打った後の戻り位置',
  goal: '次に返ってくる球の最大角度を二等分する位置に戻ることで、オープンコートを最小化する。',
  proReference: 'ジョコビッチが対戦相手分析で重視する基本中の基本。',
  durationMs: 8000,
  rightHandedAssumption: true,
  ballPath: [
    { tMs: 0,    pos: [0, 0.5, -10.5] },         // 自分のベースライン中央
    { tMs: 1200, pos: [-3.5, 1.5, 0] },          // ネット上
    { tMs: 2400, pos: [-3.5, 0.0, 9.5] },        // 相手バック深く着弾
    { tMs: 3000, pos: [-3.5, 1.2, 6] },          // 相手が拾う
    { tMs: 4500, pos: [-1.5, 1.5, 0] },          // ネット上（クロス気味）
    { tMs: 6000, pos: [2.5, 0.0, -9.5] },        // 自分側オープンコート
  ],
  players: [
    {
      id: 'you', label: 'あなた', side: 'NEAR', color: '#4CAF50', role: 'YOU',
      keyframes: [
        { tMs: 0,    pos: [0, -10.5], facing: 0 },
        { tMs: 1200, pos: [0, -10.5] },
        { tMs: 2400, pos: [-1.5, -10.0] },       // 「悪い戻り」：中央に戻ろうとする
        { tMs: 3800, pos: [-1.5, -10.0] },       // 待機
        { tMs: 4500, pos: [-1.5, -10.0] },
        { tMs: 6000, pos: [1.0, -10.5] },        // ↑ 間に合わずオープンコート許す
      ],
    },
    {
      id: 'opp', label: '相手', side: 'FAR', color: '#EF5350', role: 'OPP1',
      keyframes: [
        { tMs: 0,    pos: [0, 10.5], facing: Math.PI },
        { tMs: 2400, pos: [-3.5, 9.0] },         // バック深く拾いに
        { tMs: 3000, pos: [-3.5, 9.0] },
        { tMs: 4500, pos: [-2.5, 8.5] },
        { tMs: 6000, pos: [-2.5, 8.5] },
      ],
    },
  ],
  dangerZones: [
    // 自分の戻りが甘いと、相手のクロス展開で右側にオープンコート
    { tMs: 2400, center: [0, 0], radius: 0, visible: false },
    { tMs: 3000, center: [2.5, -8], radius: 2.8, visible: true },
    { tMs: 5500, center: [2.5, -8], radius: 3.5, visible: true },
    { tMs: 6500, center: [2.5, -8], radius: 0.5, visible: false },
  ],
  beats: [
    { tMs: 0,    text: '相手バック奥にストレートで深く打ちます。', emphasized: false },
    { tMs: 2400, text: '⚠️ センターに戻るのは罠！相手のクロス展開で右オープンコートを狙われます。', emphasized: true },
    { tMs: 4000, text: '正しくは「二等分線」上、コートやや左に戻るのが正解。', emphasized: true },
    { tMs: 6000, text: '結果：間に合わずウィナーを許してしまった例です。', emphasized: false },
  ],
}

// ── シングルス：クロス→ストレート展開 ──
const singlesCrossDtl: Scenario = {
  id: 'singles_cross_dtl',
  category: 'SINGLES_PATTERN',
  title: 'クロス3球→ダウンザライン',
  subtitle: 'クロスで揺さぶり、相手のスタンスが流れた瞬間に逆を突く',
  goal: '相手を片側に追い出してから空いた逆サイドを取る、最も基本かつ効果的なパターン。',
  proReference: 'ナダル／ティームの王道。',
  durationMs: 12000,
  ballPath: [
    { tMs: 0,    pos: [-1, 0.5, -10] },
    { tMs: 1200, pos: [-2, 1.5, 0] },
    { tMs: 2400, pos: [-3.5, 0, 8] },           // クロス1
    { tMs: 3300, pos: [-1.5, 1.2, 4] },
    { tMs: 4400, pos: [-2.5, 1.5, 0] },
    { tMs: 5500, pos: [-4, 0, 8] },             // クロス2
    { tMs: 6400, pos: [-2, 1.2, 4] },
    { tMs: 7500, pos: [-3, 1.5, 0] },
    { tMs: 8600, pos: [-4.5, 0, 9] },           // クロス3（相手は完全に左へ）
    { tMs: 9500, pos: [-2, 1.2, 5] },
    { tMs: 10500, pos: [2.5, 1.5, 0] },          // ストレート転換！
    { tMs: 11500, pos: [3.5, 0, 9.5] },          // ウィナー
  ],
  players: [
    {
      id: 'you', label: 'あなた', side: 'NEAR', color: '#4CAF50', role: 'YOU',
      keyframes: [
        { tMs: 0,     pos: [-1, -10] },
        { tMs: 2400,  pos: [-1, -10] },
        { tMs: 4400,  pos: [-1.5, -10] },
        { tMs: 7500,  pos: [-2, -10] },
        { tMs: 10500, pos: [-2.5, -10] },
        { tMs: 12000, pos: [-1, -10] },
      ],
    },
    {
      id: 'opp', label: '相手', side: 'FAR', color: '#EF5350', role: 'OPP1',
      keyframes: [
        { tMs: 0,     pos: [0, 10] },
        { tMs: 2400,  pos: [-3, 9.5] },
        { tMs: 5500,  pos: [-4, 9] },
        { tMs: 8600,  pos: [-4.5, 9] },        // 完全に左に流れる
        { tMs: 10500, pos: [-3.5, 9] },         // 戻り始めるが…
        { tMs: 11500, pos: [-1, 9] },           // 追いつかない
      ],
    },
  ],
  dangerZones: [
    { tMs: 0,     center: [0, 0], radius: 0, visible: false },
    { tMs: 5500,  center: [3, 9], radius: 2.5, visible: true },   // 相手側オープンコート出現
    { tMs: 8600,  center: [3.5, 9.5], radius: 3.5, visible: true }, // さらに広がる
    { tMs: 11500, center: [3.5, 9.5], radius: 0.5, visible: false },
  ],
  beats: [
    { tMs: 0,     text: 'クロスラリー開始。相手を左に追い出す準備。' },
    { tMs: 2400,  text: 'クロス1球目：深く厳しく' },
    { tMs: 5500,  text: 'クロス2球目：相手の重心が左に流れる' },
    { tMs: 8600,  text: 'クロス3球目：相手は完全に左寄り。逆サイドが大きく空く！', emphasized: true },
    { tMs: 10500, text: '🎯 今だ！ストレートに展開してウィナー！', emphasized: true },
  ],
}

// ── ダブルス：雁行陣のポーチタイミング ──
const doublesPoachTiming: Scenario = {
  id: 'doubles_poach_timing',
  category: 'DOUBLES_OPPOSITE',
  title: '雁行陣：前衛ポーチのタイミング',
  subtitle: 'クロスラリー中、前衛がポーチに動く瞬間を完全可視化',
  goal: '相手の3球目クロスを狙ってポーチに出る、ダブルスの基本攻撃。',
  proReference: 'ブライアン兄弟の代名詞。',
  durationMs: 9000,
  ballPath: [
    { tMs: 0,    pos: [-3, 0.5, -10] },       // 後衛サーブ後の構え
    { tMs: 1500, pos: [-3, 1.5, 0] },         // クロスへ
    { tMs: 2800, pos: [-3, 0.2, 7] },         // 相手側
    { tMs: 4000, pos: [-3, 1.5, 0] },         // 相手リターン → クロス
    { tMs: 5200, pos: [-2, 1.5, 0] },         // 後衛が打ち返す→
    { tMs: 6300, pos: [3, 1.5, 0] },          // 前衛がポーチで横取り
    { tMs: 7200, pos: [4, 0.2, 8] },          // 相手陣ウィナー
  ],
  players: [
    {
      id: 'you', label: 'あなた（前衛）', side: 'NEAR', color: '#4CAF50', role: 'YOU',
      keyframes: [
        { tMs: 0,    pos: [-2.5, -5] },         // 前衛ポジション
        { tMs: 3000, pos: [-2.5, -5] },
        { tMs: 4500, pos: [-2, -4.5] },         // ポーチ準備
        { tMs: 5800, pos: [0, -3] },            // ポーチで横切る！
        { tMs: 6800, pos: [2, -2.5] },          // フォロースルー前進
      ],
    },
    {
      id: 'partner', label: 'パートナー（後衛）', side: 'NEAR', color: '#42A5F5', role: 'PARTNER',
      keyframes: [
        { tMs: 0,    pos: [-3, -10] },
        { tMs: 1500, pos: [-3, -10] },
        { tMs: 4000, pos: [-3, -10] },
        { tMs: 6000, pos: [-3, -10] },          // ステイ
        { tMs: 7000, pos: [3, -10] },           // スイッチ（ポーチ後はコート逆側へ）
      ],
    },
    {
      id: 'opp1', label: '相手（後衛）', side: 'FAR', color: '#EF5350', role: 'OPP1',
      keyframes: [
        { tMs: 0,    pos: [-3, 10] },
        { tMs: 2800, pos: [-3, 9] },            // クロスを拾う
        { tMs: 4500, pos: [-3, 10] },
        { tMs: 6300, pos: [-2, 10] },           // ポーチで虚を突かれる
      ],
    },
    {
      id: 'opp2', label: '相手（前衛）', side: 'FAR', color: '#EF5350', role: 'OPP2',
      keyframes: [
        { tMs: 0,    pos: [3, 5] },
        { tMs: 9000, pos: [3, 5] },             // ほぼ動かず
      ],
    },
  ],
  dangerZones: [
    { tMs: 0,    center: [0, 0], radius: 0, visible: false },
    { tMs: 4500, center: [0, 0], radius: 2, visible: true },        // センターが危険
    { tMs: 5800, center: [0, -2], radius: 1.5, visible: false },     // ポーチ成功で消失
    { tMs: 6500, center: [4, 8], radius: 2.5, visible: true },       // 相手のオープンに変化
  ],
  beats: [
    { tMs: 0,    text: 'クロスラリー開始。前衛は注視しながらスタンバイ。' },
    { tMs: 3000, text: '前衛は相手後衛の打球方向を読む。' },
    { tMs: 4500, text: '🔥 ポーチのチャンス！相手の3球目クロスを狙う', emphasized: true },
    { tMs: 5800, text: '前衛がセンターを横切ってポーチ！', emphasized: true },
    { tMs: 7000, text: '後衛は必ずスイッチで空いたサイドをカバー。' },
  ],
}

// ── ダブルス：並行陣ロブ対応とスイッチ ──
const doublesParallelLob: Scenario = {
  id: 'doubles_parallel_lob',
  category: 'DOUBLES_PARALLEL',
  title: '並行陣：ロブ対応とスイッチ',
  subtitle: '相手のロブに対し「どちらが追い、どちらがカバーするか」',
  goal: 'ロブを上げられた瞬間の声出しと連動した役割交代（スイッチ）。',
  durationMs: 8000,
  ballPath: [
    { tMs: 0,    pos: [-2, 1.5, 0] },           // ボレーラリー
    { tMs: 800,  pos: [-2, 0.5, -2] },
    { tMs: 1600, pos: [-2, 1.5, 0] },
    { tMs: 2400, pos: [0, 5, 5] },              // 相手がロブ！
    { tMs: 3600, pos: [2, 8, 0] },              // ロブが上がる
    { tMs: 5000, pos: [3, 4, -7] },             // 自分側深くへ
    { tMs: 6200, pos: [3, 1, -10] },            // 着弾
    { tMs: 6800, pos: [3, 2, -5] },             // 拾い上げてロブで返球
    { tMs: 8000, pos: [3, 5, 6] },
  ],
  players: [
    {
      id: 'you', label: 'あなた（前衛右）', side: 'NEAR', color: '#4CAF50', role: 'YOU',
      keyframes: [
        { tMs: 0,    pos: [2.5, -5] },
        { tMs: 2400, pos: [2.5, -5] },
        { tMs: 3600, pos: [2.5, -5] },          // ロブが上がった瞬間
        { tMs: 5500, pos: [3, -10] },           // 自分が追う（右側に来たため）
        { tMs: 7000, pos: [3, -10] },
      ],
    },
    {
      id: 'partner', label: 'パートナー（前衛左）', side: 'NEAR', color: '#42A5F5', role: 'PARTNER',
      keyframes: [
        { tMs: 0,    pos: [-2.5, -5] },
        { tMs: 3600, pos: [-2.5, -5] },
        { tMs: 5500, pos: [-2.5, -3] },         // 前進してネット詰める
        { tMs: 7000, pos: [-1, -2] },           // センターケア
      ],
    },
    {
      id: 'opp1', label: '相手（後衛）', side: 'FAR', color: '#EF5350', role: 'OPP1',
      keyframes: [
        { tMs: 0,    pos: [-3, 6] },
        { tMs: 2400, pos: [-3, 6] },            // ロブを打つ
        { tMs: 8000, pos: [-3, 6] },
      ],
    },
    {
      id: 'opp2', label: '相手（前衛）', side: 'FAR', color: '#EF5350', role: 'OPP2',
      keyframes: [
        { tMs: 0,    pos: [3, 5] },
        { tMs: 8000, pos: [3, 5] },
      ],
    },
  ],
  dangerZones: [
    { tMs: 2400, center: [3, -8], radius: 3, visible: true },       // ロブの落下予想
    { tMs: 4500, center: [3, -10], radius: 2.5, visible: true },    // 着弾点
    { tMs: 6800, center: [3, -10], radius: 1, visible: false },
  ],
  beats: [
    { tMs: 0,    text: '並行陣でネットラリー中。' },
    { tMs: 2400, text: '⚠️ ロブが上がる！「マイン！」「ユアーズ！」と声を出して役割確認。', emphasized: true },
    { tMs: 4000, text: '右側に上がったので右前衛（あなた）が追う。', emphasized: true },
    { tMs: 5500, text: '同時に左前衛は前進してセンターケア＋ネット支配。' },
    { tMs: 7000, text: '高いロブで時間を稼いで陣形再構築が無難。' },
  ],
}

// ── ダブルス：I フォーメーション ──
const doublesIFormation: Scenario = {
  id: 'doubles_i_formation',
  category: 'DOUBLES_I_FORMATION',
  title: 'I フォーメーション基本',
  subtitle: '前衛がセンターでサインを出し、サーブ直後に動く方向を予告',
  goal: 'リターン側を惑わせ、ストレートリターンを牽制し、ポーチで先制。',
  durationMs: 7000,
  ballPath: [
    { tMs: 0,    pos: [-1, 1.5, -9] },           // サーブ準備
    { tMs: 1000, pos: [0, 2, -5] },              // トス
    { tMs: 1500, pos: [-2, 1.5, 0] },            // サーブ通過
    { tMs: 2500, pos: [-3.5, 0, 6] },            // T へキック
    { tMs: 3300, pos: [-3, 1.5, 0] },            // リターン
    { tMs: 4200, pos: [-2, 1.5, 0] },            // ポーチに前衛
    { tMs: 5200, pos: [3, 0.2, 8] },             // ウィナー
  ],
  players: [
    {
      id: 'you', label: 'あなた（サーバー）', side: 'NEAR', color: '#4CAF50', role: 'YOU',
      keyframes: [
        { tMs: 0,    pos: [-1, -10] },
        { tMs: 1500, pos: [-1, -10] },
        { tMs: 2500, pos: [-3, -9] },            // サーブ後に左サイドへスイッチ
        { tMs: 4200, pos: [-3, -7] },
        { tMs: 5200, pos: [-3, -7] },
      ],
    },
    {
      id: 'partner', label: 'パートナー（I 前衛）', side: 'NEAR', color: '#42A5F5', role: 'PARTNER',
      keyframes: [
        { tMs: 0,    pos: [0, -5] },             // センターにしゃがむ
        { tMs: 1500, pos: [0, -5] },
        { tMs: 2500, pos: [0, -5] },             // サーブ通過まで動かず
        { tMs: 3300, pos: [2, -4] },             // ↑ 右側にポーチ！
        { tMs: 4200, pos: [3, -3] },
      ],
    },
    {
      id: 'opp1', label: '相手（リターナー）', side: 'FAR', color: '#EF5350', role: 'OPP1',
      keyframes: [
        { tMs: 0,    pos: [-3.5, 10] },
        { tMs: 2500, pos: [-3.5, 9] },           // T サーブを拾う
        { tMs: 3300, pos: [-3, 9.5] },
      ],
    },
    {
      id: 'opp2', label: '相手（前衛）', side: 'FAR', color: '#EF5350', role: 'OPP2',
      keyframes: [
        { tMs: 0,    pos: [3, 5] },
        { tMs: 7000, pos: [3, 5] },
      ],
    },
  ],
  dangerZones: [
    { tMs: 0,    center: [0, 0], radius: 0, visible: false },
    { tMs: 3300, center: [-3, -3], radius: 2.5, visible: true },     // ストレートも警戒
    { tMs: 4500, center: [3, 8], radius: 3, visible: true },         // ポーチ後のオープン
  ],
  beats: [
    { tMs: 0,    text: '前衛がセンター低姿勢。サーバーは合意のサインで方向を共有。' },
    { tMs: 2500, text: 'T センターへサーブ。前衛は右にポーチ予定。' },
    { tMs: 3300, text: 'リターナーは前衛の動きが読めない！', emphasized: true },
    { tMs: 4200, text: '🔥 前衛がポーチで横取り！', emphasized: true },
    { tMs: 5200, text: 'サーバーは即座にスイッチで右側カバー。' },
  ],
}

// ── ダブルス：対雁行陣の I 崩し ──
const doublesAustralian: Scenario = {
  id: 'doubles_australian',
  category: 'DOUBLES_I_FORMATION',
  title: 'オーストラリアン陣形',
  subtitle: 'サーバーと前衛が同サイドに並んでクロスを封じる',
  goal: '相手のクロスリターンが強烈な時に陣形を変えてストレートに振らせる。',
  proReference: '全豪オープンで多用される由来の戦術。',
  durationMs: 6500,
  ballPath: [
    { tMs: 0,    pos: [-1, 1.5, -9] },
    { tMs: 1000, pos: [0, 2, -5] },
    { tMs: 1800, pos: [-2.5, 0, 6] },           // ワイドサーブ
    { tMs: 2800, pos: [-2, 1.5, 0] },           // リターンはストレートしかない（並んでいるので）
    { tMs: 3800, pos: [-2, 0.5, -5] },          // 前衛が反応
    { tMs: 4800, pos: [3, 1.5, 0] },
    { tMs: 5800, pos: [4, 0.2, 8] },
  ],
  players: [
    {
      id: 'you', label: 'あなた（サーバー）', side: 'NEAR', color: '#4CAF50', role: 'YOU',
      keyframes: [
        { tMs: 0,    pos: [-1, -10] },
        { tMs: 1800, pos: [-1, -10] },
        { tMs: 2800, pos: [2.5, -9] },          // 一気に右側にスイッチ
        { tMs: 4800, pos: [2.5, -7] },
        { tMs: 5800, pos: [2.5, -5] },
      ],
    },
    {
      id: 'partner', label: 'パートナー', side: 'NEAR', color: '#42A5F5', role: 'PARTNER',
      keyframes: [
        { tMs: 0,    pos: [-2.5, -5] },          // ↑ 左前衛（同サイド）
        { tMs: 2800, pos: [-2, -4] },            // ストレートを警戒
        { tMs: 3800, pos: [-2, -3] },            // ボレー前進
        { tMs: 4800, pos: [-1, -3] },
      ],
    },
    {
      id: 'opp1', label: '相手（リターナー）', side: 'FAR', color: '#EF5350', role: 'OPP1',
      keyframes: [
        { tMs: 0,    pos: [-3.5, 10] },
        { tMs: 1800, pos: [-4, 9.5] },           // ワイドサーブを拾いに
        { tMs: 6500, pos: [-3, 9.5] },
      ],
    },
    {
      id: 'opp2', label: '相手（前衛）', side: 'FAR', color: '#EF5350', role: 'OPP2',
      keyframes: [
        { tMs: 0,    pos: [3, 5] },
        { tMs: 6500, pos: [3, 5] },
      ],
    },
  ],
  dangerZones: [
    { tMs: 0,    center: [4, -10], radius: 3, visible: true },       // 右が空いて見えるが…
    { tMs: 2800, center: [-3, -3], radius: 2, visible: true },        // 実はストレートが罠
    { tMs: 4500, center: [4, 8], radius: 2.5, visible: true },
  ],
  beats: [
    { tMs: 0,    text: 'サーバーと前衛が同サイド（左）に並ぶ＝オーストラリアン陣形。' },
    { tMs: 1800, text: 'ワイドサーブで相手リターナーを大きく外へ。' },
    { tMs: 2800, text: '⚠️ クロスは塞いだ。相手はストレートに打つしかない！', emphasized: true },
    { tMs: 3800, text: 'ストレートを前衛がボレーで仕留める。' },
    { tMs: 5800, text: 'サーバーは即座に右サイドへスイッチして陣形維持。' },
  ],
}

export const SCENARIOS: Scenario[] = [
  singlesBisectStraight,
  singlesCrossDtl,
  doublesPoachTiming,
  doublesParallelLob,
  doublesIFormation,
  doublesAustralian,
]

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
  const flipX = <T extends [number, number] | [number, number, number]>(p: T): T => {
    if (p.length === 3) return [-p[0], p[1], p[2]] as T
    return [-p[0], p[1]] as T
  }
  return {
    ...s,
    ballPath: s.ballPath.map(k => ({ ...k, pos: flipX(k.pos) })),
    players: s.players.map(p => ({
      ...p,
      keyframes: p.keyframes.map(k => ({
        ...k, pos: flipX(k.pos),
        facing: k.facing !== undefined ? -k.facing : undefined,
      })),
    })),
    dangerZones: s.dangerZones.map(d => ({ ...d, center: flipX(d.center) })),
  }
}
