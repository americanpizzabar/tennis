package com.tennis.ai.coach.ml

import com.google.mediapipe.tasks.vision.poselandmarker.PoseLandmarkerResult
import com.tennis.ai.coach.data.model.*
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import javax.inject.Inject
import javax.inject.Singleton
import kotlin.math.abs

/**
 * ダブルスの陣形をリアルタイム解析。
 * 広角カメラで2人のプレイヤーを検出し、
 * センターギャップや前衛の位置を診断する。
 */
@Singleton
class DoublesPositionAnalyzer @Inject constructor() {

    private val _formationFlow = MutableSharedFlow<DoublesFormation>(replay = 1)
    val formationFlow: SharedFlow<DoublesFormation> = _formationFlow

    private val _alertFlow = MutableSharedFlow<FormationAlert>(replay = 0, extraBufferCapacity = 5)
    val alertFlow: SharedFlow<FormationAlert> = _alertFlow

    data class FormationAlert(
        val message: String,
        val recommendation: FormationType,
        val urgency: FormationAlertUrgency
    )

    enum class FormationAlertUrgency { HIGH, MEDIUM, LOW }

    fun analyzePoseLandmarks(result: PoseLandmarkerResult) {
        val allPoses = result.landmarks()
        if (allPoses.size < 2) return  // ダブルスには最低2人必要

        // 画面上の垂直位置でプレイヤーを分類
        val pose1 = allPoses[0]
        val pose2 = allPoses[1]
        val hipY1 = pose1.getOrNull(23)?.y() ?: 0.5f
        val hipY2 = pose2.getOrNull(23)?.y() ?: 0.5f

        // 画面下側（手前）がプレイヤー、上側（奥）がパートナー
        val (playerPose, partnerPose) = if (hipY1 > hipY2) pose1 to pose2 else pose2 to pose1

        val playerHipY = playerPose.getOrNull(23)?.y() ?: 0.5f
        val partnerHipY = partnerPose.getOrNull(23)?.y() ?: 0.5f
        val playerHipX = playerPose.getOrNull(23)?.x() ?: 0.5f
        val partnerHipX = partnerPose.getOrNull(23)?.x() ?: 0.5f

        val playerPosition = classifyPosition(playerHipY)
        val partnerPosition = classifyPosition(partnerHipY)

        // センターギャップ検知
        val centerGap = abs(playerHipX - 0.5f) > 0.25f && abs(partnerHipX - 0.5f) > 0.25f &&
                (playerHipX - 0.5f) * (partnerHipX - 0.5f) > 0  // 同じサイドにいる
        val isCenterGapOpen = centerGap

        // 前衛が下がりすぎチェック
        val isPartnerTooBack = partnerPosition != CourtPosition.NET &&
                partnerPosition != CourtPosition.SERVICE_LINE

        // 推奨陣形
        val recommendedFormation = when {
            playerPosition == CourtPosition.BASELINE && partnerPosition == CourtPosition.NET ->
                FormationType.ONE_UP_ONE_BACK
            playerPosition == CourtPosition.NET && partnerPosition == CourtPosition.NET ->
                FormationType.PARALLEL
            isCenterGapOpen -> FormationType.AUSTRALIAN
            else -> FormationType.ONE_UP_ONE_BACK
        }

        val formation = DoublesFormation(
            playerPosition = playerPosition,
            partnerPosition = partnerPosition,
            isCenterGapOpen = isCenterGapOpen,
            isPartnerTooBack = isPartnerTooBack,
            recommendedFormation = recommendedFormation
        )

        _formationFlow.tryEmit(formation)
        emitAlertsIfNeeded(formation, partnerPosition)
    }

    fun analyzeFromBitmap(playerY: Float, partnerY: Float, playerX: Float, partnerX: Float) {
        val playerPosition = classifyPosition(playerY)
        val partnerPosition = classifyPosition(partnerY)
        val isCenterGapOpen = abs(playerX - partnerX) > 0.5f
        val isPartnerTooBack = partnerPosition == CourtPosition.BASELINE

        val formation = DoublesFormation(
            playerPosition = playerPosition,
            partnerPosition = partnerPosition,
            isCenterGapOpen = isCenterGapOpen,
            isPartnerTooBack = isPartnerTooBack,
            recommendedFormation = if (isCenterGapOpen) FormationType.AUSTRALIAN else FormationType.ONE_UP_ONE_BACK
        )
        _formationFlow.tryEmit(formation)
        emitAlertsIfNeeded(formation, partnerPosition)
    }

    private fun classifyPosition(normalizedY: Float): CourtPosition = when {
        normalizedY < 0.25f -> CourtPosition.NET
        normalizedY < 0.40f -> CourtPosition.SERVICE_LINE
        normalizedY < 0.60f -> CourtPosition.MID_COURT
        else -> CourtPosition.BASELINE
    }

    private fun emitAlertsIfNeeded(formation: DoublesFormation, partnerPosition: CourtPosition) {
        when {
            formation.isCenterGapOpen -> _alertFlow.tryEmit(
                FormationAlert(
                    message = "センターが空きすぎです！パートナーと縦のラインを合わせてください",
                    recommendation = FormationType.PARALLEL,
                    urgency = FormationAlertUrgency.HIGH
                )
            )
            formation.isPartnerTooBack -> _alertFlow.tryEmit(
                FormationAlert(
                    message = "前衛が下がりすぎ。サービスラインまで詰めて主導権を握りましょう",
                    recommendation = FormationType.ONE_UP_ONE_BACK,
                    urgency = FormationAlertUrgency.MEDIUM
                )
            )
        }
    }
}
