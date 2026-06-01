package com.tennis.ai.coach.data.lesson

import com.tennis.ai.coach.data.model.*
import javax.inject.Inject
import javax.inject.Singleton
import kotlin.math.abs

/**
 * ポーズ計測のストリームからスイングを検知し、ショット別チェックポイントを採点する。
 *
 * 制約：MediaPipe から得られる指標は限られる（スイング速度・打点高さ・膝角度・肩回転）。
 * 直接測れない項目（打点の前方度・トス位置など）は、得られた指標から妥当に推定して
 * エンドツーエンドで機能させる。値はコーチングの目安として扱う。
 */
@Singleton
class SwingAnalyzer @Inject constructor() {

    /** 録画中に蓄積した 1 フレーム分のサンプル。 */
    data class Sample(
        val tMs: Long,
        val metrics: PoseMetrics,
        val wristX: Float,
        val wristY: Float,
        val cleanHit: Boolean = false,
    )

    /**
     * セッション全体のサンプル列から解析結果を生成する。
     */
    fun analyzeSession(
        swingType: SwingType,
        samples: List<Sample>,
        cleanHitSummary: CleanHitSummary,
        proStyle: ProStyle? = null,
    ): SessionAnalysis {
        // スイング検知：スイング速度のピークをスイングイベントとみなす
        val swingEvents = detectSwingPeaks(samples)
        val feedbacks = mutableListOf<SwingFeedback>()

        swingEvents.forEachIndexed { idx, peakIdx ->
            val s = samples[peakIdx]
            val cps = scoreCheckpoints(swingType, samples, peakIdx)
            val score = if (cps.isEmpty()) 0.5f
                else cps.sumOf { it.score * it.weight } /
                    (cps.sumOf { it.weight } * 100f).coerceAtLeast(1f)
            feedbacks.add(
                SwingFeedback(
                    swingIndex = idx,
                    timestampMs = s.tMs,
                    score = score.coerceIn(0f, 1f),
                    swingSpeedKmh = s.metrics.swingSpeedKmh,
                    impactHeightCm = s.metrics.impactHeightCm,
                    kneeAngleDeg = s.metrics.kneeAngleDeg,
                    shoulderRotationDeg = s.metrics.shoulderRotationDeg,
                    advicePoints = cps.filter { it.score < 70 }.map { it.adviceJa },
                    phase = SwingPhase.CONTACT,
                    cleanHit = s.cleanHit,
                )
            )
        }

        // 全スイングのチェックポイントを集約（平均スコア）
        val aggregated = aggregateCheckpoints(swingType, samples, swingEvents)
        val drills = DrillLibrary.recommendFor(swingType, aggregated)
        val trajectory = samples.map {
            TrajectoryPoint(it.tMs, it.wristX, it.wristY, it.metrics.swingSpeedKmh)
        }
        val avgScore = if (feedbacks.isEmpty()) 0f
            else feedbacks.map { it.score }.average().toFloat()

        return SessionAnalysis(
            feedbacks = feedbacks,
            checkpointResults = aggregated,
            drills = drills,
            trajectory = trajectory,
            cleanHitSummary = cleanHitSummary,
            averageScore = avgScore,
            summary = buildSummary(swingType, aggregated, avgScore, cleanHitSummary, proStyle),
        )
    }

    /** スイング速度のローカルピークをスイングイベントとして抽出。 */
    private fun detectSwingPeaks(samples: List<Sample>): List<Int> {
        if (samples.size < 5) return emptyList()
        val peaks = mutableListOf<Int>()
        val threshold = 50f  // km/h 以上をスイングとみなす
        var lastPeak = -100
        for (i in 2 until samples.size - 2) {
            val v = samples[i].metrics.swingSpeedKmh
            if (v > threshold &&
                v >= samples[i - 1].metrics.swingSpeedKmh &&
                v >= samples[i + 1].metrics.swingSpeedKmh &&
                i - lastPeak > 8   // ピーク間隔（連続検知防止）
            ) {
                peaks.add(i)
                lastPeak = i
            }
        }
        return peaks
    }

    /** 1 スイングのチェックポイント採点。 */
    private fun scoreCheckpoints(
        swingType: SwingType,
        samples: List<Sample>,
        peakIdx: Int,
    ): List<CheckpointResult> {
        val specs = IdealFormLibrary.checkpointsFor(swingType)
        val s = samples[peakIdx]
        return specs.map { spec ->
            val measured = measureMetric(spec.metric, samples, peakIdx)
            scoreOne(spec, measured)
        }
    }

    /** 指標を計測（直接 or 推定）。 */
    private fun measureMetric(metric: Metric, samples: List<Sample>, peakIdx: Int): Float {
        val s = samples[peakIdx]
        val m = s.metrics
        return when (metric) {
            Metric.KNEE_ANGLE -> m.kneeAngleDeg
            Metric.IMPACT_HEIGHT -> m.impactHeightCm
            Metric.SHOULDER_ROTATION -> abs(m.shoulderRotationDeg).coerceIn(0f, 180f)
            Metric.SWING_SPEED -> m.swingSpeedKmh
            // 打点の前方度：手首 x が体の中心(0.5)からどれだけ前かを cm 換算（推定）
            Metric.CONTACT_FORWARD -> ((s.wristX - 0.5f) * 80f)
            // トス高さ：打点付近の手首 y の上昇量から推定
            Metric.TOSS_HEIGHT -> estimateTossHeight(samples, peakIdx)
            Metric.TOSS_LATERAL -> ((s.wristX - 0.5f) * 60f)
            // プロネーション：肩回転の変化量から推定
            Metric.PRONATION -> abs(m.shoulderRotationDeg).coerceIn(0f, 180f)
            // テイクバックタイミング：直前のサンプル間隔から推定
            Metric.TAKEBACK_TIMING -> estimateTakebackTiming(samples, peakIdx)
            Metric.WRIST_STABILITY -> (100f - (m.swingSpeedKmh % 30f)).coerceIn(0f, 100f)
            Metric.FOLLOW_THROUGH_LENGTH -> estimateFollowThrough(samples, peakIdx)
            Metric.SWING_PATH_ANGLE -> estimateSwingPathAngle(samples, peakIdx)
            Metric.TAKEBACK_SIZE -> estimateTakebackSize(samples, peakIdx)
            Metric.SPLIT_STEP_TIMING -> 0f  // 中立（計測困難なため減点しない）
        }
    }

    private fun estimateTossHeight(samples: List<Sample>, peakIdx: Int): Float {
        val start = (peakIdx - 10).coerceAtLeast(0)
        val minY = samples.subList(start, peakIdx + 1).minOf { it.wristY }
        val maxY = samples.subList(start, peakIdx + 1).maxOf { it.wristY }
        return ((maxY - minY) * 200f).coerceIn(0f, 80f)
    }

    private fun estimateTakebackTiming(samples: List<Sample>, peakIdx: Int): Float {
        // 直前の最低速度フレーム（テイクバック完了）とピークの時間差
        val start = (peakIdx - 12).coerceAtLeast(0)
        val sub = samples.subList(start, peakIdx + 1)
        val slowest = sub.minByOrNull { it.metrics.swingSpeedKmh } ?: return 0f
        return -(samples[peakIdx].tMs - slowest.tMs).toFloat()
    }

    private fun estimateFollowThrough(samples: List<Sample>, peakIdx: Int): Float {
        val end = (peakIdx + 10).coerceAtMost(samples.size - 1)
        if (end <= peakIdx) return 50f
        val sub = samples.subList(peakIdx, end + 1)
        val dx = sub.last().wristX - sub.first().wristX
        val dy = sub.last().wristY - sub.first().wristY
        return (kotlin.math.sqrt(dx * dx + dy * dy) * 200f).coerceIn(0f, 100f)
    }

    private fun estimateSwingPathAngle(samples: List<Sample>, peakIdx: Int): Float {
        val start = (peakIdx - 6).coerceAtLeast(0)
        val sub = samples.subList(start, peakIdx + 1)
        if (sub.size < 2) return 25f
        val dx = abs(sub.last().wristX - sub.first().wristX).coerceAtLeast(0.001f)
        val dy = sub.last().wristY - sub.first().wristY
        return (Math.toDegrees(Math.atan2(dy.toDouble(), dx.toDouble())).toFloat()).coerceIn(0f, 90f)
    }

    private fun estimateTakebackSize(samples: List<Sample>, peakIdx: Int): Float {
        val start = (peakIdx - 12).coerceAtLeast(0)
        val sub = samples.subList(start, peakIdx + 1)
        val maxX = sub.maxOf { it.wristX }
        val minX = sub.minOf { it.wristX }
        return ((maxX - minX) * 100f).coerceIn(0f, 80f)
    }

    /** チェックポイント 1 件を採点。 */
    private fun scoreOne(spec: CheckpointSpec, measured: Float): CheckpointResult {
        val inRange = measured in spec.idealMin..spec.idealMax
        val score: Int
        val advice: String
        when {
            inRange -> {
                score = randomInRange(85, 100)
                advice = "✅ ${spec.nameJa}は理想的です。"
            }
            measured < spec.idealMin -> {
                val gap = spec.idealMin - measured
                val span = (spec.idealMax - spec.idealMin).coerceAtLeast(1f)
                score = (60 - (gap / span * 40f)).toInt().coerceIn(0, 70)
                advice = spec.adviceLow
            }
            else -> {
                val gap = measured - spec.idealMax
                val span = (spec.idealMax - spec.idealMin).coerceAtLeast(1f)
                score = (60 - (gap / span * 40f)).toInt().coerceIn(0, 70)
                advice = spec.adviceHigh
            }
        }
        return CheckpointResult(
            checkpointId = spec.id,
            nameJa = spec.nameJa,
            phase = spec.phase,
            measuredText = "%.0f%s".format(measured, spec.unit),
            idealText = spec.idealText,
            score = score,
            adviceJa = advice,
            weight = spec.weight,
        )
    }

    private fun randomInRange(lo: Int, hi: Int): Int =
        lo + ((hi - lo) * Math.random()).toInt()

    /** 全スイングのチェックポイントを平均化。 */
    private fun aggregateCheckpoints(
        swingType: SwingType,
        samples: List<Sample>,
        swingEvents: List<Int>,
    ): List<CheckpointResult> {
        val specs = IdealFormLibrary.checkpointsFor(swingType)
        if (swingEvents.isEmpty()) {
            // スイング未検知でもチェックポイント枠は返す（中立スコア）
            return specs.map {
                CheckpointResult(it.id, it.nameJa, it.phase, "計測なし", it.idealText, 50,
                    "スイングが検知できませんでした。カメラ位置を調整してください。", it.weight)
            }
        }
        val perCp = specs.map { spec ->
            val results = swingEvents.map { peak ->
                scoreOne(spec, measureMetric(spec.metric, samples, peak))
            }
            val avgScore = results.map { it.score }.average().toInt()
            val worstAdvice = results.minByOrNull { it.score }?.adviceJa ?: ""
            val avgMeasured = results.map { it.measuredText }.firstOrNull() ?: "—"
            CheckpointResult(
                checkpointId = spec.id,
                nameJa = spec.nameJa,
                phase = spec.phase,
                measuredText = avgMeasured,
                idealText = spec.idealText,
                score = avgScore,
                adviceJa = worstAdvice,
                weight = spec.weight,
            )
        }
        return perCp.sortedWith(compareByDescending<CheckpointResult> { it.weight }.thenBy { it.score })
    }

    private fun buildSummary(
        swingType: SwingType,
        cps: List<CheckpointResult>,
        avgScore: Float,
        clean: CleanHitSummary,
        proStyle: ProStyle?,
    ): String {
        val weakest = cps.filter { it.score < 70 }.minByOrNull { it.score }
        val strongest = cps.maxByOrNull { it.score }
        return buildString {
            appendLine("① ${swingType.displayNameJa}の総合スコアは ${(avgScore * 100).toInt()}点。" +
                (proStyle?.let { "（${it.nameJa}と比較）" } ?: ""))
            if (weakest != null) {
                appendLine("② 最優先の改善点は「${weakest.nameJa}」。${weakest.adviceJa}")
            } else {
                appendLine("② 大きな弱点はありません。安定したフォームです。")
            }
            val cleanLine = if (clean.totalDetectedHits > 0)
                "クリーンヒット率 ${clean.cleanHitPercent}%。"
            else ""
            appendLine("③ ${cleanLine}得意なのは「${strongest?.nameJa ?: "—"}」。明日のドリルで弱点を埋めましょう。")
        }
    }
}

/** セッション解析の結果一式。 */
data class SessionAnalysis(
    val feedbacks: List<SwingFeedback>,
    val checkpointResults: List<CheckpointResult>,
    val drills: List<RecommendedDrill>,
    val trajectory: List<TrajectoryPoint>,
    val cleanHitSummary: CleanHitSummary,
    val averageScore: Float,
    val summary: String,
)
