package com.tennis.ai.coach.ui.analysis

import android.content.Context
import android.net.Uri
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tennis.ai.coach.data.model.TacticalAdvice
import com.tennis.ai.coach.data.repository.ProfileRepository
import com.tennis.ai.coach.ml.GeminiNanoManager
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import javax.inject.Inject

data class VideoAnalysisUiState(
    val selectedVideoUri: Uri? = null,
    val isAnalyzing: Boolean = false,
    val adviceList: List<TacticalAdvice> = emptyList(),
    val analysisProgress: Float = 0f,
    val errorMessage: String? = null,
    val selectedSegmentMs: LongRange? = null,
    val videoDescription: String = ""
)

@HiltViewModel
class VideoAnalysisViewModel @Inject constructor(
    @ApplicationContext private val context: Context,
    private val geminiNanoManager: GeminiNanoManager,
    private val profileRepository: ProfileRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(VideoAnalysisUiState())
    val uiState: StateFlow<VideoAnalysisUiState> = _uiState.asStateFlow()

    fun selectVideo(uri: Uri) {
        _uiState.update { it.copy(selectedVideoUri = uri, adviceList = emptyList()) }
    }

    fun updateDescription(desc: String) {
        _uiState.update { it.copy(videoDescription = desc) }
    }

    fun analyzeVideo() {
        val state = _uiState.value
        if (state.isAnalyzing) return

        viewModelScope.launch {
            _uiState.update { it.copy(isAnalyzing = true, analysisProgress = 0f, errorMessage = null) }

            val profile = profileRepository.getActiveProfile()
            if (profile == null) {
                _uiState.update { it.copy(isAnalyzing = false, errorMessage = "プロフィールを先に設定してください") }
                return@launch
            }

            val description = state.videoDescription.ifBlank {
                // 動画URIから説明を自動生成（簡易）
                "テニスの${profile.level.displayNameJa}プレイヤーの試合映像。${profile.dominantHand.displayNameJa}プレイヤー。"
            }

            // 進捗シミュレーション
            val progressJob = launch {
                var progress = 0f
                while (progress < 0.9f) {
                    kotlinx.coroutines.delay(300)
                    progress += 0.05f
                    _uiState.update { it.copy(analysisProgress = progress) }
                }
            }

            val adviceResults = mutableListOf<TacticalAdvice>()
            runCatching {
                // 複数の観点から分析
                val analysisAngles = listOf(
                    "フォームと打点について: $description",
                    "戦術と配球パターンについて: $description",
                    "フットワークと体力について: $description"
                )
                for (angle in analysisAngles) {
                    geminiNanoManager.analyzeVideoForAdvice(angle, profile)
                        .collect { advice -> adviceResults.add(advice) }
                }
            }.onFailure { e ->
                _uiState.update { it.copy(errorMessage = "分析中にエラーが発生しました: ${e.message}") }
            }

            progressJob.cancel()
            _uiState.update {
                it.copy(
                    isAnalyzing = false,
                    analysisProgress = 1f,
                    adviceList = adviceResults
                )
            }
        }
    }

    fun clearError() = _uiState.update { it.copy(errorMessage = null) }
}
