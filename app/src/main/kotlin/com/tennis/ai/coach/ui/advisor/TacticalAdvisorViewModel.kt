package com.tennis.ai.coach.ui.advisor

import androidx.lifecycle.ViewModel
import com.tennis.ai.coach.data.tactics.ProTacticLibrary
import com.tennis.ai.coach.data.tactics.ScoredTactic
import com.tennis.ai.coach.data.tactics.SituationTag
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import javax.inject.Inject

data class TacticalAdvisorUiState(
    val selected: Set<SituationTag> = emptySet(),
    val recommendations: List<ScoredTactic> = emptyList(),
    val expandedTacticId: String? = null,
)

@HiltViewModel
class TacticalAdvisorViewModel @Inject constructor() : ViewModel() {

    private val _uiState = MutableStateFlow(TacticalAdvisorUiState())
    val uiState: StateFlow<TacticalAdvisorUiState> = _uiState.asStateFlow()

    fun toggle(tag: SituationTag) {
        _uiState.update { state ->
            val newSelected = state.selected.toMutableSet().apply {
                if (!add(tag)) remove(tag)
            }
            state.copy(
                selected = newSelected,
                recommendations = ProTacticLibrary.recommend(newSelected)
            )
        }
    }

    fun clear() {
        _uiState.update { TacticalAdvisorUiState() }
    }

    fun toggleExpand(id: String) {
        _uiState.update {
            it.copy(expandedTacticId = if (it.expandedTacticId == id) null else id)
        }
    }
}
