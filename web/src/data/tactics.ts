// ProTacticLibrary.kt の主要データを TypeScript に移植。
// 主要 20 個のプロ戦術 + 状況タグ。Android 版の30+から主要分を厳選。

export type SituationCategory = 'SCORE' | 'ROLE' | 'OPPONENT' | 'SELF' | 'ENV' | 'MODE' | 'PHASE'

export const CATEGORY_NAME: Record<SituationCategory, string> = {
  SCORE: 'スコア状況',
  ROLE: 'サーブ／リターン',
  OPPONENT: '相手のスタイル',
  SELF: '自分のコンディション',
  ENV: '環境',
  MODE: '種目',
  PHASE: '試合時間帯',
}

export interface SituationTag {
  id: string
  category: SituationCategory
  ja: string
  emoji: string
}

export const SITUATIONS: SituationTag[] = [
  // スコア
  { id: 'LEADING', category: 'SCORE', ja: 'リードしている', emoji: '📈' },
  { id: 'TRAILING', category: 'SCORE', ja: 'ビハインド', emoji: '📉' },
  { id: 'DEUCE', category: 'SCORE', ja: 'デュース／競り合い', emoji: '⚖️' },
  { id: 'SET_POINT_OWN', category: 'SCORE', ja: '自分のセットポイント', emoji: '🎯' },
  { id: 'SET_POINT_AGAINST', category: 'SCORE', ja: '相手のセットポイント', emoji: '🚨' },
  { id: 'BREAK_POINT_OWN', category: 'SCORE', ja: '自分のブレークポイント', emoji: '🔓' },
  { id: 'BREAK_POINT_AGAINST', category: 'SCORE', ja: '相手のブレークポイント', emoji: '🛡️' },
  { id: 'TIEBREAK', category: 'SCORE', ja: 'タイブレーク中', emoji: '🪢' },
  // サーブ/リターン
  { id: 'SERVING', category: 'ROLE', ja: '自分のサーブ', emoji: '🎾' },
  { id: 'RETURNING', category: 'ROLE', ja: 'リターンサイド', emoji: '🔄' },
  { id: 'SERVING_DEUCE', category: 'ROLE', ja: 'デュースサイドからサーブ', emoji: '➡️' },
  { id: 'SERVING_AD', category: 'ROLE', ja: 'アドサイドからサーブ', emoji: '⬅️' },
  // 相手
  { id: 'OPP_FOREHAND_STRONG', category: 'OPPONENT', ja: '相手のフォアが強い', emoji: '💪' },
  { id: 'OPP_BACKHAND_WEAK', category: 'OPPONENT', ja: '相手のバックが弱い', emoji: '🦴' },
  { id: 'OPP_BIG_SERVE', category: 'OPPONENT', ja: '相手のサーブが速い', emoji: '💥' },
  { id: 'OPP_WEAK_SERVE', category: 'OPPONENT', ja: '相手のサーブが遅い', emoji: '🐢' },
  { id: 'OPP_NET_PLAYER', category: 'OPPONENT', ja: '相手はネットプレーヤー', emoji: '🥅' },
  { id: 'OPP_BASELINER', category: 'OPPONENT', ja: '相手はベースライナー', emoji: '🛤️' },
  { id: 'OPP_LEFT_HANDED', category: 'OPPONENT', ja: '相手は左利き', emoji: '🫲' },
  { id: 'OPP_TALL', category: 'OPPONENT', ja: '相手は背が高い', emoji: '🗼' },
  { id: 'OPP_SLOW_MOVER', category: 'OPPONENT', ja: '相手はフットワークが遅い', emoji: '🦥' },
  { id: 'OPP_AGGRESSIVE', category: 'OPPONENT', ja: '相手は攻撃的', emoji: '🦁' },
  { id: 'OPP_TIRED', category: 'OPPONENT', ja: '相手が疲れている', emoji: '💧' },
  // 自分
  { id: 'SELF_TIRED', category: 'SELF', ja: '自分が疲れている', emoji: '😮‍💨' },
  { id: 'SELF_NERVOUS', category: 'SELF', ja: '緊張している', emoji: '😬' },
  { id: 'SELF_FIRST_SERVE_LOW', category: 'SELF', ja: '1stサーブが入らない', emoji: '📉' },
  { id: 'SELF_WANT_ATTACK', category: 'SELF', ja: '攻めたい気分', emoji: '🔥' },
  { id: 'SELF_WANT_DEFEND', category: 'SELF', ja: '守りに徹したい', emoji: '🛡️' },
  // 環境
  { id: 'WINDY', category: 'ENV', ja: '風が強い', emoji: '🌬️' },
  { id: 'SUNNY', category: 'ENV', ja: '日差しが強い', emoji: '☀️' },
  { id: 'HUMID', category: 'ENV', ja: '蒸し暑い', emoji: '💦' },
  { id: 'HARD_COURT', category: 'ENV', ja: 'ハードコート', emoji: '🟦' },
  { id: 'CLAY_COURT', category: 'ENV', ja: 'クレーコート', emoji: '🟫' },
  { id: 'GRASS_COURT', category: 'ENV', ja: 'グラスコート', emoji: '🟩' },
  { id: 'INDOOR', category: 'ENV', ja: 'インドア', emoji: '🏛️' },
  // 種目
  { id: 'SINGLES', category: 'MODE', ja: 'シングルス', emoji: '👤' },
  { id: 'DOUBLES', category: 'MODE', ja: 'ダブルス', emoji: '👥' },
  // 時間帯
  { id: 'EARLY_GAME', category: 'PHASE', ja: '序盤', emoji: '🌅' },
  { id: 'MID_GAME', category: 'PHASE', ja: '中盤', emoji: '🏃' },
  { id: 'LATE_GAME', category: 'PHASE', ja: '終盤', emoji: '🌆' },
]

export type TacticCategory = 'SERVE' | 'RETURN' | 'BASELINE' | 'NET' | 'DEFENSIVE' | 'MENTAL' | 'DOUBLES' | 'PATTERN'

export const TACTIC_CATEGORY_NAME: Record<TacticCategory, string> = {
  SERVE: 'サーブ戦術',
  RETURN: 'リターン戦術',
  BASELINE: 'ベースライン戦術',
  NET: 'ネットプレー',
  DEFENSIVE: '守備',
  MENTAL: 'メンタル',
  DOUBLES: 'ダブルス専用',
  PATTERN: 'ラリーパターン',
}

export interface ProTactic {
  id: string
  title: string
  emoji: string
  category: TacticCategory
  shortDesc: string
  proReference: string
  executionSteps: string[]
  whenToUse: string
  whenNotToUse: string
  triggers: string[]
  antiTriggers: string[]
  baseConfidence: number
}

export const TACTICS: ProTactic[] = [
  {
    id: 'serve_wide_then_open',
    title: 'ワイドサーブ → オープンコート',
    emoji: '🎯', category: 'SERVE',
    shortDesc: 'ワイドで相手をコート外へ追い出し、空いた逆側を仕留める',
    proReference: 'ロジャー・フェデラーが多用する基本パターン1。',
    executionSteps: [
      'デュースサイドからスライスサーブで相手のフォア外側へ大きく振り出す',
      'サーブ直後、自分は1〜2歩センターに戻る',
      '相手のリターンが浅く返ってきたら3球目をオープンしたバック側へ展開',
      '深く返されたらクロスで時間を使い、もう一度ワイドサーブで反復',
    ],
    whenToUse: 'デュースサイドからのサーブ／相手のフットワークが遅いとき／ハードコートで角度がつくとき',
    whenNotToUse: '強風時はコントロールが難しい／クレーで滑って届かれやすい',
    triggers: ['SERVING', 'SERVING_DEUCE', 'OPP_SLOW_MOVER', 'HARD_COURT', 'OPP_BACKHAND_WEAK'],
    antiTriggers: ['WINDY', 'CLAY_COURT'],
    baseConfidence: 0.85,
  },
  {
    id: 'serve_t_kick',
    title: 'Tセンターへキックサーブ',
    emoji: '⛰️', category: 'SERVE',
    shortDesc: '高く跳ねるキックサーブで相手のバックハンドの肩口を突く',
    proReference: 'ラファエル・ナダル／ノバク・ジョコビッチがアドサイドで多用。',
    executionSteps: [
      'アドサイドからセンター（T）寄りにキックサーブを打つ',
      'ボールの上を強く擦り上げ、ネット上1.2m以上を通す',
      '相手のバック肩口で跳ねたら、3球目はオープンしたフォアサイドへ',
      '返球が高く浅ければ、すぐに前進してフォアの順クロスで決める',
    ],
    whenToUse: 'アドサイドからのサーブ／相手が右利きでバックが弱い／クレーで跳ね上がるコート',
    whenNotToUse: '相手が背が高くハイボレーが得意／強い向かい風',
    triggers: ['SERVING', 'SERVING_AD', 'OPP_BACKHAND_WEAK', 'CLAY_COURT', 'SELF_FIRST_SERVE_LOW'],
    antiTriggers: ['OPP_TALL', 'WINDY'],
    baseConfidence: 0.82,
  },
  {
    id: 'second_serve_kick_safe',
    title: 'セカンドはキックで安全に深く',
    emoji: '🛡️', category: 'SERVE',
    shortDesc: '1stが入らない時こそ確率重視のキックで',
    proReference: 'ジョコビッチが第2セカンドで使う安全策。',
    executionSteps: [
      'ボール上方を擦り上げる縦回転を意識（フラット禁止）',
      'ターゲットはサービスボックス中央〜やや深め',
      '回転をかけてバウンドを高くし、相手の攻撃を抑える',
      '万一甘くなっても深さがあれば叩かれにくい',
    ],
    whenToUse: '1stサーブが入らない／緊張で腕が縮む／ダブルフォルトを避けたい',
    whenNotToUse: '相手が背の高いバックを持つ／インドアで跳ねが小さい',
    triggers: ['SERVING', 'SELF_FIRST_SERVE_LOW', 'SELF_NERVOUS', 'BREAK_POINT_AGAINST'],
    antiTriggers: ['OPP_TALL', 'INDOOR'],
    baseConfidence: 0.86,
  },
  {
    id: 'return_block_deep',
    title: 'ブロックリターンで深く返す',
    emoji: '🧱', category: 'RETURN',
    shortDesc: '速いサーブにはコンパクトに当てて深く',
    proReference: 'アンドレ・アガシのリターン哲学。',
    executionSteps: [
      'テイクバックを最小限にし、ラケット面を作って早めに構える',
      'ボールを打つというより、面で受けて押し返す',
      'ターゲットは相手ベースライン中央〜やや深め',
      '相手のサーブ＆ボレー阻止のため低く返すのも有効',
    ],
    whenToUse: '相手のサーブが速い／緊張している／序盤リターンの感覚を出したい',
    whenNotToUse: '相手のセカンドが緩い時（攻撃に切り替えるべき）',
    triggers: ['RETURNING', 'OPP_BIG_SERVE', 'SELF_NERVOUS', 'EARLY_GAME'],
    antiTriggers: ['OPP_WEAK_SERVE'],
    baseConfidence: 0.82,
  },
  {
    id: 'return_step_in',
    title: '1歩前で叩くアグレッシブリターン',
    emoji: '💥', category: 'RETURN',
    shortDesc: 'ライジングで時間を奪う',
    proReference: 'ノバク・ジョコビッチのリターンの真骨頂。',
    executionSteps: [
      '通常より1〜2歩ベースライン内側で構える',
      'テイクバックを早く完結させ、ライジングで叩く',
      'ターゲットはベースライン深く、コーナー50cm内側',
      'リターン後すぐに前進し、ベースライン上から主導権を取る',
    ],
    whenToUse: '相手のサーブが遅い／自分のリターンの調子がいい／ブレークが欲しい',
    whenNotToUse: '1stサーブが速い相手／リターンミスが続いている',
    triggers: ['RETURNING', 'OPP_WEAK_SERVE', 'BREAK_POINT_OWN', 'SELF_WANT_ATTACK', 'TRAILING'],
    antiTriggers: ['OPP_BIG_SERVE'],
    baseConfidence: 0.80,
  },
  {
    id: 'rally_cross_then_dtl',
    title: 'クロス3球→ダウン・ザ・ライン',
    emoji: '↗️', category: 'BASELINE',
    shortDesc: 'クロスで揺さぶり、相手が外に出たら逆を突く',
    proReference: 'クレー巧者の王道パターン。ラファエル・ナダル／ドミニク・ティーム。',
    executionSteps: [
      '深いクロスを2〜3球連続で打ち、相手をサイドラインの外へ',
      '相手のスタンスがクロス側に流れたのを確認',
      'ボールが浅く来た瞬間、ストレートへ素早く展開',
      'ストレートを打った後はセンターへリカバリー',
    ],
    whenToUse: 'ベースラインラリー戦／クレー／時間を使いたい／自分のフォアの調子が良い',
    whenNotToUse: '相手のフォアがフルパワー／自分のフォアの調子が悪い',
    triggers: ['SINGLES', 'CLAY_COURT', 'OPP_BACKHAND_WEAK', 'MID_GAME', 'SELF_WANT_ATTACK'],
    antiTriggers: ['OPP_FOREHAND_STRONG'],
    baseConfidence: 0.83,
  },
  {
    id: 'high_heavy_to_bh',
    title: '高い弾道のヘビートップスピンをバックへ',
    emoji: '🌋', category: 'BASELINE',
    shortDesc: '相手のバックハンドの肩より上で打たせない',
    proReference: 'ナダルの対フェデラー必勝パターン。',
    executionSteps: [
      'ネット上1.5〜2mを通し、相手バック側深くへ',
      '強いトップスピンで相手肩〜頭の高さで弾ませる',
      '相手は下がるか中ロブ気味になりやすい',
      '中ロブが来たら一気に前進してフォアで仕留める',
    ],
    whenToUse: '相手の片手バック／クレー／自分のフォアの調子が良い',
    whenNotToUse: '風が強い／相手が両手バックでハイボールに強い',
    triggers: ['OPP_BACKHAND_WEAK', 'CLAY_COURT', 'SELF_WANT_ATTACK', 'OPP_TALL'],
    antiTriggers: ['WINDY'],
    baseConfidence: 0.84,
  },
  {
    id: 'drop_shot_chase',
    title: 'ドロップ → 追い球（ロブ or パッシング）',
    emoji: '🐇', category: 'PATTERN',
    shortDesc: '前後に大きく揺さぶり、体力と集中力を削る',
    proReference: 'ノバク・ジョコビッチ／カルロス・アルカラスの定番コンボ。',
    executionSteps: [
      '深いラリーで「下がる印象」を作っておく',
      '突如ネット際にドロップ（高さは3〜4個分まで）',
      '相手が前に出てきたら、止まれば抜くロブ／前なら足元パッシング',
      '決めた後は自分も詰めて高めのポジションで次に備える',
    ],
    whenToUse: '相手が疲れている／フットワークが遅い／クレーで滑る／ペースを変えたい',
    whenNotToUse: '風が強い／相手の前後動が速い',
    triggers: ['OPP_TIRED', 'OPP_SLOW_MOVER', 'CLAY_COURT', 'MID_GAME', 'LATE_GAME', 'SELF_WANT_ATTACK'],
    antiTriggers: ['WINDY'],
    baseConfidence: 0.79,
  },
  {
    id: 'neutral_long_rally',
    title: 'ニュートラルで深いラリー',
    emoji: '♻️', category: 'DEFENSIVE',
    shortDesc: 'ミスを減らし相手のミスを待つ',
    proReference: 'コンシスタンシー派の基本戦術。',
    executionSteps: [
      'ネット上1mの安全マージンで深いボールを返す',
      'コースは中央〜クロス70%、ストレート30%程度',
      '1ポイント10球以上を当たり前と考える',
      '相手が短い球を打つまで攻めない',
    ],
    whenToUse: 'リードしている／緊張している／相手がアグレッシブ／クレー',
    whenNotToUse: '相手が深い球を主導権に変えてくる',
    triggers: ['LEADING', 'SELF_NERVOUS', 'OPP_AGGRESSIVE', 'CLAY_COURT', 'SELF_WANT_DEFEND'],
    antiTriggers: [],
    baseConfidence: 0.78,
  },
  {
    id: 'mental_routine_breath',
    title: 'ポイント間の儀式で再集中',
    emoji: '🧘', category: 'MENTAL',
    shortDesc: 'ガット整え＋深呼吸で頭を冷やす',
    proReference: 'ラファエル・ナダルの完璧なルーティン。',
    executionSteps: [
      'ポイントが終わったら反対側に背を向ける',
      'ガットを4〜5本整えながら3秒で吸って6秒で吐く',
      '頭の中で次のポイントの第一打のコースを決める',
      'ベースラインに戻ったら過去のポイントは忘れる',
    ],
    whenToUse: '緊張している／連続ミスをした／重要な場面の前',
    whenNotToUse: '（特になし、いつでも有効）',
    triggers: ['SELF_NERVOUS', 'BREAK_POINT_OWN', 'BREAK_POINT_AGAINST', 'SET_POINT_OWN', 'SET_POINT_AGAINST', 'TIEBREAK'],
    antiTriggers: [],
    baseConfidence: 0.90,
  },
  {
    id: 'doubles_i_formation',
    title: 'Iフォーメーション',
    emoji: '🅸', category: 'DOUBLES',
    shortDesc: '前衛がセンターに座り、リターン側を惑わす',
    proReference: 'ブライアン兄弟（マイク／ボブ）の代名詞。',
    executionSteps: [
      '前衛がセンターラインにしゃがみ、サインで動く方向を決定',
      'サーバーは合意したコースへサーブ（多くはT or ボディ）',
      '前衛は決めた方向（左or右）へサーブ後すぐ動く',
      'リターナーがコースを読みにくく、ストレートを牽制できる',
    ],
    whenToUse: 'ダブルス／リターンが良い相手／流れを変えたい／タイブレーク',
    whenNotToUse: 'シングルス（無効）／前衛との連携が取れていない',
    triggers: ['DOUBLES', 'OPP_AGGRESSIVE', 'BREAK_POINT_AGAINST', 'TIEBREAK'],
    antiTriggers: ['SINGLES'],
    baseConfidence: 0.82,
  },
  {
    id: 'wind_low_flat',
    title: '風対応：低い弾道で深く',
    emoji: '🌬️', category: 'BASELINE',
    shortDesc: '山なりは禁物、ネット上30〜50cmを通す',
    proReference: 'ウィンブルドン経験者のスタンダード。',
    executionSteps: [
      'トップスピンを少し抑え、フラット気味に',
      'ターゲットはネット上30〜50cmで深く',
      '風下サイドから打つ時は減速、風上サイドは振り抜く',
      'サーブはコースより確率重視。1stを必ず入れる',
    ],
    whenToUse: '屋外で風が強い',
    whenNotToUse: 'インドア',
    triggers: ['WINDY'],
    antiTriggers: ['INDOOR'],
    baseConfidence: 0.82,
  },
  {
    id: 'tiebreak_first_mini_break',
    title: 'タイブレーク：最初のミニブレーク',
    emoji: '🪢', category: 'MENTAL',
    shortDesc: '最初の2ポイントは堅実に。ミニブレーク取れば優位',
    proReference: 'ジョコビッチのタイブレーク勝率の高さの源。',
    executionSteps: [
      'リターン側で始まる場合、最初の2ポイントは絶対1stキープ',
      'サーブ側は1球目を必ず1stで入れる',
      'リスクショットは封印。深いラリーから誘発を待つ',
      '5-3 or 6-4 になったらリードを守るプレーへ',
    ],
    whenToUse: 'タイブレーク開始時／第3セットなどの大事なTB',
    whenNotToUse: '（常に有効）',
    triggers: ['TIEBREAK', 'SELF_NERVOUS'],
    antiTriggers: [],
    baseConfidence: 0.86,
  },
  {
    id: 'leading_protect_serve',
    title: 'リード時：自分のサービスを死守',
    emoji: '👑', category: 'SERVE',
    shortDesc: '相手のリターンミスを誘う安定サーブ',
    proReference: 'ピート・サンプラスのキープ哲学。',
    executionSteps: [
      '1stサーブの確率を80%目標（速度より精度）',
      'コースmix：ワイド/T/ボディを順番に組み合わせる',
      'サービスゲームを早く終わらせる（相手にチャンスを与えない）',
      'ブレークポイントでも普段通りのルーティン',
    ],
    whenToUse: 'リードしている／自分のサービスゲーム／終盤',
    whenNotToUse: 'ビハインド時（リスクが必要）',
    triggers: ['LEADING', 'SERVING', 'LATE_GAME'],
    antiTriggers: ['TRAILING'],
    baseConfidence: 0.84,
  },
  {
    id: 'trailing_break_strategy',
    title: 'ビハインド時：リターンに全集中',
    emoji: '🔥', category: 'RETURN',
    shortDesc: '1ブレーク取り返せば五分。リターンゲームに賭ける',
    proReference: 'ノバク・ジョコビッチのカムバック必勝法。',
    executionSteps: [
      'リターンゲームを「絶対取る」と決める',
      '30-30、30-40 まで持ち込めばチャンス',
      'セカンドサーブは必ず叩く（1〜2歩前で）',
      '自分のサーブは普段通り、力まずキープ',
    ],
    whenToUse: 'ビハインド／リターンゲーム／セット中盤以降',
    whenNotToUse: 'リード時',
    triggers: ['TRAILING', 'RETURNING', 'MID_GAME', 'LATE_GAME', 'BREAK_POINT_OWN'],
    antiTriggers: ['LEADING'],
    baseConfidence: 0.78,
  },
  {
    id: 'vs_lefty_pattern',
    title: '左利き対策：アドサイドのフォアを攻める',
    emoji: '🫲', category: 'PATTERN',
    shortDesc: '右利きとは鏡像。アドサイドで相手のバックを突く',
    proReference: '対ナダル戦略の基本（フェデラー／ジョコビッチ）。',
    executionSteps: [
      'アドサイドでは相手のバックハンド側を狙う',
      'デュースサイドでは相手のフォア側へワイドで逃がし、空いた逆を突く',
      'サーブも普段の鏡像で',
      'ラリーは普段より相手のバック狙いの頻度を意識的に上げる',
    ],
    whenToUse: '相手が左利き／対戦経験が浅い相手',
    whenNotToUse: '（左利き相手以外）',
    triggers: ['OPP_LEFT_HANDED'],
    antiTriggers: [],
    baseConfidence: 0.80,
  },
  {
    id: 'vs_baseliner_drop',
    title: 'ベースライナー対策：前後の揺さぶり',
    emoji: '↕️', category: 'PATTERN',
    shortDesc: '深いラリー2〜3球→ドロップでベースライナーを困らせる',
    proReference: '対ジョコビッチ戦略（フェデラー／アルカラス）。',
    executionSteps: [
      '深いクロスラリーを2〜3球で「下がる印象」を作る',
      '突然のドロップで前に走らせる',
      '前に来た瞬間、ロブで頭上を抜くか足元パッシング',
      '1ゲームに2〜3回まで（読まれないように）',
    ],
    whenToUse: '相手がベースラインに張り付く／フットワークが標準以下',
    whenNotToUse: '風が強い',
    triggers: ['OPP_BASELINER', 'OPP_SLOW_MOVER'],
    antiTriggers: ['WINDY'],
    baseConfidence: 0.81,
  },
  {
    id: 'vs_netplayer_dipping',
    title: 'ネットプレーヤー対策：足元dipping',
    emoji: '👞', category: 'PATTERN',
    shortDesc: '相手の足元へ低く沈むトップスピン',
    proReference: '対サンプラス／対エドバーグ時代の必勝法。',
    executionSteps: [
      'リターンを相手のサービスライン手前の足元に低く落とす',
      '強いトップスピンで沈ませる（フラットNG）',
      '相手がローボレーを上げたらパッシング or ロブ',
      '前進されたら必ず1球は足元に沈める意識',
    ],
    whenToUse: '相手がサーブ＆ボレー／ネットダッシュ多用',
    whenNotToUse: '風が強い／自分のショット精度が悪い',
    triggers: ['OPP_NET_PLAYER', 'OPP_AGGRESSIVE', 'RETURNING'],
    antiTriggers: ['WINDY'],
    baseConfidence: 0.80,
  },
]

export interface ScoredTactic {
  tactic: ProTactic
  score: number
  matchedTriggers: string[]
  matchedAntiTriggers: string[]
}

export function recommendTactics(situations: string[], limit = 5): ScoredTactic[] {
  if (situations.length === 0) return []
  const sel = new Set(situations)
  return TACTICS
    .map((t): ScoredTactic => {
      const matched = t.triggers.filter(x => sel.has(x))
      const antiMatched = t.antiTriggers.filter(x => sel.has(x))
      const matchScore = matched.length / Math.max(1, t.triggers.length)
      const penalty = antiMatched.length * 0.4
      const score = Math.max(0, Math.min(1, matchScore - penalty)) * t.baseConfidence
      return { tactic: t, score, matchedTriggers: matched, matchedAntiTriggers: antiMatched }
    })
    .filter(s => s.score > 0.05)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}
