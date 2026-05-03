package com.tennis.ai.coach.ui.report

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tennis.ai.coach.data.model.*
import com.tennis.ai.coach.data.repository.MatchRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import javax.inject.Inject

data class ReportUiState(
    val report: MatchReport? = null,
    val keyMoments: List<KeyMoment> = emptyList(),
    val practiceMenu: List<PracticeMenuItem> = emptyList(),
    val stats: MatchStats? = null,
    val isLoading: Boolean = true
)

@HiltViewModel
class MatchReportViewModel @Inject constructor(
    private val matchRepository: MatchRepository,
    private val json: Json
) : ViewModel() {

    private val _uiState = MutableStateFlow(ReportUiState())
    val uiState: StateFlow<ReportUiState> = _uiState.asStateFlow()

    fun load(matchId: String) {
        viewModelScope.launch {
            val report = matchRepository.getReportById(matchId)
            if (report == null) {
                _uiState.update { it.copy(isLoading = false) }
                return@launch
            }
            val moments = runCatching {
                json.decodeFromString<List<KeyMoment>>(report.keyMomentsJson)
            }.getOrDefault(emptyList())

            val stats = runCatching {
                json.decodeFromString<MatchStats>(report.statsJson)
            }.getOrNull()

            val practiceMenu = generatePracticeMenu(stats, report)

            _uiState.update {
                it.copy(
                    report = report,
                    keyMoments = moments,
                    practiceMenu = practiceMenu,
                    stats = stats,
                    isLoading = false
                )
            }
        }
    }

    private fun generatePracticeMenu(stats: MatchStats?, report: MatchReport): List<PracticeMenuItem> {
        val menu = mutableListOf<PracticeMenuItem>()
        if (stats == null) return menu

        if (stats.firstServePercent < 60) {
            menu.add(PracticeMenuItem(
                title = "1stサーブの精度向上",
                description = "ターゲットを設置して1stサーブの確率を70%以上に引き上げる",
                priority = 1,
                estimatedMinutes = 20,
                drillType = DrillType.SERVE
            ))
        }
        if (stats.unforeEdErrorCount > stats.winnerCount) {
            menu.add(PracticeMenuItem(
                title = "アンフォースドエラー削減",
                description = "クロスラリー100球連続でアウトゼロを目指す",
                priority = 2,
                estimatedMinutes = 30,
                drillType = DrillType.GROUNDSTROKE
            ))
        }
        if (stats.netPointsWonPercent < 50) {
            menu.add(PracticeMenuItem(
                title = "ネットプレーの精度",
                description = "アプローチ→ボレー→スマッシュのシークエンス練習",
                priority = 3,
                estimatedMinutes = 15,
                drillType = DrillType.VOLLEY
            ))
        }
        // デフォルト
        if (menu.isEmpty()) {
            menu.add(PracticeMenuItem(
                title = "総合フットワーク",
                description = "コートを縦横に使ったスプリット→ボールへのアプローチ練習",
                priority = 1,
                estimatedMinutes = 20,
                drillType = DrillType.FOOTWORK
            ))
        }
        return menu.sortedBy { it.priority }
    }
}
