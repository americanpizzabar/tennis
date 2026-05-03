package com.tennis.ai.coach.ui.profile

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tennis.ai.coach.data.model.DominantHand
import com.tennis.ai.coach.data.model.Gender
import com.tennis.ai.coach.data.model.PlayerLevel
import com.tennis.ai.coach.data.model.PlayerProfile
import com.tennis.ai.coach.data.repository.ProfileRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import javax.inject.Inject

data class ProfileUiState(
    val name: String = "",
    val level: PlayerLevel = PlayerLevel.INTERMEDIATE,
    val gender: Gender = Gender.MALE,
    val dominantHand: DominantHand = DominantHand.RIGHT,
    val isSaving: Boolean = false,
    val saved: Boolean = false
)

@HiltViewModel
class ProfileViewModel @Inject constructor(
    private val repository: ProfileRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(ProfileUiState())
    val uiState: StateFlow<ProfileUiState> = _uiState.asStateFlow()

    init {
        viewModelScope.launch {
            repository.getActiveProfile()?.let { profile ->
                _uiState.update {
                    it.copy(
                        name = profile.name,
                        level = profile.level,
                        gender = profile.gender,
                        dominantHand = profile.dominantHand
                    )
                }
            }
        }
    }

    fun updateName(name: String) = _uiState.update { it.copy(name = name) }
    fun updateLevel(level: PlayerLevel) = _uiState.update { it.copy(level = level) }
    fun updateGender(gender: Gender) = _uiState.update { it.copy(gender = gender) }
    fun updateHand(hand: DominantHand) = _uiState.update { it.copy(dominantHand = hand) }

    fun save() {
        viewModelScope.launch {
            _uiState.update { it.copy(isSaving = true) }
            val state = _uiState.value
            val profile = PlayerProfile(
                name = state.name,
                level = state.level,
                gender = state.gender,
                dominantHand = state.dominantHand,
                isActive = true
            )
            repository.saveProfile(profile)
            _uiState.update { it.copy(isSaving = false, saved = true) }
        }
    }
}
