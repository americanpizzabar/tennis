package com.tennis.ai.coach.ui.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tennis.ai.coach.data.model.MatchReport
import com.tennis.ai.coach.data.model.PlayerProfile
import com.tennis.ai.coach.data.repository.MatchRepository
import com.tennis.ai.coach.data.repository.ProfileRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.*
import javax.inject.Inject

data class HomeUiState(
    val activeProfile: PlayerProfile? = null,
    val recentReports: List<MatchReport> = emptyList(),
    val isLoading: Boolean = true
)

@HiltViewModel
class HomeViewModel @Inject constructor(
    private val profileRepository: ProfileRepository,
    private val matchRepository: MatchRepository
) : ViewModel() {

    val uiState: StateFlow<HomeUiState> = combine(
        profileRepository.getActiveProfileFlow(),
        matchRepository.getRecentReports(limit = 5)
    ) { profile, reports ->
        HomeUiState(activeProfile = profile, recentReports = reports, isLoading = false)
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), HomeUiState())
}
