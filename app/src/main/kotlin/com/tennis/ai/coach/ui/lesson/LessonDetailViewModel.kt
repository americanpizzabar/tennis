package com.tennis.ai.coach.ui.lesson

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tennis.ai.coach.data.model.*
import com.tennis.ai.coach.data.repository.LessonRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import javax.inject.Inject

data class LessonDetailUiState(
    val report: LessonReport? = null,
    val checkpoints: List<CheckpointResult> = emptyList(),
    val drills: List<RecommendedDrill> = emptyList(),
    val trajectory: List<TrajectoryPoint> = emptyList(),
    val feedbacks: List<SwingFeedback> = emptyList(),
    val cleanHit: CleanHitSummary = CleanHitSummary(),
    val isLoading: Boolean = true,
    // 過去の自分比較
    val comparableLessons: List<LessonReport> = emptyList(),
    val comparisonReport: LessonReport? = null,
    val comparisonCheckpoints: List<CheckpointResult> = emptyList(),
    val comparisonTrajectory: List<TrajectoryPoint> = emptyList(),
)

@HiltViewModel
class LessonDetailViewModel @Inject constructor(
    private val lessonRepository: LessonRepository,
    private val json: Json,
) : ViewModel() {

    private val _ui = MutableStateFlow(LessonDetailUiState())
    val ui: StateFlow<LessonDetailUiState> = _ui.asStateFlow()

    fun load(lessonId: String) {
        viewModelScope.launch {
            val report = lessonRepository.getById(lessonId)
            if (report == null) {
                _ui.update { it.copy(isLoading = false) }
                return@launch
            }
            val checkpoints = decode<List<CheckpointResult>>(report.checkpointResultsJson)
            val drills = decode<List<RecommendedDrill>>(report.recommendedDrillsJson)
            val traj = decode<List<TrajectoryPoint>>(report.wristTrajectoryJson)
            val feedbacks = decode<List<SwingFeedback>>(report.swingFeedbacksJson)
            val clean = decodeObj<CleanHitSummary>(report.cleanHitSummaryJson)
                ?: CleanHitSummary()

            // 同じショット種別の過去レッスンを比較候補に
            val all = lessonRepository.getRecentLessons(50).first()
            val comparable = all.filter {
                it.swingType == report.swingType && it.lessonId != report.lessonId
            }

            _ui.update {
                it.copy(
                    report = report,
                    checkpoints = checkpoints,
                    drills = drills,
                    trajectory = traj,
                    feedbacks = feedbacks,
                    cleanHit = clean,
                    comparableLessons = comparable,
                    isLoading = false,
                )
            }
        }
    }

    fun selectComparison(other: LessonReport?) {
        if (other == null) {
            _ui.update {
                it.copy(comparisonReport = null, comparisonCheckpoints = emptyList(),
                    comparisonTrajectory = emptyList())
            }
            return
        }
        val cps = decode<List<CheckpointResult>>(other.checkpointResultsJson)
        val traj = decode<List<TrajectoryPoint>>(other.wristTrajectoryJson)
        _ui.update {
            it.copy(comparisonReport = other, comparisonCheckpoints = cps,
                comparisonTrajectory = traj)
        }
    }

    fun delete(onDone: () -> Unit) {
        val r = _ui.value.report ?: return
        viewModelScope.launch {
            lessonRepository.delete(r)
            onDone()
        }
    }

    private inline fun <reified T> decode(s: String): T =
        runCatching { json.decodeFromString<T>(s) }.getOrElse {
            @Suppress("UNCHECKED_CAST")
            emptyList<Any>() as T
        }

    private inline fun <reified T> decodeObj(s: String): T? =
        runCatching { json.decodeFromString<T>(s) }.getOrNull()
}
