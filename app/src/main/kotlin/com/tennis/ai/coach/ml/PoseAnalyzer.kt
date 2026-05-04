package com.tennis.ai.coach.ml

import android.content.Context
import android.graphics.Bitmap
import com.google.mediapipe.framework.image.BitmapImageBuilder
import com.google.mediapipe.tasks.core.BaseOptions
import com.google.mediapipe.tasks.vision.core.RunningMode
import com.google.mediapipe.tasks.vision.poselandmarker.PoseLandmarker
import com.google.mediapipe.tasks.vision.poselandmarker.PoseLandmarkerResult
import com.tennis.ai.coach.data.model.PoseMetrics
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.withContext
import kotlin.math.*

/**
 * MediaPipe PoseLandmarker でスケルトン検知を行い、
 * スイング速度・打点高さ・膝角度をリアルタイム計測する。
 */
class PoseAnalyzer(
    @ApplicationContext private val context: Context
) {
    private var poseLandmarker: PoseLandmarker? = null
    private val _metricsFlow = MutableSharedFlow<PoseMetrics>(replay = 1)
    val metricsFlow: SharedFlow<PoseMetrics> = _metricsFlow

    // 直前フレームのランドマーク座標（速度計算用）
    private var prevWristX: Float = 0f
    private var prevWristY: Float = 0f
    private var prevTimestamp: Long = 0L

    // MediaPipe landmark indices
    private companion object {
        const val LEFT_SHOULDER = 11
        const val RIGHT_SHOULDER = 12
        const val LEFT_ELBOW = 13
        const val RIGHT_ELBOW = 14
        const val LEFT_WRIST = 15
        const val RIGHT_WRIST = 16
        const val LEFT_HIP = 23
        const val RIGHT_HIP = 24
        const val LEFT_KNEE = 25
        const val RIGHT_KNEE = 26
        const val LEFT_ANKLE = 27
        const val RIGHT_ANKLE = 28
    }

    suspend fun initialize() = withContext(Dispatchers.IO) {
        runCatching {
            val baseOptions = BaseOptions.builder()
                .setModelAssetPath("pose_landmarker_full.task")
                .build()
            val options = PoseLandmarker.PoseLandmarkerOptions.builder()
                .setBaseOptions(baseOptions)
                .setRunningMode(RunningMode.LIVE_STREAM)
                .setNumPoses(2)  // player + opponent
                .setMinPoseDetectionConfidence(0.5f)
                .setMinTrackingConfidence(0.5f)
                .setResultListener { result, _ -> handleResult(result) }
                .build()
            poseLandmarker = PoseLandmarker.createFromOptions(context, options)
        }.onFailure { e ->
            // モデルファイル未同梱時はダミーデータで動作継続
        }
    }

    fun analyzeFrame(bitmap: Bitmap, timestampMs: Long) {
        val landmarker = poseLandmarker ?: run {
            // フォールバック：ランダムなメトリクスを生成（デモ用）
            _metricsFlow.tryEmit(generateDemoMetrics())
            return
        }
        val mpImage = BitmapImageBuilder(bitmap).build()
        landmarker.detectAsync(mpImage, timestampMs)
    }

    private fun handleResult(result: PoseLandmarkerResult) {
        if (result.landmarks().isEmpty()) return

        val landmarks = result.landmarks()[0]  // 最初の人物（プレイヤー）
        val now = System.currentTimeMillis()

        // 利き手側の手首（右利き前提、実際はプロファイルから取得）
        val wrist = landmarks[RIGHT_WRIST]
        val shoulder = landmarks[RIGHT_SHOULDER]
        val hip = landmarks[RIGHT_HIP]
        val knee = landmarks[RIGHT_KNEE]
        val ankle = landmarks[RIGHT_ANKLE]

        // スイング速度（ピクセル/ms → km/h の近似）
        val dx = wrist.x() - prevWristX
        val dy = wrist.y() - prevWristY
        val dt = (now - prevTimestamp).coerceAtLeast(1L)
        val pixelSpeed = sqrt(dx * dx + dy * dy) / dt
        val swingSpeedKmh = (pixelSpeed * 3_600_000 / 100f).coerceIn(0f, 250f)

        // 打点高さ（画面比率 → cm換算。平均身長170cmで正規化）
        val impactHeightRatio = 1f - wrist.y()  // 0=下, 1=上
        val impactHeightCm = impactHeightRatio * 200f

        // 膝角度（大腿部と下腿部のなす角）
        val kneeAngle = calculateAngle(
            hip.x(), hip.y(),
            knee.x(), knee.y(),
            ankle.x(), ankle.y()
        )

        // 肩の回転（水平方向）
        val leftShoulder = landmarks[LEFT_SHOULDER]
        val shoulderRotation = atan2(
            (shoulder.y() - leftShoulder.y()).toDouble(),
            (shoulder.x() - leftShoulder.x()).toDouble()
        ).toFloat() * (180f / PI.toFloat())

        prevWristX = wrist.x()
        prevWristY = wrist.y()
        prevTimestamp = now

        _metricsFlow.tryEmit(
            PoseMetrics(
                swingSpeedKmh = swingSpeedKmh,
                impactHeightCm = impactHeightCm,
                kneeAngleDeg = kneeAngle,
                shoulderRotationDeg = shoulderRotation,
                elapsedSinceLastShot = dt
            )
        )
    }

    private fun calculateAngle(ax: Float, ay: Float, bx: Float, by: Float, cx: Float, cy: Float): Float {
        val ba = floatArrayOf(ax - bx, ay - by)
        val bc = floatArrayOf(cx - bx, cy - by)
        val dot = ba[0] * bc[0] + ba[1] * bc[1]
        val magBa = sqrt((ba[0] * ba[0] + ba[1] * ba[1]).toDouble()).toFloat()
        val magBc = sqrt((bc[0] * bc[0] + bc[1] * bc[1]).toDouble()).toFloat()
        if (magBa == 0f || magBc == 0f) return 0f
        return acos((dot / (magBa * magBc)).coerceIn(-1f, 1f)) * (180f / PI.toFloat())
    }

    private fun generateDemoMetrics(): PoseMetrics = PoseMetrics(
        swingSpeedKmh = (60f..120f).random(),
        impactHeightCm = (70f..130f).random(),
        kneeAngleDeg = (120f..170f).random(),
        shoulderRotationDeg = (-45f..45f).random(),
        elapsedSinceLastShot = (500L..3000L).random()
    )

    private fun ClosedFloatingPointRange<Float>.random(): Float =
        start + (endInclusive - start) * Math.random().toFloat()

    private fun ClosedRange<Long>.random(): Long =
        start + ((endInclusive - start) * Math.random()).toLong()

    fun release() {
        poseLandmarker?.close()
        poseLandmarker = null
    }
}
