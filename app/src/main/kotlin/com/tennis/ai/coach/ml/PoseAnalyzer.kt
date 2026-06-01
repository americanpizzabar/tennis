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
 * MediaPipe PoseLandmarker でスケルトン検知を行う。
 * モデル `pose_landmarker_full.task` が assets に同梱されていない場合や
 * 端末側で初期化に失敗した場合は、ダミーデータでフォールバック動作する。
 *
 * 注意：
 * - MediaPipe LIVE_STREAM の `detectAsync` は内部で Bitmap を非同期保持するため、
 *   呼び出し側で recycle してはいけない。GC に任せる。
 * - タイムスタンプは厳密単調増加でなければ native 側で SEGV を起こす。
 */
class PoseAnalyzer(
    @ApplicationContext private val context: Context
) {
    private var poseLandmarker: PoseLandmarker? = null
    private var modelAvailable: Boolean = false

    private val _metricsFlow = MutableSharedFlow<PoseMetrics>(replay = 1)
    val metricsFlow: SharedFlow<PoseMetrics> = _metricsFlow

    // 直前フレームのランドマーク座標（速度計算用）
    private var prevWristX: Float = 0f
    private var prevWristY: Float = 0f
    private var prevTimestamp: Long = 0L

    // detectAsync 用の単調増加タイムスタンプ
    @Volatile private var lastSubmittedTs: Long = 0L

    private companion object {
        const val MODEL_ASSET = "pose_landmarker_full.task"
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
        // 1) assets にモデルファイルが存在するか確認。なければ MediaPipe を一切触らない。
        val hasModel = runCatching {
            context.assets.open(MODEL_ASSET).use { it.read(ByteArray(1)) >= 0 }
        }.getOrDefault(false)
        if (!hasModel) {
            modelAvailable = false
            poseLandmarker = null
            return@withContext
        }

        // 2) PoseLandmarker を作成。失敗したら null のまま。
        runCatching {
            val baseOptions = BaseOptions.builder()
                .setModelAssetPath(MODEL_ASSET)
                .build()
            val options = PoseLandmarker.PoseLandmarkerOptions.builder()
                .setBaseOptions(baseOptions)
                .setRunningMode(RunningMode.LIVE_STREAM)
                .setNumPoses(1)
                .setMinPoseDetectionConfidence(0.5f)
                .setMinTrackingConfidence(0.5f)
                .setResultListener { result, _ -> handleResult(result) }
                .build()
            poseLandmarker = PoseLandmarker.createFromOptions(context, options)
            modelAvailable = poseLandmarker != null
        }.onFailure {
            poseLandmarker = null
            modelAvailable = false
        }
    }

    fun analyzeFrame(bitmap: Bitmap, timestampMs: Long) {
        val landmarker = poseLandmarker
        if (!modelAvailable || landmarker == null) {
            _metricsFlow.tryEmit(generateDemoMetrics())
            return
        }
        // タイムスタンプが厳密に増加するよう保証（同じ or 過去だと native crash）
        val ts = synchronized(this) {
            val next = if (timestampMs > lastSubmittedTs) timestampMs else lastSubmittedTs + 1
            lastSubmittedTs = next
            next
        }
        runCatching {
            // MediaPipe に渡す bitmap は ARGB_8888 で防御コピー。
            // recycle はしない（detectAsync は非同期）。
            val safeBitmap = if (bitmap.config == Bitmap.Config.ARGB_8888 && !bitmap.isRecycled) {
                bitmap.copy(Bitmap.Config.ARGB_8888, false)
            } else if (!bitmap.isRecycled) {
                bitmap.copy(Bitmap.Config.ARGB_8888, false)
            } else {
                null
            } ?: return@runCatching
            val mpImage = BitmapImageBuilder(safeBitmap).build()
            landmarker.detectAsync(mpImage, ts)
        }.onFailure {
            _metricsFlow.tryEmit(generateDemoMetrics())
        }
    }

    private fun handleResult(result: PoseLandmarkerResult) {
        runCatching {
            if (result.landmarks().isEmpty()) return@runCatching
            val landmarks = result.landmarks()[0]
            if (landmarks.size <= RIGHT_ANKLE) return@runCatching
            val now = System.currentTimeMillis()

            val wrist = landmarks[RIGHT_WRIST]
            val shoulder = landmarks[RIGHT_SHOULDER]
            val hip = landmarks[RIGHT_HIP]
            val knee = landmarks[RIGHT_KNEE]
            val ankle = landmarks[RIGHT_ANKLE]
            val leftShoulder = landmarks[LEFT_SHOULDER]

            val dx = wrist.x() - prevWristX
            val dy = wrist.y() - prevWristY
            val dt = (now - prevTimestamp).coerceAtLeast(1L)
            val pixelSpeed = sqrt(dx * dx + dy * dy) / dt
            val swingSpeedKmh = (pixelSpeed * 3_600_000 / 100f).coerceIn(0f, 250f)

            val impactHeightRatio = 1f - wrist.y()
            val impactHeightCm = impactHeightRatio * 200f

            val kneeAngle = calculateAngle(
                hip.x(), hip.y(),
                knee.x(), knee.y(),
                ankle.x(), ankle.y()
            )

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
                    elapsedSinceLastShot = dt,
                    wristX = wrist.x().coerceIn(0f, 1f),
                    wristY = wrist.y().coerceIn(0f, 1f),
                )
            )
        }
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
        swingSpeedKmh = (40f..130f).random(),
        impactHeightCm = (70f..170f).random(),
        kneeAngleDeg = (110f..170f).random(),
        shoulderRotationDeg = (-90f..90f).random(),
        elapsedSinceLastShot = (300L..2000L).random(),
        wristX = (0.2f..0.8f).random(),
        wristY = (0.2f..0.8f).random(),
    )

    private fun ClosedFloatingPointRange<Float>.random(): Float =
        start + (endInclusive - start) * Math.random().toFloat()

    private fun ClosedRange<Long>.random(): Long =
        start + ((endInclusive - start) * Math.random()).toLong()

    fun release() {
        runCatching { poseLandmarker?.close() }
        poseLandmarker = null
        modelAvailable = false
    }
}
