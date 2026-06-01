package com.tennis.ai.coach.data.model

import kotlinx.serialization.Serializable

@Serializable
data class MatchState(
    val matchId: String = "",
    val matchType: MatchType = MatchType.SINGLES,
    val currentSet: Int = 1,
    val playerScore: ScoreState = ScoreState(),
    val opponentScore: ScoreState = ScoreState(),
    val isChangeover: Boolean = false,
    val isDeuce: Boolean = false,
    val servingPlayer: ServingPlayer = ServingPlayer.PLAYER,
    val rallyCount: Int = 0,
    val totalPoints: Int = 0,
    val elapsedMillis: Long = 0L,
    val phase: MatchPhase = MatchPhase.POINT
)

@Serializable
data class ScoreState(
    val sets: List<Int> = emptyList(),
    val games: Int = 0,
    val points: TennisPoint = TennisPoint.ZERO
)

enum class TennisPoint(val display: String) {
    ZERO("0"),
    FIFTEEN("15"),
    THIRTY("30"),
    FORTY("40"),
    ADVANTAGE("AD");
}

enum class DeuceRule(val displayNameJa: String, val description: String) {
    STANDARD_AD("デュース／アドバンテージ", "40-40 から 2 ポイント連取で勝ち（伝統ルール）"),
    NO_AD("ノーアドバンテージ", "40-40 になったら次の 1 ポイント取った方が勝ち（決定戦方式）"),
    SEMI_AD("セミアドバンテージ", "1 回目のデュースは AD 方式、2 回目以降の 40-40 は次の 1 ポイントで決着");
}

enum class ServingPlayer { PLAYER, OPPONENT }

enum class MatchPhase(val displayNameJa: String) {
    POINT("ポイント中"),
    CHANGEOVER("チェンジオーバー"),
    TIEBREAK("タイブレーク"),
    BREAK_POINT("ブレークポイント"),
    GAME_POINT("ゲームポイント"),
    SET_POINT("セットポイント"),
    MATCH_POINT("マッチポイント");
}

@Serializable
data class BallLandingPoint(
    val x: Float,
    val y: Float,
    val isInCourt: Boolean,
    val zone: CourtZone,
    val timestampMs: Long = System.currentTimeMillis()
)

enum class CourtZone(val displayNameJa: String) {
    DEUCE_SERVICE_BOX("デュースサービスボックス"),
    AD_SERVICE_BOX("アドサービスボックス"),
    DEUCE_BASELINE("デュースベースライン"),
    AD_BASELINE("アドベースライン"),
    CENTER_BASELINE("センターベースライン"),
    NET("ネット"),
    OUT("アウト");
}

@Serializable
data class PoseMetrics(
    val swingSpeedKmh: Float = 0f,
    val impactHeightCm: Float = 0f,
    val kneeAngleDeg: Float = 0f,
    val shoulderRotationDeg: Float = 0f,
    val elapsedSinceLastShot: Long = 0L,
    /** 利き手側手首の正規化座標（0〜1）。スイング軌道解析に使用。 */
    val wristX: Float = 0.5f,
    val wristY: Float = 0.5f,
)

@Serializable
data class DoublesFormation(
    val playerPosition: CourtPosition = CourtPosition.BASELINE,
    val partnerPosition: CourtPosition = CourtPosition.NET,
    val isCenterGapOpen: Boolean = false,
    val isPartnerTooBack: Boolean = false,
    val recommendedFormation: FormationType = FormationType.PARALLEL
)

enum class CourtPosition(val displayNameJa: String) {
    BASELINE("ベースライン"),
    MID_COURT("ミッドコート"),
    NET("ネット前"),
    SERVICE_LINE("サービスライン");
}

enum class FormationType(val displayNameJa: String, val description: String) {
    PARALLEL("並行陣", "二人ともネット前"),
    ONE_UP_ONE_BACK("雁行陣", "一人前・一人後ろ"),
    AUSTRALIAN("オーストラリアン陣形", "サーバー側クロス配置"),
    I_FORMATION("Iフォーメーション", "センターに集結");
}
