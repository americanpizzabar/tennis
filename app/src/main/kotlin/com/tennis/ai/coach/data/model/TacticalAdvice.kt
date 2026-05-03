package com.tennis.ai.coach.data.model

import kotlinx.serialization.Serializable

@Serializable
data class TacticalAdvice(
    val id: String = java.util.UUID.randomUUID().toString(),
    val title: String,
    val body: String,
    val urgency: AdviceUrgency = AdviceUrgency.NORMAL,
    val category: AdviceCategory,
    val servePlacementImage: ServePlacementPattern? = null,
    val relatedVideoTimestampMs: Long? = null,
    val confidence: Float = 0.8f,
    val generatedAt: Long = System.currentTimeMillis()
)

enum class AdviceUrgency(val displayNameJa: String) {
    IMMEDIATE("今すぐ実行"),
    NORMAL("次のポイントで"),
    CHANGEOVER("チェンジオーバーで");
}

enum class AdviceCategory(val displayNameJa: String, val emoji: String) {
    SERVE_PLACEMENT("配球", "🎯"),
    OPPONENT_WEAKNESS("相手の弱点", "🔍"),
    DOUBLES_POSITIONING("陣形", "👥"),
    TECHNIQUE("フォーム修正", "🏃"),
    MENTAL("メンタル", "💪"),
    RETURN("リターン", "🔄"),
    NET_PLAY("ネットプレー", "⚡");
}

@Serializable
data class ServePlacementPattern(
    val targetZone: CourtZone,
    val ballType: BallType,
    val speedRecommendation: SpeedLevel,
    val successRatePercent: Int,
    val description: String
)

enum class BallType(val displayNameJa: String) {
    FLAT("フラット"),
    SLICE("スライス"),
    TOPSPIN("トップスピン"),
    KICK("キック"),
    DROP("ドロップ"),
    LOB("ロブ");
}

enum class SpeedLevel(val displayNameJa: String) {
    SLOW("ゆっくり"),
    MEDIUM("普通"),
    FAST("速め"),
    MAXIMUM("全力");
}

@Serializable
data class FrameAnalysisResult(
    val timestamp: Long,
    val detectedBall: BallDetection?,
    val playerPose: PoseMetrics?,
    val opponentPose: PoseMetrics?,
    val doublesFormation: DoublesFormation?,
    val landingPoint: BallLandingPoint?
)

@Serializable
data class BallDetection(
    val x: Float,
    val y: Float,
    val radius: Float,
    val velocityX: Float = 0f,
    val velocityY: Float = 0f,
    val confidence: Float
)
