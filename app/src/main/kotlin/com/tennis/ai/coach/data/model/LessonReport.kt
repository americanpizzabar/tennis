package com.tennis.ai.coach.data.model

import androidx.room.Entity
import androidx.room.PrimaryKey
import kotlinx.serialization.Serializable

/**
 * 個人レッスン記録（試合とは別に管理）。
 * 1 セッション = カメラ前で複数回スイングを練習した一連の録画。
 */
@Entity(tableName = "lesson_reports")
@Serializable
data class LessonReport(
    @PrimaryKey val lessonId: String,
    val playerId: Long,
    val swingType: SwingType,
    val durationSeconds: Int,
    val totalSwings: Int,
    val averageScore: Float,
    val videoPath: String? = null,
    /** スイング 1 本ごとのフィードバック（JSON 配列）。 */
    val swingFeedbacksJson: String = "[]",
    /** 手首軌道（時系列の (x, y) を JSON で保存）。 */
    val wristTrajectoryJson: String = "[]",
    val summaryThreeLines: String = "",
    val createdAt: Long = System.currentTimeMillis(),
)

enum class SwingType(val displayNameJa: String, val emoji: String) {
    FOREHAND("フォアハンド", "🎾"),
    BACKHAND("バックハンド", "🤚"),
    SERVE("サーブ", "🚀"),
    VOLLEY("ボレー", "⚡"),
    SMASH("スマッシュ", "🔨");
}

/** 1 本のスイングの分析結果。 */
@Serializable
data class SwingFeedback(
    val swingIndex: Int,
    val timestampMs: Long,
    /** 0.0〜1.0：スイングの総合得点。 */
    val score: Float,
    /** 計測値。 */
    val swingSpeedKmh: Float,
    val impactHeightCm: Float,
    val kneeAngleDeg: Float,
    val shoulderRotationDeg: Float,
    /** スイングフェーズ別のアドバイス（理想との差分）。 */
    val advicePoints: List<String>,
    val phase: SwingPhase,
)

enum class SwingPhase(val displayNameJa: String) {
    PREPARATION("構え"),
    BACKSWING("テイクバック"),
    FORWARD_SWING("フォワードスイング"),
    CONTACT("インパクト"),
    FOLLOW_THROUGH("フォロースルー"),
    RECOVERY("リカバリー");
}

/** 手首軌道の 1 点（画面比率 0.0〜1.0）。 */
@Serializable
data class TrajectoryPoint(
    val tMs: Long,
    val x: Float,
    val y: Float,
    val speedKmh: Float = 0f,
)
