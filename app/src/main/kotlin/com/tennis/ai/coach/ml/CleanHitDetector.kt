package com.tennis.ai.coach.ml

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import androidx.core.content.ContextCompat
import com.tennis.ai.coach.data.model.CleanHitSummary
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import javax.inject.Inject
import javax.inject.Singleton
import kotlin.concurrent.thread
import kotlin.math.abs
import kotlin.math.sqrt

/**
 * マイクの打球音から「クリーンヒット（乾いた良い音）」と「ミスヒット（鈍い音）」を判定する。
 *
 * 原理（簡易版）：
 * - 短時間エネルギー（RMS）の急峻な立ち上がり＝打球を検知。
 * - 立ち上がりの鋭さ（アタックの速さ）と高周波成分（ゼロ交差率）で
 *   クリーン／ミスを区別する。スイートスポットの音は高周波で立ち上がりが鋭い。
 *
 * 実音響特性は環境に依存するため、判定はあくまで目安。
 */
@Singleton
class CleanHitDetector @Inject constructor(
    @ApplicationContext private val context: Context,
) {
    private val sampleRate = 44100
    private val channel = AudioFormat.CHANNEL_IN_MONO
    private val encoding = AudioFormat.ENCODING_PCM_16BIT

    @Volatile private var recording = false
    private var recordThread: Thread? = null

    private val _hits = MutableSharedFlow<HitEvent>(extraBufferCapacity = 64)
    /** 検知した打球イベント（時刻とクリーン判定）。 */
    val hits: SharedFlow<HitEvent> = _hits

    private var cleanCount = 0
    private var mishitCount = 0
    private val mishitCauses = mutableListOf<String>()

    data class HitEvent(val tMs: Long, val clean: Boolean, val loudness: Float)

    fun hasMicPermission(): Boolean =
        ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) ==
            PackageManager.PERMISSION_GRANTED

    fun start(startTimeMs: Long) {
        if (recording || !hasMicPermission()) return
        cleanCount = 0
        mishitCount = 0
        mishitCauses.clear()

        val minBuf = AudioRecord.getMinBufferSize(sampleRate, channel, encoding)
            .coerceAtLeast(4096)
        val recorder = runCatching {
            AudioRecord(MediaRecorder.AudioSource.MIC, sampleRate, channel, encoding, minBuf * 2)
        }.getOrNull() ?: return
        if (recorder.state != AudioRecord.STATE_INITIALIZED) {
            runCatching { recorder.release() }
            return
        }

        recording = true
        recorder.startRecording()
        recordThread = thread(name = "clean-hit-detector") {
            val buf = ShortArray(minBuf)
            var prevRms = 0f
            var lastHitMs = 0L
            while (recording) {
                val n = recorder.read(buf, 0, buf.size)
                if (n <= 0) continue
                val now = System.currentTimeMillis()
                // RMS（音量）
                var sumSq = 0.0
                var zeroCrossings = 0
                for (i in 0 until n) {
                    val v = buf[i].toInt()
                    sumSq += (v * v).toDouble()
                    if (i > 0 && (buf[i] >= 0) != (buf[i - 1] >= 0)) zeroCrossings++
                }
                val rms = sqrt(sumSq / n).toFloat()
                val attack = rms - prevRms                 // 立ち上がりの鋭さ
                val zcr = zeroCrossings.toFloat() / n      // ゼロ交差率（高周波の指標）

                // 打球検知：十分な音量＋急峻な立ち上がり
                if (rms > 2500f && attack > 1500f && now - lastHitMs > 250) {
                    lastHitMs = now
                    // クリーン判定：高周波成分が多く（zcr 高）立ち上がりが鋭い
                    val clean = zcr > 0.12f && attack > 2200f
                    if (clean) cleanCount++ else {
                        mishitCount++
                        // ミスヒットの傾向を粗く記録（音だけからの推定なので一般的傾向）
                        if (zcr <= 0.08f) addCause("芯を外し根元寄りの鈍い音")
                        else addCause("当たりが薄い／面が安定していない")
                    }
                    _hits.tryEmit(HitEvent(now - startTimeMs, clean, rms))
                }
                prevRms = rms
            }
            runCatching {
                recorder.stop()
                recorder.release()
            }
        }
    }

    private fun addCause(cause: String) {
        if (mishitCauses.count { it == cause } < 3) mishitCauses.add(cause)
    }

    fun stopAndSummarize(): CleanHitSummary {
        recording = false
        runCatching { recordThread?.join(500) }
        recordThread = null
        val total = cleanCount + mishitCount
        return CleanHitSummary(
            totalDetectedHits = total,
            cleanHits = cleanCount,
            mishits = mishitCount,
            cleanHitPercent = if (total > 0) cleanCount * 100 / total else 0,
            commonMishitCausesJa = mishitCauses.distinct(),
        )
    }
}
