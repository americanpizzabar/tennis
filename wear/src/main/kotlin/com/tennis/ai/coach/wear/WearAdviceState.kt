package com.tennis.ai.coach.wear

import kotlinx.serialization.Serializable

@Serializable
data class WearAdvicePayload(
    val title: String,
    val body: String,
    val urgency: String,
    val emoji: String,
    val score: String = ""
)

// Wear OS ↔ Phone 間の通信パス定数
object WearPaths {
    const val ADVICE_PATH = "/tennis/advice"
    const val SCORE_PATH = "/tennis/score"
    const val ALERT_PATH = "/tennis/alert"
    const val HEARTBEAT_PATH = "/tennis/heartbeat"
}
