package com.tennis.ai.coach.service

import android.content.Context
import com.google.android.gms.wearable.Wearable
import com.tennis.ai.coach.data.model.TacticalAdvice
import com.tennis.ai.coach.wear.WearAdvicePayload
import com.tennis.ai.coach.wear.WearPaths
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.tasks.await
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import javax.inject.Inject
import javax.inject.Singleton

/**
 * スマホからWear OSへアドバイス・スコア・アラートを送信する。
 */
@Singleton
class WearDataLayerService @Inject constructor(
    @ApplicationContext private val context: Context,
    private val json: Json
) {
    private val messageClient by lazy { Wearable.getMessageClient(context) }
    private val nodeClient by lazy { Wearable.getNodeClient(context) }

    suspend fun sendAdvice(advice: TacticalAdvice) {
        val payload = WearAdvicePayload(
            title = advice.title,
            body = advice.body.take(80),
            urgency = advice.urgency.name,
            emoji = advice.category.emoji
        )
        sendToAllNodes(WearPaths.ADVICE_PATH, json.encodeToString(payload).toByteArray())
    }

    suspend fun sendScore(playerGames: Int, opponentGames: Int) {
        val scoreStr = "$playerGames-$opponentGames"
        sendToAllNodes(WearPaths.SCORE_PATH, scoreStr.toByteArray())
    }

    suspend fun sendUrgentAlert(title: String, body: String, emoji: String) {
        val payload = WearAdvicePayload(
            title = title,
            body = body.take(60),
            urgency = "IMMEDIATE",
            emoji = emoji
        )
        sendToAllNodes(WearPaths.ALERT_PATH, json.encodeToString(payload).toByteArray())
    }

    private suspend fun sendToAllNodes(path: String, data: ByteArray) {
        runCatching {
            val nodes = nodeClient.connectedNodes.await()
            nodes.forEach { node ->
                messageClient.sendMessage(node.id, path, data).await()
            }
        }
    }
}
