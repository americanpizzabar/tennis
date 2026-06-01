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
    /** ショット別チェックポイント結果（JSON 配列）。 */
    val checkpointResultsJson: String = "[]",
    /** クリーンヒット判定の結果（JSON）。 */
    val cleanHitSummaryJson: String = "{}",
    /** 推奨ドリル（JSON 配列）。 */
    val recommendedDrillsJson: String = "[]",
    /** 比較したプロスタイル（任意）。 */
    val comparedProStyle: String? = null,
    val summaryThreeLines: String = "",
    val createdAt: Long = System.currentTimeMillis(),
)

/** テニスの主要ショットを網羅。 */
enum class SwingType(val displayNameJa: String, val emoji: String, val category: ShotCategory) {
    FOREHAND("フォアハンド", "🎾", ShotCategory.GROUNDSTROKE),
    BACKHAND_ONE_HANDED("片手バックハンド", "🤚", ShotCategory.GROUNDSTROKE),
    BACKHAND_TWO_HANDED("両手バックハンド", "🙌", ShotCategory.GROUNDSTROKE),
    SLICE("スライス", "🔪", ShotCategory.GROUNDSTROKE),
    DROP_SHOT("ドロップショット", "💧", ShotCategory.TOUCH),
    SERVE("サーブ", "🚀", ShotCategory.SERVE),
    SMASH("スマッシュ", "🔨", ShotCategory.OVERHEAD),
    VOLLEY_LOW("ローボレー", "⬇️", ShotCategory.NET),
    VOLLEY_HIGH("ハイボレー", "⬆️", ShotCategory.NET);
}

enum class ShotCategory(val displayNameJa: String) {
    GROUNDSTROKE("ストローク"),
    SERVE("サーブ"),
    OVERHEAD("オーバーヘッド"),
    NET("ネットプレー"),
    TOUCH("タッチショット");
}

/** スイングのフェーズ。 */
enum class SwingPhase(val displayNameJa: String) {
    PREPARATION("構え"),
    BACKSWING("テイクバック"),
    TROPHY("トロフィーポーズ"),     // サーブ専用
    FORWARD_SWING("フォワードスイング"),
    CONTACT("インパクト"),
    PRONATION("プロネーション"),     // サーブ専用
    FOLLOW_THROUGH("フォロースルー"),
    RECOVERY("リカバリー");
}

/** 1 本のスイングの分析結果。 */
@Serializable
data class SwingFeedback(
    val swingIndex: Int,
    val timestampMs: Long,
    /** 0.0〜1.0：スイングの総合得点。 */
    val score: Float,
    val swingSpeedKmh: Float,
    val impactHeightCm: Float,
    val kneeAngleDeg: Float,
    val shoulderRotationDeg: Float,
    /** スイングフェーズ別のアドバイス（理想との差分）。 */
    val advicePoints: List<String>,
    val phase: SwingPhase,
    /** クリーンヒットだったか（音解析と連動）。 */
    val cleanHit: Boolean = false,
)

/** 手首軌道の 1 点（画面比率 0.0〜1.0）。 */
@Serializable
data class TrajectoryPoint(
    val tMs: Long,
    val x: Float,
    val y: Float,
    val speedKmh: Float = 0f,
)

// ── チェックポイント ─────────────────────────────────────────

/**
 * ショット別の「超重要チェックポイント」の評価結果。
 * 例：「インパクト時の打点が体の前方か」を 0〜100 で採点。
 */
@Serializable
data class CheckpointResult(
    val checkpointId: String,
    val nameJa: String,
    val phase: SwingPhase,
    /** 計測した実値（表示用の文字列、例「打点 -18cm」）。 */
    val measuredText: String,
    /** 理想の目標（例「体の前 +10〜+30cm」）。 */
    val idealText: String,
    /** 0〜100 の達成度。 */
    val score: Int,
    /** この項目の具体的アドバイス。 */
    val adviceJa: String,
    /** 重要度（高いほど優先表示）。 */
    val weight: Int = 1,
)

/** クリーンヒット分析の集計。 */
@Serializable
data class CleanHitSummary(
    val totalDetectedHits: Int = 0,
    val cleanHits: Int = 0,
    val mishits: Int = 0,
    /** クリーンヒット率（0〜100）。 */
    val cleanHitPercent: Int = 0,
    /** ミスヒット時に共通していた崩れ（例「体が開きすぎ」）。 */
    val commonMishitCausesJa: List<String> = emptyList(),
)

// ── ドリル（練習メニュー） ───────────────────────────────────

@Serializable
data class RecommendedDrill(
    val titleJa: String,
    val descriptionJa: String,
    /** なぜこのドリルか（弱点との対応）。 */
    val reasonJa: String,
    val targetSwingType: SwingType,
    val recommendedReps: Int,
    val estimatedMinutes: Int,
    val priority: Int,    // 1 が最優先
)
