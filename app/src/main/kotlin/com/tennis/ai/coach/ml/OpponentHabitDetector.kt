package com.tennis.ai.coach.ml

import com.tennis.ai.coach.data.model.*
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import javax.inject.Inject
import javax.inject.Singleton

/**
 * 相手選手の行動パターンを統計的に蓄積し、
 * 一定確率を超えた段階でアラートを発行する。
 */
@Singleton
class OpponentHabitDetector @Inject constructor() {

    private val _habitFlow = MutableSharedFlow<OpponentHabit>(replay = 0, extraBufferCapacity = 10)
    val habitFlow: SharedFlow<OpponentHabit> = _habitFlow

    private val eventLog = ArrayDeque<RallyEvent>(200)
    private val detectedHabits = mutableMapOf<String, HabitAccumulator>()

    // サーブトスの傾き記録
    private val serveTossPositions = ArrayDeque<Float>(30)
    // バックハンド時のショット種別記録
    private val backhandTypes = ArrayDeque<BallType>(50)
    // リターン方向記録
    private val returnDirections = ArrayDeque<Float>(30)

    data class RallyEvent(
        val shotType: ShotType,
        val ballType: BallType,
        val landingZone: CourtZone,
        val isOpponentShot: Boolean,
        val additionalData: Map<String, Float> = emptyMap(),
        val timestamp: Long = System.currentTimeMillis()
    )

    enum class ShotType {
        SERVE, FOREHAND, BACKHAND, VOLLEY, SMASH, RETURN, LOB
    }

    private data class HabitAccumulator(
        val habitId: String,
        val description: String,
        val category: HabitCategory,
        var occurrenceCount: Int = 0,
        var totalObservations: Int = 0
    ) {
        val confidence: Float get() =
            if (totalObservations < 5) 0f
            else occurrenceCount.toFloat() / totalObservations.toFloat()
    }

    fun recordOpponentEvent(event: RallyEvent) {
        if (!event.isOpponentShot) return
        eventLog.addLast(event)
        if (eventLog.size > 200) eventLog.removeFirst()

        when (event.shotType) {
            ShotType.BACKHAND -> analyzeBackhand(event)
            ShotType.SERVE -> analyzeServe(event)
            ShotType.FOREHAND -> analyzeForehand(event)
            ShotType.RETURN -> analyzeReturn(event)
            else -> {}
        }

        checkAndEmitHabits()
    }

    fun recordServeTossPosition(normalizedX: Float) {
        serveTossPositions.addLast(normalizedX)
        if (serveTossPositions.size > 30) serveTossPositions.removeFirst()
        analyzeServeTossHabit()
    }

    private fun analyzeBackhand(event: RallyEvent) {
        backhandTypes.addLast(event.ballType)
        if (backhandTypes.size > 50) backhandTypes.removeFirst()

        val sliceCount = backhandTypes.count { it == BallType.SLICE }
        val total = backhandTypes.size

        val acc = detectedHabits.getOrPut("bh_slice_tendency") {
            HabitAccumulator(
                "bh_slice_tendency",
                "相手はバックハンドを打つ時、ほぼ必ずスライスになります",
                HabitCategory.BACKHAND
            )
        }
        acc.occurrenceCount = sliceCount
        acc.totalObservations = total
    }

    private fun analyzeServe(event: RallyEvent) {
        val acc = detectedHabits.getOrPut("serve_wide_tendency") {
            HabitAccumulator(
                "serve_wide_tendency",
                "相手の2ndサーブはボディに集まりやすい",
                HabitCategory.SERVE
            )
        }
        val isBody = event.landingZone == CourtZone.CENTER_BASELINE ||
                event.landingZone == CourtZone.DEUCE_SERVICE_BOX
        if (isBody) acc.occurrenceCount++
        acc.totalObservations++
    }

    private fun analyzeForehand(event: RallyEvent) {
        val acc = detectedHabits.getOrPut("fh_crosscourt_tendency") {
            HabitAccumulator(
                "相手のフォアはクロスコートに集まります。逆サイドを空けて待ちましょう",
                "相手フォアハンドはクロス多用",
                HabitCategory.FOREHAND
            )
        }
        val isCross = event.landingZone == CourtZone.DEUCE_BASELINE ||
                event.landingZone == CourtZone.AD_BASELINE
        if (isCross) acc.occurrenceCount++
        acc.totalObservations++
    }

    private fun analyzeReturn(event: RallyEvent) {
        returnDirections.addLast(event.landingZone.ordinal.toFloat())
        if (returnDirections.size > 30) returnDirections.removeFirst()
    }

    private fun analyzeServeTossHabit() {
        if (serveTossPositions.size < 10) return
        val avgToss = serveTossPositions.average().toFloat()
        val acc = detectedHabits.getOrPut("serve_toss_left") {
            HabitAccumulator(
                "serve_toss_left",
                "サーブ時のトスが左に寄るとワイドへの確率が高いです",
                HabitCategory.SERVE
            )
        }
        val leftBias = serveTossPositions.count { it < 0.45f }
        acc.occurrenceCount = leftBias
        acc.totalObservations = serveTossPositions.size
    }

    private fun checkAndEmitHabits() {
        detectedHabits.values
            .filter { it.confidence >= 0.65f && it.totalObservations >= 5 }
            .forEach { acc ->
                _habitFlow.tryEmit(
                    OpponentHabit(
                        id = acc.habitId,
                        description = acc.description,
                        confidence = acc.confidence,
                        category = acc.category
                    )
                )
            }
    }

    fun getDetectedHabits(): List<OpponentHabit> =
        detectedHabits.values
            .filter { it.confidence >= 0.5f }
            .map { acc ->
                OpponentHabit(
                    id = acc.habitId,
                    description = acc.description,
                    confidence = acc.confidence,
                    category = acc.category
                )
            }
            .sortedByDescending { it.confidence }

    fun reset() {
        eventLog.clear()
        detectedHabits.clear()
        serveTossPositions.clear()
        backhandTypes.clear()
        returnDirections.clear()
    }
}
