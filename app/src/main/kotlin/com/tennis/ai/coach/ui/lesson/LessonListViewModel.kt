package com.tennis.ai.coach.ui.lesson

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tennis.ai.coach.data.model.LessonReport
import com.tennis.ai.coach.data.repository.LessonRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import javax.inject.Inject

data class LessonListUiState(
    val lessons: List<LessonReport> = emptyList(),
    val isLoading: Boolean = true,
)

@HiltViewModel
class LessonListViewModel @Inject constructor(
    private val lessonRepository: LessonRepository,
) : ViewModel() {

    val uiState: StateFlow<LessonListUiState> =
        lessonRepository.getRecentLessons(50)
            .map { LessonListUiState(lessons = it, isLoading = false) }
            .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), LessonListUiState())

    fun delete(report: LessonReport) {
        viewModelScope.launch { lessonRepository.delete(report) }
    }
}
