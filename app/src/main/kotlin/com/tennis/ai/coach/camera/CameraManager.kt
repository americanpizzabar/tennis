package com.tennis.ai.coach.camera

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.ImageFormat
import android.graphics.Rect
import android.graphics.YuvImage
import androidx.camera.core.*
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.video.*
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import androidx.lifecycle.LifecycleOwner
import com.tennis.ai.coach.ml.BallTracker
import com.tennis.ai.coach.ml.PoseAnalyzer
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import java.io.ByteArrayOutputStream
import java.io.File
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import javax.inject.Inject
import javax.inject.Singleton
import kotlin.coroutines.resume

@Singleton
class CameraManager @Inject constructor(
    @ApplicationContext private val context: Context,
    private val poseAnalyzer: PoseAnalyzer,
    private val ballTracker: BallTracker
) {
    private val scope = CoroutineScope(Dispatchers.Default + SupervisorJob())
    private val analysisExecutor: ExecutorService = Executors.newSingleThreadExecutor()

    private var camera: Camera? = null
    private var videoCapture: VideoCapture<Recorder>? = null
    private var currentRecording: Recording? = null

    private val _isRecording = MutableStateFlow(false)
    val isRecording: StateFlow<Boolean> = _isRecording

    private val _analysisFrameRate = MutableStateFlow(0)
    val analysisFrameRate: StateFlow<Int> = _analysisFrameRate

    private var frameCount = 0
    private var lastFpsTimestamp = System.currentTimeMillis()

    suspend fun startCamera(
        lifecycleOwner: LifecycleOwner,
        previewView: PreviewView,
        lensFacing: Int = CameraSelector.LENS_FACING_BACK
    ): Boolean = runCatching {
        val cameraProvider = getCameraProvider()

        val preview = Preview.Builder()
            .setTargetAspectRatio(AspectRatio.RATIO_16_9)
            .build()
            .also { it.setSurfaceProvider(previewView.surfaceProvider) }

        val imageAnalysis = ImageAnalysis.Builder()
            .setTargetAspectRatio(AspectRatio.RATIO_16_9)
            .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
            .setOutputImageFormat(ImageAnalysis.OUTPUT_IMAGE_FORMAT_YUV_420_888)
            .build()
            .also { analysis ->
                analysis.setAnalyzer(analysisExecutor) { imageProxy ->
                    runCatching { processFrame(imageProxy) }
                        .onFailure { runCatching { imageProxy.close() } }
                }
            }

        val recorder = Recorder.Builder()
            .setQualitySelector(QualitySelector.from(Quality.HD))
            .build()
        videoCapture = VideoCapture.withOutput(recorder)

        val cameraSelector = CameraSelector.Builder()
            .requireLensFacing(lensFacing)
            .build()

        cameraProvider.unbindAll()
        camera = cameraProvider.bindToLifecycle(
            lifecycleOwner,
            cameraSelector,
            preview,
            imageAnalysis,
            videoCapture
        )
        true
    }.getOrDefault(false)

    /**
     * 実コートでは色ベースのボール検知（BallTracker）の精度が極めて低いため
     * デフォルトでは無効化し、ポーズ解析だけ走らせる。
     * 着弾点は MatchScreen のタップ手動入力で記録する設計。
     */
    @Volatile var ballTrackingEnabled: Boolean = false

    private fun processFrame(imageProxy: ImageProxy) {
        val bitmap = imageProxy.toBitmap() ?: run {
            imageProxy.close()
            return
        }

        val timestamp = imageProxy.imageInfo.timestamp / 1_000_000  // ns → ms

        // bitmap は recycle しない：MediaPipe LIVE_STREAM が非同期で参照を保持するため。
        // GC に任せて安全側に倒す。
        scope.launch {
            runCatching {
                poseAnalyzer.analyzeFrame(bitmap, timestamp)
                if (ballTrackingEnabled) ballTracker.processFrame(bitmap, timestamp)
            }
        }

        // FPS計測
        frameCount++
        val now = System.currentTimeMillis()
        if (now - lastFpsTimestamp >= 1000) {
            _analysisFrameRate.value = frameCount
            frameCount = 0
            lastFpsTimestamp = now
        }

        imageProxy.close()
    }

    private fun ImageProxy.toBitmap(): Bitmap? = runCatching {
        val yBuffer = planes[0].buffer
        val uBuffer = planes[1].buffer
        val vBuffer = planes[2].buffer
        val ySize = yBuffer.remaining()
        val uSize = uBuffer.remaining()
        val vSize = vBuffer.remaining()
        val nv21 = ByteArray(ySize + uSize + vSize)
        yBuffer.get(nv21, 0, ySize)
        vBuffer.get(nv21, ySize, vSize)
        uBuffer.get(nv21, ySize + vSize, uSize)
        val yuvImage = YuvImage(nv21, ImageFormat.NV21, width, height, null)
        val out = ByteArrayOutputStream()
        yuvImage.compressToJpeg(Rect(0, 0, width, height), 75, out)
        val bytes = out.toByteArray()
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
    }.getOrNull()

    fun startRecording(outputDir: File) {
        val vc = videoCapture ?: return
        val name = SimpleDateFormat("yyyy-MM-dd_HH-mm-ss", Locale.JAPAN).format(System.currentTimeMillis())
        val file = File(outputDir, "tennis_$name.mp4")
        val outputOptions = FileOutputOptions.Builder(file).build()
        currentRecording = vc.output
            .prepareRecording(context, outputOptions)
            .start(ContextCompat.getMainExecutor(context)) { event ->
                when (event) {
                    is VideoRecordEvent.Start -> _isRecording.value = true
                    is VideoRecordEvent.Finalize -> _isRecording.value = false
                }
            }
    }

    fun stopRecording() = currentRecording?.stop()

    fun setZoom(ratio: Float) = camera?.cameraControl?.setZoomRatio(ratio)

    fun setTorch(enabled: Boolean) = camera?.cameraControl?.enableTorch(enabled)

    private suspend fun getCameraProvider(): ProcessCameraProvider =
        kotlinx.coroutines.suspendCancellableCoroutine { cont ->
            val future = ProcessCameraProvider.getInstance(context)
            future.addListener({
                runCatching { future.get() }
                    .onSuccess { provider -> if (cont.isActive) cont.resume(provider) }
                    .onFailure { e -> if (cont.isActive) cont.resumeWith(Result.failure(e)) }
            }, ContextCompat.getMainExecutor(context))
        }

    fun release() {
        stopRecording()
        analysisExecutor.shutdown()
        poseAnalyzer.release()
    }
}
