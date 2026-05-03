package com.tennis.ai.coach.ml

import android.graphics.Bitmap
import android.graphics.Color
import com.tennis.ai.coach.data.model.BallDetection
import com.tennis.ai.coach.data.model.BallLandingPoint
import com.tennis.ai.coach.data.model.CourtZone
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import javax.inject.Inject
import javax.inject.Singleton
import kotlin.math.abs
import kotlin.math.sqrt

/**
 * リアルタイムボール追跡（色ベースの高速検出 + 着弾点推定）。
 * ML Kitの物体検知と組み合わせることで精度向上可能。
 */
@Singleton
class BallTracker @Inject constructor() {

    private val _ballFlow = MutableSharedFlow<BallDetection?>(replay = 1)
    val ballFlow: SharedFlow<BallDetection?> = _ballFlow

    private val _landingFlow = MutableSharedFlow<BallLandingPoint>(replay = 1)
    val landingFlow: SharedFlow<BallLandingPoint> = _landingFlow

    private var prevBall: BallDetection? = null
    private val landingHistory = ArrayDeque<BallLandingPoint>(50)

    // テニスボールの色範囲（HSV: 黄緑）
    private companion object {
        const val BALL_HUE_MIN = 40f
        const val BALL_HUE_MAX = 80f
        const val BALL_SAT_MIN = 0.4f
        const val BALL_VAL_MIN = 0.5f

        // コートネット位置（画面座標比率）
        const val NET_Y_RATIO = 0.5f
        const val COURT_TOP = 0.15f
        const val COURT_BOTTOM = 0.85f
    }

    fun processFrame(bitmap: Bitmap, timestampMs: Long) {
        val detection = detectBall(bitmap)
        val prev = prevBall

        if (detection != null && prev != null) {
            val vx = detection.x - prev.x
            val vy = detection.y - prev.y
            val enriched = detection.copy(velocityX = vx, velocityY = vy)

            // 着弾点推定：ボールが下降→上昇に転じた瞬間
            if (prev.velocityY > 0 && vy < 0) {
                val landing = estimateLandingPoint(prev, timestampMs)
                landingHistory.addLast(landing)
                if (landingHistory.size > 50) landingHistory.removeFirst()
                _landingFlow.tryEmit(landing)
            }
            _ballFlow.tryEmit(enriched)
            prevBall = enriched
        } else {
            _ballFlow.tryEmit(detection)
            prevBall = detection
        }
    }

    private fun detectBall(bitmap: Bitmap): BallDetection? {
        val scaledW = 160
        val scaledH = (bitmap.height * scaledW.toFloat() / bitmap.width).toInt()
        val scaled = Bitmap.createScaledBitmap(bitmap, scaledW, scaledH, false)

        var sumX = 0f
        var sumY = 0f
        var count = 0

        for (y in 0 until scaledH) {
            for (x in 0 until scaledW) {
                val pixel = scaled.getPixel(x, y)
                if (isTennisBallColor(pixel)) {
                    sumX += x.toFloat() / scaledW
                    sumY += y.toFloat() / scaledH
                    count++
                }
            }
        }

        scaled.recycle()

        if (count < 10) return null  // ノイズ除去
        val radius = sqrt(count.toFloat() / Math.PI.toFloat()) / scaledW
        return BallDetection(
            x = sumX / count,
            y = sumY / count,
            radius = radius,
            confidence = (count.toFloat() / 200f).coerceIn(0f, 1f)
        )
    }

    private fun isTennisBallColor(pixel: Int): Boolean {
        val r = Color.red(pixel) / 255f
        val g = Color.green(pixel) / 255f
        val b = Color.blue(pixel) / 255f
        val max = maxOf(r, g, b)
        val min = minOf(r, g, b)
        val delta = max - min

        if (max < BALL_VAL_MIN || delta < 0.1f) return false

        val hue = when (max) {
            r -> 60f * ((g - b) / delta)
            g -> 60f * ((b - r) / delta) + 120f
            else -> 60f * ((r - g) / delta) + 240f
        }.let { if (it < 0) it + 360f else it }

        val sat = if (max == 0f) 0f else delta / max
        return hue in BALL_HUE_MIN..BALL_HUE_MAX && sat > BALL_SAT_MIN
    }

    private fun estimateLandingPoint(ball: BallDetection, timestampMs: Long): BallLandingPoint {
        val zone = when {
            ball.y < NET_Y_RATIO && ball.x < 0.5f -> CourtZone.DEUCE_SERVICE_BOX
            ball.y < NET_Y_RATIO && ball.x >= 0.5f -> CourtZone.AD_SERVICE_BOX
            ball.y >= NET_Y_RATIO && ball.x < 0.33f -> CourtZone.DEUCE_BASELINE
            ball.y >= NET_Y_RATIO && ball.x > 0.67f -> CourtZone.AD_BASELINE
            ball.y >= NET_Y_RATIO -> CourtZone.CENTER_BASELINE
            ball.y < COURT_TOP || ball.y > COURT_BOTTOM -> CourtZone.OUT
            else -> CourtZone.CENTER_BASELINE
        }
        return BallLandingPoint(
            x = ball.x,
            y = ball.y,
            isInCourt = zone != CourtZone.OUT,
            zone = zone,
            timestampMs = timestampMs
        )
    }

    fun getLandingHistory(): List<BallLandingPoint> = landingHistory.toList()

    fun reset() {
        prevBall = null
        landingHistory.clear()
    }
}
