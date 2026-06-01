package com.tennis.ai.coach.data.lesson

import com.tennis.ai.coach.data.model.SwingPhase
import com.tennis.ai.coach.data.model.SwingType

/**
 * ショット別の理想フォーム定義。
 *
 * 実プロの3Dモーションキャプチャは同梱できないため、コーチング教材・バイオメカニクス
 * 研究で示される「理想の数値レンジ」をデータ化し、自分の計測値と比較する。
 */
object IdealFormLibrary {

    /** 各ショットのチェックポイント定義（理想レンジ付き）。 */
    fun checkpointsFor(swing: SwingType): List<CheckpointSpec> = when (swing) {
        SwingType.SERVE -> serveCheckpoints
        SwingType.FOREHAND -> forehandCheckpoints
        SwingType.BACKHAND_ONE_HANDED -> oneHandedBackhandCheckpoints
        SwingType.BACKHAND_TWO_HANDED -> twoHandedBackhandCheckpoints
        SwingType.SLICE -> sliceCheckpoints
        SwingType.DROP_SHOT -> dropShotCheckpoints
        SwingType.SMASH -> smashCheckpoints
        SwingType.VOLLEY_LOW -> lowVolleyCheckpoints
        SwingType.VOLLEY_HIGH -> highVolleyCheckpoints
    }

    /** ショットに対応する模範プロスタイル一覧。 */
    fun proStylesFor(swing: SwingType): List<ProStyle> = proStyles.filter { swing in it.shots }

    // ── サーブ ────────────────────────────────────────────────
    private val serveCheckpoints = listOf(
        CheckpointSpec(
            id = "serve_toss_height",
            nameJa = "トスの高さ",
            phase = SwingPhase.TROPHY,
            idealText = "打点より20〜40cm高い位置で頂点",
            metric = Metric.TOSS_HEIGHT,
            idealMin = 20f, idealMax = 40f, unit = "cm",
            adviceLow = "トスが低すぎます。腕を伸ばしきった打点より少し高めへ。",
            adviceHigh = "トスが高すぎて落下を待つことになります。頂点付近で打てる高さに。",
            weight = 3,
        ),
        CheckpointSpec(
            id = "serve_toss_lateral",
            nameJa = "トスの横流れ",
            phase = SwingPhase.TROPHY,
            idealText = "体のやや前方〜真上（左右±15cm以内）",
            metric = Metric.TOSS_LATERAL,
            idealMin = -15f, idealMax = 15f, unit = "cm",
            adviceLow = "トスが左に流れています。体の前で安定させましょう。",
            adviceHigh = "トスが右に流れています。一定の位置に上げる練習を。",
            weight = 3,
        ),
        CheckpointSpec(
            id = "serve_knee_bend",
            nameJa = "トロフィーポーズ時の膝の曲げ",
            phase = SwingPhase.TROPHY,
            idealText = "膝角度 110〜130°（しっかり溜める）",
            metric = Metric.KNEE_ANGLE,
            idealMin = 110f, idealMax = 130f, unit = "°",
            adviceLow = "膝を曲げすぎ。力みになるので適度に。",
            adviceHigh = "膝が伸びています。曲げて地面反力を使いましょう。",
            weight = 2,
        ),
        CheckpointSpec(
            id = "serve_pronation",
            nameJa = "プロネーション（手首の返し）",
            phase = SwingPhase.PRONATION,
            idealText = "インパクト後に前腕が内側へ回内",
            metric = Metric.PRONATION,
            idealMin = 60f, idealMax = 120f, unit = "°",
            adviceLow = "手首の返しが不足。スピードとスピンが出ません。",
            adviceHigh = "回内が過剰。自然な返しを意識。",
            weight = 3,
        ),
        CheckpointSpec(
            id = "serve_contact_point",
            nameJa = "打点の高さ",
            phase = SwingPhase.CONTACT,
            idealText = "腕を最大限伸ばした最高到達点",
            metric = Metric.IMPACT_HEIGHT,
            idealMin = 160f, idealMax = 210f, unit = "cm",
            adviceLow = "打点が低い。伸び上がって高い打点で叩く。",
            adviceHigh = "問題ありません。",
            weight = 2,
        ),
    )

    // ── フォアハンド ─────────────────────────────────────────
    private val forehandCheckpoints = listOf(
        CheckpointSpec(
            id = "fh_takeback_timing",
            nameJa = "テイクバック完了タイミング",
            phase = SwingPhase.BACKSWING,
            idealText = "相手の球がバウンドする前に完了",
            metric = Metric.TAKEBACK_TIMING,
            idealMin = -300f, idealMax = 0f, unit = "ms",
            adviceLow = "準備が早すぎて手打ちに。タメを作りましょう。",
            adviceHigh = "テイクバックが遅れています。バウンド前に引き終える。",
            weight = 3,
        ),
        CheckpointSpec(
            id = "fh_contact_point",
            nameJa = "インパクトの打点（体の前方度）",
            phase = SwingPhase.CONTACT,
            idealText = "体の前 +10〜+30cm で捉える",
            metric = Metric.CONTACT_FORWARD,
            idealMin = 10f, idealMax = 30f, unit = "cm",
            adviceLow = "打点が後ろです。もっと前で捉えましょう。",
            adviceHigh = "打点が前すぎて差し込まれ気味。",
            weight = 3,
        ),
        CheckpointSpec(
            id = "fh_shoulder_rotation",
            nameJa = "肩の回転（捻り）",
            phase = SwingPhase.BACKSWING,
            idealText = "肩を90°近く入れてパワーを溜める",
            metric = Metric.SHOULDER_ROTATION,
            idealMin = 70f, idealMax = 110f, unit = "°",
            adviceLow = "上半身の捻りが浅い。肩をしっかり入れる。",
            adviceHigh = "捻りすぎでタイミングが崩れがち。",
            weight = 2,
        ),
        CheckpointSpec(
            id = "fh_knee_bend",
            nameJa = "膝の曲げ（沈み込み）",
            phase = SwingPhase.FORWARD_SWING,
            idealText = "膝角度 130〜160°で地面を使う",
            metric = Metric.KNEE_ANGLE,
            idealMin = 130f, idealMax = 160f, unit = "°",
            adviceLow = "膝を曲げすぎ。",
            adviceHigh = "棒立ちです。膝を使って下half body から打つ。",
            weight = 2,
        ),
        CheckpointSpec(
            id = "fh_wrist_stability",
            nameJa = "インパクト時の手首の固定",
            phase = SwingPhase.CONTACT,
            idealText = "手首をやや背屈で固定（コネないこと）",
            metric = Metric.WRIST_STABILITY,
            idealMin = 70f, idealMax = 100f, unit = "%",
            adviceLow = "手首が緩んでコントロールが不安定。",
            adviceHigh = "問題ありません。",
            weight = 2,
        ),
    )

    // ── 片手バックハンド ─────────────────────────────────────
    private val oneHandedBackhandCheckpoints = listOf(
        CheckpointSpec(
            id = "bh1_contact_point",
            nameJa = "インパクトの打点（前方度）",
            phase = SwingPhase.CONTACT,
            idealText = "片手は特に体の前 +20〜+40cm",
            metric = Metric.CONTACT_FORWARD,
            idealMin = 20f, idealMax = 40f, unit = "cm",
            adviceLow = "打点が後ろ。片手バックは前で捉えないと押されます。",
            adviceHigh = "打点が前すぎます。",
            weight = 3,
        ),
        CheckpointSpec(
            id = "bh1_shoulder_close",
            nameJa = "肩の入れ（横向きキープ）",
            phase = SwingPhase.FORWARD_SWING,
            idealText = "打つ瞬間まで肩を開かない",
            metric = Metric.SHOULDER_ROTATION,
            idealMin = 80f, idealMax = 120f, unit = "°",
            adviceLow = "体が早く開いています。横向きをキープ。",
            adviceHigh = "問題ありません。",
            weight = 3,
        ),
        CheckpointSpec(
            id = "bh1_follow_through",
            nameJa = "フォロースルー（腕の伸び）",
            phase = SwingPhase.FOLLOW_THROUGH,
            idealText = "打球方向へ腕を長く伸ばす（フェデラー型）",
            metric = Metric.FOLLOW_THROUGH_LENGTH,
            idealMin = 60f, idealMax = 100f, unit = "%",
            adviceLow = "振り抜きが短い。フォロースルーを長く。",
            adviceHigh = "問題ありません。",
            weight = 2,
        ),
        CheckpointSpec(
            id = "bh1_knee_bend",
            nameJa = "膝の沈み込み",
            phase = SwingPhase.FORWARD_SWING,
            idealText = "膝角度 120〜150°",
            metric = Metric.KNEE_ANGLE,
            idealMin = 120f, idealMax = 150f, unit = "°",
            adviceLow = "膝を曲げすぎ。",
            adviceHigh = "膝を使って低い球も持ち上げる。",
            weight = 2,
        ),
    )

    // ── 両手バックハンド ─────────────────────────────────────
    private val twoHandedBackhandCheckpoints = listOf(
        CheckpointSpec(
            id = "bh2_contact_point",
            nameJa = "インパクトの打点",
            phase = SwingPhase.CONTACT,
            idealText = "体の前 +10〜+30cm（ジョコビッチ型の安定）",
            metric = Metric.CONTACT_FORWARD,
            idealMin = 10f, idealMax = 30f, unit = "cm",
            adviceLow = "打点が後ろ。両手は前で安定して捉える。",
            adviceHigh = "打点が前すぎ。",
            weight = 3,
        ),
        CheckpointSpec(
            id = "bh2_rotation",
            nameJa = "上半身の回転",
            phase = SwingPhase.BACKSWING,
            idealText = "肩をしっかり回して両肩でリード",
            metric = Metric.SHOULDER_ROTATION,
            idealMin = 70f, idealMax = 110f, unit = "°",
            adviceLow = "回転不足。両肩でしっかり捻る。",
            adviceHigh = "問題ありません。",
            weight = 2,
        ),
        CheckpointSpec(
            id = "bh2_knee_stability",
            nameJa = "下半身の安定（ベース）",
            phase = SwingPhase.CONTACT,
            idealText = "膝角度 130〜160°で安定した土台",
            metric = Metric.KNEE_ANGLE,
            idealMin = 130f, idealMax = 160f, unit = "°",
            adviceLow = "沈みすぎ。",
            adviceHigh = "棒立ち。安定した土台を作る。",
            weight = 2,
        ),
    )

    // ── スライス ──────────────────────────────────────────────
    private val sliceCheckpoints = listOf(
        CheckpointSpec(
            id = "slice_high_to_low",
            nameJa = "高い構え→低い振り抜き",
            phase = SwingPhase.FORWARD_SWING,
            idealText = "高い位置から斜め下へ切る軌道",
            metric = Metric.SWING_PATH_ANGLE,
            idealMin = 15f, idealMax = 40f, unit = "°",
            adviceLow = "切りが浅い。上から下への角度をつける。",
            adviceHigh = "切りすぎて浮きます。",
            weight = 3,
        ),
        CheckpointSpec(
            id = "slice_contact_front",
            nameJa = "打点（前方で捉える）",
            phase = SwingPhase.CONTACT,
            idealText = "体の前 +15〜+35cm",
            metric = Metric.CONTACT_FORWARD,
            idealMin = 15f, idealMax = 35f, unit = "cm",
            adviceLow = "打点が後ろ。スライスは前で薄く当てる。",
            adviceHigh = "打点が前すぎ。",
            weight = 2,
        ),
        CheckpointSpec(
            id = "slice_shoulder_stay",
            nameJa = "肩の開きを抑える",
            phase = SwingPhase.FOLLOW_THROUGH,
            idealText = "横向きキープで安定した滑り",
            metric = Metric.SHOULDER_ROTATION,
            idealMin = 80f, idealMax = 120f, unit = "°",
            adviceLow = "体が開いて浮きます。横向きをキープ。",
            adviceHigh = "問題ありません。",
            weight = 2,
        ),
    )

    // ── ドロップショット ─────────────────────────────────────
    private val dropShotCheckpoints = listOf(
        CheckpointSpec(
            id = "drop_disguise",
            nameJa = "テイクバックの隠し（ストロークと同じ構え）",
            phase = SwingPhase.BACKSWING,
            idealText = "通常ストロークと同じ大きさで予測されない",
            metric = Metric.SHOULDER_ROTATION,
            idealMin = 60f, idealMax = 110f, unit = "°",
            adviceLow = "構えが小さく読まれます。直前まで隠す。",
            adviceHigh = "問題ありません。",
            weight = 3,
        ),
        CheckpointSpec(
            id = "drop_soft_contact",
            nameJa = "インパクトの減速（タッチ）",
            phase = SwingPhase.CONTACT,
            idealText = "ラケットを止めるように当ててスピン",
            metric = Metric.SWING_SPEED,
            idealMin = 10f, idealMax = 40f, unit = "km/h",
            adviceLow = "問題ありません。",
            adviceHigh = "振りすぎて飛びすぎます。当てる瞬間に減速。",
            weight = 3,
        ),
        CheckpointSpec(
            id = "drop_knee_low",
            nameJa = "低い姿勢で繊細に",
            phase = SwingPhase.CONTACT,
            idealText = "膝を曲げ低く構えてタッチ",
            metric = Metric.KNEE_ANGLE,
            idealMin = 110f, idealMax = 145f, unit = "°",
            adviceLow = "沈みすぎ。",
            adviceHigh = "棒立ち。膝を曲げて繊細にコントロール。",
            weight = 2,
        ),
    )

    // ── スマッシュ ───────────────────────────────────────────
    private val smashCheckpoints = listOf(
        CheckpointSpec(
            id = "smash_early_prep",
            nameJa = "早い準備（ラケットを担ぐ）",
            phase = SwingPhase.PREPARATION,
            idealText = "ロブが上がった瞬間に担ぐ",
            metric = Metric.TAKEBACK_TIMING,
            idealMin = -500f, idealMax = -100f, unit = "ms",
            adviceLow = "問題ありません。",
            adviceHigh = "準備が遅れています。すぐ担ぐ。",
            weight = 3,
        ),
        CheckpointSpec(
            id = "smash_contact_high",
            nameJa = "高い打点",
            phase = SwingPhase.CONTACT,
            idealText = "腕を伸ばした最高点で叩く",
            metric = Metric.IMPACT_HEIGHT,
            idealMin = 160f, idealMax = 210f, unit = "cm",
            adviceLow = "打点が低い。伸び上がって高い点で。",
            adviceHigh = "問題ありません。",
            weight = 3,
        ),
        CheckpointSpec(
            id = "smash_nondom_point",
            nameJa = "非利き手で照準",
            phase = SwingPhase.TROPHY,
            idealText = "反対の手をボールに向けてバランス",
            metric = Metric.PRONATION,
            idealMin = 40f, idealMax = 120f, unit = "°",
            adviceLow = "照準と回内が不足。",
            adviceHigh = "問題ありません。",
            weight = 2,
        ),
    )

    // ── ローボレー ───────────────────────────────────────────
    private val lowVolleyCheckpoints = listOf(
        CheckpointSpec(
            id = "lv_compact_takeback",
            nameJa = "コンパクトなテイクバック",
            phase = SwingPhase.BACKSWING,
            idealText = "肩より後ろに引かない（振り遅れ防止）",
            metric = Metric.TAKEBACK_SIZE,
            idealMin = 0f, idealMax = 30f, unit = "cm",
            adviceLow = "問題ありません。",
            adviceHigh = "テイクバックが大きすぎ。コンパクトに止める。",
            weight = 3,
        ),
        CheckpointSpec(
            id = "lv_knee_low",
            nameJa = "膝を曲げて低く入る",
            phase = SwingPhase.CONTACT,
            idealText = "膝角度 100〜140°で目線を下げる",
            metric = Metric.KNEE_ANGLE,
            idealMin = 100f, idealMax = 140f, unit = "°",
            adviceLow = "沈みすぎ。",
            adviceHigh = "棒立ち。低い球は膝を曲げて面を作る。",
            weight = 3,
        ),
        CheckpointSpec(
            id = "lv_split_step",
            nameJa = "スプリットステップのタイミング",
            phase = SwingPhase.PREPARATION,
            idealText = "相手インパクトの瞬間に着地",
            metric = Metric.SPLIT_STEP_TIMING,
            idealMin = -150f, idealMax = 150f, unit = "ms",
            adviceLow = "スプリットが早すぎ。",
            adviceHigh = "スプリットが遅れて反応できていません。",
            weight = 2,
        ),
    )

    // ── ハイボレー ───────────────────────────────────────────
    private val highVolleyCheckpoints = listOf(
        CheckpointSpec(
            id = "hv_compact_takeback",
            nameJa = "コンパクトなテイクバック",
            phase = SwingPhase.BACKSWING,
            idealText = "大きく振らずパンチ（振り遅れ防止）",
            metric = Metric.TAKEBACK_SIZE,
            idealMin = 0f, idealMax = 35f, unit = "cm",
            adviceLow = "問題ありません。",
            adviceHigh = "テイクバックが大きすぎ。コンパクトにパンチ。",
            weight = 3,
        ),
        CheckpointSpec(
            id = "hv_contact_front",
            nameJa = "体の前で叩く",
            phase = SwingPhase.CONTACT,
            idealText = "体の前 +20〜+40cm で押さえる",
            metric = Metric.CONTACT_FORWARD,
            idealMin = 20f, idealMax = 40f, unit = "cm",
            adviceLow = "打点が後ろ。前でしっかり押さえる。",
            adviceHigh = "打点が前すぎ。",
            weight = 3,
        ),
        CheckpointSpec(
            id = "hv_split_step",
            nameJa = "スプリットステップのタイミング",
            phase = SwingPhase.PREPARATION,
            idealText = "相手インパクトの瞬間に着地",
            metric = Metric.SPLIT_STEP_TIMING,
            idealMin = -150f, idealMax = 150f, unit = "ms",
            adviceLow = "スプリットが早すぎ。",
            adviceHigh = "スプリットが遅れています。",
            weight = 2,
        ),
    )

    // ── プロスタイル ─────────────────────────────────────────
    private val proStyles = listOf(
        ProStyle(
            id = "federer_one_bh",
            nameJa = "フェデラー風の流麗な片手バック",
            descriptionJa = "横向きを長くキープし、打点を前に取り、長いフォロースルーで振り抜く。",
            shots = setOf(SwingType.BACKHAND_ONE_HANDED, SwingType.SLICE),
            emphasis = mapOf(
                "bh1_contact_point" to "打点を体の前で",
                "bh1_follow_through" to "腕を長く伸ばす",
            ),
        ),
        ProStyle(
            id = "djokovic_two_bh",
            nameJa = "ジョコビッチ風の強固な両手バック",
            descriptionJa = "安定した土台と早い準備、体の前での確実なインパクトでミスが少ない。",
            shots = setOf(SwingType.BACKHAND_TWO_HANDED),
            emphasis = mapOf(
                "bh2_contact_point" to "前で安定して捉える",
                "bh2_knee_stability" to "下半身の土台を固める",
            ),
        ),
        ProStyle(
            id = "alcaraz_forehand",
            nameJa = "アルカラス風の爆発的フォア",
            descriptionJa = "深い肩の捻りと地面反力で爆発的なスイングスピードを生む。",
            shots = setOf(SwingType.FOREHAND),
            emphasis = mapOf(
                "fh_shoulder_rotation" to "肩を深く入れる",
                "fh_knee_bend" to "膝で地面を使う",
            ),
        ),
        ProStyle(
            id = "sampras_serve",
            nameJa = "サンプラス風のサーブ",
            descriptionJa = "高いトス、深い膝の溜め、強烈なプロネーションで爆発的なサーブ。",
            shots = setOf(SwingType.SERVE),
            emphasis = mapOf(
                "serve_knee_bend" to "膝でしっかり溜める",
                "serve_pronation" to "手首の返しを使う",
            ),
        ),
    )
}

/** チェックポイントの定義（理想レンジ）。 */
data class CheckpointSpec(
    val id: String,
    val nameJa: String,
    val phase: SwingPhase,
    val idealText: String,
    val metric: Metric,
    val idealMin: Float,
    val idealMax: Float,
    val unit: String,
    val adviceLow: String,
    val adviceHigh: String,
    val weight: Int = 1,
)

/** 計測する物理量の種類。 */
enum class Metric {
    TOSS_HEIGHT, TOSS_LATERAL, KNEE_ANGLE, PRONATION, IMPACT_HEIGHT,
    TAKEBACK_TIMING, CONTACT_FORWARD, SHOULDER_ROTATION, WRIST_STABILITY,
    FOLLOW_THROUGH_LENGTH, SWING_PATH_ANGLE, SWING_SPEED, TAKEBACK_SIZE,
    SPLIT_STEP_TIMING,
}

/** 模範プロスタイル。 */
data class ProStyle(
    val id: String,
    val nameJa: String,
    val descriptionJa: String,
    val shots: Set<SwingType>,
    /** チェックポイント id → 強調ポイント。 */
    val emphasis: Map<String, String>,
)
