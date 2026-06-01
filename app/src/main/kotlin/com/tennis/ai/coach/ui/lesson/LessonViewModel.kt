package com.tennis.ai.coach.ui.lesson

import androidx.camera.view.PreviewView
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tennis.ai.coach.camera.CameraManager
import com.tennis.ai.coach.data.lesson.IdealFormLibrary
import com.tennis.ai.coach.data.lesson.ProStyle
import com.tennis.ai.coach.data.lesson.SessionAnalysis
import com.tennis.ai.coach.data.lesson.SwingAnalyzer
import com.tennis.ai.coach.data.model.*
import com.tennis.ai.coach.data.repository.LessonRepository
import com.tennis.ai.coach.data.repository.ProfileRepository
import com.tennis.ai.coach.ml.CleanHitDetector
import com.tennis.ai.coach.ml.PoseAnalyzer
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.util.UUID
import javax.inject.Inject

data class LessonUiState(
    val phase: LessonPhase = LessonPhase.SELECT_SHOT,
    val swingType: SwingType = SwingType.FOREHAND,
    val proStyle: ProStyle? = null,
    val availableProStyles: List<ProStyle> = emptyList(),
    val isCameraActive: Boolean = false,
    val cameraZoomRatio: Float = 1f,
    val showSkeleton: Boolean = true,
    val isRecording: Boolean = false,
    val elapsedSeconds: Int = 0,
    val detectedSwings: Int = 0,
    val detectedHits: Int = 0,
    val cleanHits: Int = 0,
    val liveMetrics: PoseMetrics? = null,
    val savedLessonId: String? = null,
    val analysisInProgress: Boolean = false,
)

enum class LessonPhase { SELECT_SHOT, CAMERA_SETUP, RECORDING, DONE }

@HiltViewModel
class LessonViewModel @Inject constructor(
    private val cameraManager: CameraManager,
    private val poseAnalyzer: PoseAnalyzer,
    private val cleanHitDetector: CleanHitDetector,
    private val swingAnalyzer: SwingAnalyzer,
    private val lessonRepository: LessonRepository,
    private val profileRepository: ProfileRepository,
    private val json: Json,
) : ViewModel() {

    private val _ui = MutableStateFlow(LessonUiState())
    val ui: StateFlow<LessonUiState> = _ui.asStateFlow()

    private val samples = mutableListOf<SwingAnalyzer.Sample>()
    private val cleanFlags = mutableListOf<Pair<Long, Boolean>>()
    private var recordStartMs = 0L
    private var timerJob: Job? = null
    private var metricsJob: Job? = null
    private var hitsJob: Job? = null

    fun selectShot(type: SwingType) {
        _ui.update {
            it.copy(
                swingType = type,
                availableProStyles = IdealFormLibrary.proStylesFor(type),
                proStyle = null,
                phase = LessonPhase.CAMERA_SETUP,
            )
        }
    }

    fun selectProStyle(style: ProStyle?) {
        _ui.update { it.copy(proStyle = style) }
    }

    fun startCamera(lifecycleOwner: LifecycleOwner, previewView: PreviewView) {
        viewModelScope.launch {
            val ok = runCatching { cameraManager.startCamera(lifecycleOwner, previewView) }
                .getOrDefault(false)
            _ui.update { it.copy(isCameraActive = ok) }
        }
    }

    fun setZoom(ratio: Float) {
        cameraManager.setZoom(ratio.coerceIn(1f, 5f))
        _ui.update { it.copy(cameraZoomRatio = ratio) }
    }

    fun toggleSkeleton() = _ui.update { it.copy(showSkeleton = !it.showSkeleton) }

    fun proceedToRecording() {
        _ui.update { it.copy(phase = LessonPhase.RECORDING) }
    }

    fun startRecording() {
        if (_ui.value.isRecording) return
        samples.clear()
        cleanFlags.clear()
        recordStartMs = System.currentTimeMillis()

        // 動画録画
        runCatching { cameraManager.startRecording(lessonRepository.getLessonVideoDir()) }
        // 音解析開始
        cleanHitDetector.start(recordStartMs)

        _ui.update {
            it.copy(isRecording = true, elapsedSeconds = 0, detectedSwings = 0,
                detectedHits = 0, cleanHits = 0)
        }

        // ポーズ計測収集
        metricsJob = viewModelScope.launch {
            poseAnalyzer.metricsFlow.collect { m ->
                val t = System.currentTimeMillis() - recordStartMs
                samples.add(SwingAnalyzer.Sample(t, m, m.wristX, m.wristY))
                _ui.update { it.copy(liveMetrics = m) }
            }
        }
        // 打球音イベント収集
        hitsJob = viewModelScope.launch {
            cleanHitDetector.hits.collect { hit ->
                cleanFlags.add(hit.tMs to hit.clean)
                _ui.update {
                    it.copy(
                        detectedHits = it.detectedHits + 1,
                        cleanHits = if (hit.clean) it.cleanHits + 1 else it.cleanHits,
                    )
                }
            }
        }
        // タイマー
        timerJob = viewModelScope.launch {
            while (true) {
                kotlinx.coroutines.delay(1000)
                _ui.update { it.copy(elapsedSeconds = it.elapsedSeconds + 1) }
            }
        }
    }

    fun stopAndAnalyze() {
        if (!_ui.value.isRecording) return
        timerJob?.cancel()
        metricsJob?.cancel()
        hitsJob?.cancel()
        runCatching { cameraManager.stopRecording() }
        val cleanSummary = cleanHitDetector.stopAndSummarize()

        _ui.update { it.copy(isRecording = false, analysisInProgress = true) }

        viewModelScope.launch {
            // クリーンヒットフラグを最も近いサンプルにマージ
            val merged = samples.map { s ->
                val near = cleanFlags.minByOrNull { kotlin.math.abs(it.first - s.tMs) }
                if (near != null && kotlin.math.abs(near.first - s.tMs) < 200)
                    s.copy(cleanHit = near.second) else s
            }
            val state = _ui.value
            val analysis: SessionAnalysis = swingAnalyzer.analyzeSession(
                swingType = state.swingType,
                samples = merged,
                cleanHitSummary = cleanSummary,
                proStyle = state.proStyle,
            )
            val profile = profileRepository.getActiveProfile()
            val lessonId = UUID.randomUUID().toString()
            val report = LessonReport(
                lessonId = lessonId,
                playerId = profile?.id ?: 0L,
                swingType = state.swingType,
                durationSeconds = state.elapsedSeconds,
                totalSwings = analysis.feedbacks.size,
                averageScore = analysis.averageScore,
                videoPath = null,  // 録画ファイルパスは CameraManager 側管理（簡略化）
                swingFeedbacksJson = json.encodeToString(analysis.feedbacks),
                wristTrajectoryJson = json.encodeToString(analysis.trajectory),
                checkpointResultsJson = json.encodeToString(analysis.checkpointResults),
                cleanHitSummaryJson = json.encodeToString(analysis.cleanHitSummary),
                recommendedDrillsJson = json.encodeToString(analysis.drills),
                comparedProStyle = state.proStyle?.nameJa,
                summaryThreeLines = analysis.summary,
            )
            lessonRepository.save(report)
            _ui.update {
                it.copy(
                    phase = LessonPhase.DONE,
                    savedLessonId = lessonId,
                    analysisInProgress = false,
                    detectedSwings = analysis.feedbacks.size,
                )
            }
        }
    }

    fun hasMicPermission(): Boolean = cleanHitDetector.hasMicPermission()

    override fun onCleared() {
        super.onCleared()
        timerJob?.cancel()
        metricsJob?.cancel()
        hitsJob?.cancel()
        runCatching { cameraManager.stopRecording() }
        runCatching { cleanHitDetector.stopAndSummarize() }
    }
}
