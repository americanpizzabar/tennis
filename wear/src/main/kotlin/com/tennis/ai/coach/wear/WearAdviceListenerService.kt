package com.tennis.ai.coach.wear

import android.os.VibrationEffect
import android.os.Vibrator
import androidx.core.content.getSystemService
import com.google.android.gms.wearable.MessageEvent
import com.google.android.gms.wearable.WearableListenerService
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.serialization.json.Json

@AndroidEntryPoint
class WearAdviceListenerService : WearableListenerService() {

    override fun onMessageReceived(event: MessageEvent) {
        when (event.path) {
            WearPaths.ADVICE_PATH -> handleAdvice(event.data)
            WearPaths.ALERT_PATH -> handleUrgentAlert(event.data)
            WearPaths.SCORE_PATH -> handleScore(event.data)
        }
    }

    private fun handleAdvice(data: ByteArray) {
        runCatching {
            val payload = Json.decodeFromString<WearAdvicePayload>(String(data))
            WearAdviceRepository.updateAdvice(payload)
            if (payload.urgency == "IMMEDIATE") vibrate(longArrayOf(0, 200, 100, 200))
            else vibrate(longArrayOf(0, 100))
        }
    }

    private fun handleUrgentAlert(data: ByteArray) {
        runCatching {
            val payload = Json.decodeFromString<WearAdvicePayload>(String(data))
            WearAdviceRepository.updateAlert(payload)
            // 緊急アラートは3回バイブ
            vibrate(longArrayOf(0, 100, 80, 100, 80, 100))
        }
    }

    private fun handleScore(data: ByteArray) {
        runCatching {
            val score = String(data)
            WearAdviceRepository.updateScore(score)
        }
    }

    private fun vibrate(pattern: LongArray) {
        val vibrator = getSystemService<Vibrator>() ?: return
        vibrator.vibrate(VibrationEffect.createWaveform(pattern, -1))
    }
}

// シンプルなシングルトン状態ストア（Wear OSは軽量に保つ）
object WearAdviceRepository {
    private var _advice: WearAdvicePayload? = null
    private var _alert: WearAdvicePayload? = null
    private var _score: String = "0-0"
    private val listeners = mutableListOf<() -> Unit>()

    fun updateAdvice(payload: WearAdvicePayload) { _advice = payload; notifyListeners() }
    fun updateAlert(payload: WearAdvicePayload) { _alert = payload; notifyListeners() }
    fun updateScore(score: String) { _score = score; notifyListeners() }

    fun getAdvice() = _advice
    fun getAlert() = _alert
    fun getScore() = _score

    fun addListener(listener: () -> Unit) = listeners.add(listener)
    fun removeListener(listener: () -> Unit) = listeners.remove(listener)
    private fun notifyListeners() = listeners.toList().forEach { it() }
}
