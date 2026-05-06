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
    val dominantZone: CourtZone? = null,
    /** プレイヤー側の詳細スタッツ。 */
    val player: PlayerMatchStats = PlayerMatchStats(),
    /** 相手側の詳細スタッツ。 */
    val opponent: PlayerMatchStats = PlayerMatchStats(),
)

/**
 * プロのテニス中継で表示される全スタッツを 1 プレイヤー分まとめたもの。
 * 全カウンターはポイント記録から積み上げで計算される。
 *
 * 比率系（1stサーブ確率など）は `--Percent()` ヘルパで派生取得する。
 */
@Serializable
data class PlayerMatchStats(
    // ── サービス（攻撃側） ───────────────────────────
    val aces: Int = 0,
    val doubleFaults: Int = 0,
    val firstServeIn: Int = 0,
    val firstServeAttempts: Int = 0,
    val firstServePointsWon: Int = 0,           // 1st サーブが入ったポイントのうち取った数
    val secondServePointsWon: Int = 0,          // 2nd サーブのポイントのうち取った数
    val secondServeAttempts: Int = 0,
    val breakPointsSaved: Int = 0,
    val breakPointsFaced: Int = 0,
    val serviceGamesWon: Int = 0,
    val serviceGamesPlayed: Int = 0,
    // ── リターン（守備側） ───────────────────────────
    val firstServeReturnPointsWon: Int = 0,
    val firstServeReturnAttempts: Int = 0,
    val secondServeReturnPointsWon: Int = 0,
    val secondServeReturnAttempts: Int = 0,
    val breakPointsConverted: Int = 0,
    val breakPointsAttempted: Int = 0,
    val returnGamesWon: Int = 0,
    val returnGamesPlayed: Int = 0,
    // ── ストローク全体 ─────────────────────────────
    val winners: Int = 0,
    val unforcedErrors: Int = 0,
    val forcedErrors: Int = 0,
    val netApproaches: Int = 0,
    val netApproachesWon: Int = 0,
    val totalPointsWon: Int = 0,
    val totalPointsPlayed: Int = 0,
    // ── 高度なスタッツ ─────────────────────────────
    val forehandWinners: Int = 0,
    val backhandWinners: Int = 0,
    val forehandErrors: Int = 0,
    val backhandErrors: Int = 0,
    val rallyLengthSum: Int = 0,
    val rallyCount: Int = 0,
    val maxBallSpeedKmh: Float = 0f,
    val ballSpeedSum: Float = 0f,
    val ballSpeedSamples: Int = 0,
) {
    fun firstServePercent(): Int = pct(firstServeIn, firstServeAttempts)
    fun firstServePointsWonPercent(): Int = pct(firstServePointsWon, firstServeIn)
    fun secondServePointsWonPercent(): Int = pct(secondServePointsWon, secondServeAttempts)
    fun breakPointsSavedPercent(): Int = pct(breakPointsSaved, breakPointsFaced)
    fun firstServeReturnPointsWonPercent(): Int =
        pct(firstServeReturnPointsWon, firstServeReturnAttempts)
    fun secondServeReturnPointsWonPercent(): Int =
        pct(secondServeReturnPointsWon, secondServeReturnAttempts)
    fun breakPointsWonPercent(): Int = pct(breakPointsConverted, breakPointsAttempted)
    fun returnGamesWonPercent(): Int = pct(returnGamesWon, returnGamesPlayed)
    fun netApproachesWonPercent(): Int = pct(netApproachesWon, netApproaches)
    fun averageRallyLength(): Float =
        if (rallyCount > 0) rallyLengthSum.toFloat() / rallyCount else 0f
    fun averageBallSpeedKmh(): Float =
        if (ballSpeedSamples > 0) ballSpeedSum / ballSpeedSamples else 0f
    fun forehandVsBackhandWinnerRatio(): Pair<Int, Int> = forehandWinners to backhandWinners
    fun shotTolerance(): Float = averageRallyLength()  // 同義：ミスせず続けられた平均球数
}

private fun pct(numerator: Int, denominator: Int): Int =
    if (denominator > 0) (numerator * 100 / denominator) else 0

/** 1 ポイントの結果を分類するカテゴリ。 */
enum class PointCategory(val displayNameJa: String, val emoji: String) {
    ACE("サービスエース", "⚡"),
    SERVICE_WINNER("サービスウィナー", "🎯"),
    DOUBLE_FAULT("ダブルフォルト", "✗"),
    WINNER("ウィナー", "💥"),
    FORCED_ERROR("相手のフォーストエラー", "🔥"),
    UNFORCED_ERROR("自分のアンフォースドエラー", "⚠️"),
    NET_WINNER("ネットでの決定打", "🥅"),
    NORMAL("通常のラリー勝ち", "🎾"),
    UNCATEGORIZED("分類なし", "—");
}

/** スイング種別。FH/BH/サーブ/ボレー/スマッシュ。 */
enum class StrokeType(val displayNameJa: String) {
    UNKNOWN("—"),
    FOREHAND("フォアハンド"),
    BACKHAND("バックハンド"),
    SERVE("サーブ"),
    VOLLEY("ボレー"),
    SMASH("スマッシュ"),
    RETURN("リターン");
}

/** サーブの試行回数（1st / 2nd）。 */
enum class ServeAttempt {
    NONE, FIRST, SECOND;
}
