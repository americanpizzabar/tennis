package com.tennis.ai.coach.peer

import com.tennis.ai.coach.data.model.BallLandingPoint
import com.tennis.ai.coach.data.model.PoseMetrics
import kotlinx.serialization.Serializable

/**
 * 2 端末セッションでやり取りするペイロード。
 * 自陣を撮るデバイスが「自分側のメトリクス」、敵陣を撮るデバイスが「相手側のメトリクス」を送る。
 */
@Serializable
sealed class PeerMessage {

    @Serializable
    data class Hello(
        val deviceName: String,
        val role: PeerRole,
        val protocolVersion: Int = 1
    ) : PeerMessage()

    @Serializable
    data class BallLanding(
        val landing: BallLandingPoint,
        val sourceRole: PeerRole
    ) : PeerMessage()

    @Serializable
    data class PoseUpdate(
        val metrics: PoseMetrics,
        val sourceRole: PeerRole
    ) : PeerMessage()

    @Serializable
    data class ScoreUpdate(
        val playerGames: Int,
        val opponentGames: Int,
        val playerPointsOrdinal: Int,
        val opponentPointsOrdinal: Int,
    ) : PeerMessage()

    @Serializable
    data class Heartbeat(val sentAt: Long = System.currentTimeMillis()) : PeerMessage()

    @Serializable
    data object EndSession : PeerMessage()
}

/**
 * 自分の端末がコートのどちら側を撮影しているか。
 */
@Serializable
enum class PeerRole(val displayNameJa: String) {
    OWN_SIDE("自陣（自分／パートナー）担当"),
    OPPONENT_SIDE("相手陣（相手）担当");

    fun other(): PeerRole = if (this == OWN_SIDE) OPPONENT_SIDE else OWN_SIDE
}
