package com.tennis.ai.coach.data.model

import androidx.room.Entity
import androidx.room.PrimaryKey
import kotlinx.serialization.Serializable

@Entity(tableName = "match_reports")
@Serializable
data class MatchReport(
    @PrimaryKey val matchId: String,
    val playerId: Long,
    val matchType: MatchType,
    val durationMinutes: Int,
    val result: MatchResult,
    val finalScore: String,
    val keyMomentsJson: String = "[]",
    val summaryThreeLines: String,
    val weaknessesJson: String = "[]",
    val practiceMenuJson: String = "[]",
    val statsJson: String = "{}",
    /** 録画ファイルの絶対パス（録画していない場合は null）。 */
    val videoPath: String? = null,
    /** ポイント単位の分析スナップショット JSON 配列。 */
    val pointAnalysesJson: String = "[]",
    val createdAt: Long = System.currentTimeMillis()
)

enum class MatchResult(val displayNameJa: String) {
    WIN("勝利"),
    LOSS("敗北"),
    UNFINISHED("未完了");
}

@Serializable
data class KeyMoment(
    val description: String,
    val videoTimestampMs: Long,
    val impactScore: Float,
    val isPositive: Boolean
)

@Serializable
data class PracticeMenuItem(
    val title: String,
    val description: String,
    val priority: Int,
    val estimatedMinutes: Int,
    val drillType: DrillType
)

enum class DrillType(val displayNameJa: String) {
    GROUNDSTROKE("グラウンドストローク"),
    SERVE("サーブ"),
    RETURN("リターン"),
    VOLLEY("ボレー"),
    FOOTWORK("フットワーク"),
    MENTAL("メンタル"),
    TACTICS("戦術");
}

@Serializable
data class MatchStats(
    val firstServePercent: Int = 0,
    val secondServePercent: Int = 0,
    val winnerCount: Int = 0,
    val unforeEdErrorCount: Int = 0,
    val netPointsWonPercent: Int = 0,
    val breakPointsConverted: Int = 0,
    val breakPointsFaced: Int = 0,
    val averageRallyLength: Float = 0f,
    val dominantZone: CourtZone? = null
)
