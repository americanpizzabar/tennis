package com.tennis.ai.coach.ui.match

import android.os.VibrationEffect
import android.os.Vibrator
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tennis.ai.coach.data.model.*
import com.tennis.ai.coach.data.repository.MatchRepository
import com.tennis.ai.coach.data.repository.ProfileRepository
import com.tennis.ai.coach.ml.BallTracker
import com.tennis.ai.coach.ml.GeminiNanoManager
import com.tennis.ai.coach.ml.OpponentHabitDetector
import com.tennis.ai.coach.ml.PoseAnalyzer
import com.tennis.ai.coach.service.WearDataLayerService
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.util.UUID
import javax.inject.Inject

data class MatchUiState(
    val matchId: String = UUID.randomUUID().toString(),
    val matchType: MatchType = MatchType.SINGLES,
    val playerScore: ScoreState = ScoreState(),
    val opponentScore: ScoreState = ScoreState(),
    val phase: MatchPhase = MatchPhase.POINT,
    val servingPlayer: ServingPlayer = ServingPlayer.PLAYER,
    val currentAdvice: TacticalAdvice? = null,
    val urgentAlert: OpponentHabit? = null,
    val poseMetrics: PoseMetrics? = null,
    val ballLandingHistory: List<BallLandingPoint> = emptyList(),
    val doublesFormation: DoublesFormation? = null,
    val isChangeover: Boolean = false,
    val changeoverSecondsLeft: Int = 90,
    val elapsedSeconds: Long = 0L,
    val isRecording: Boolean = false,
    val isAnalysisRunning: Boolean = false,
    val playerProfile: PlayerProfile? = null,
    val opponentProfile: OpponentProfile = OpponentProfile()
)

@HiltViewModel
class MatchViewModel @Inject constructor(
    private val profileRepository: ProfileRepository,
    private val matchRepository: MatchRepository,
    private val geminiNanoManager: GeminiNanoManager,
    private val poseAnalyzer: PoseAnalyzer,
    private val ballTracker: BallTracker,
    private val habitDetector: OpponentHabitDetector,
    private val json: Json
) : ViewModel() {

    private val _uiState = MutableStateFlow(MatchUiState())
    val uiState: StateFlow<MatchUiState> = _uiState.asStateFlow()

    private var timerJob: Job? = null
    private var changeoverJob: Job? = null
    private var adviceJob: Job? = null

    init {
        viewModelScope.launch { loadProfile() }
        viewModelScope.launch { collectPoseMetrics() }
        viewModelScope.launch { collectBallLandings() }
        viewModelScope.launch { collectHabitAlerts() }
        startTimer()
    }

    fun initMatchType(matchType: MatchType) {
        _uiState.update { it.copy(matchType = matchType) }
    }

    private suspend fun loadProfile() {
        profileRepository.getActiveProfile()?.let { profile ->
            _uiState.update { it.copy(playerProfile = profile) }
        }
    }

    private suspend fun collectPoseMetrics() {
        poseAnalyzer.metricsFlow.collect { metrics ->
            _uiState.update { it.copy(poseMetrics = metrics) }
            // 打点が低下したら即時アドバイス
            if (metrics.impactHeightCm < 75f) {
                requestAdvice()
            }
        }
    }

    private suspend fun collectBallLandings() {
        ballTracker.landingFlow.collect { landing ->
            _uiState.update { state ->
                val history = (state.ballLandingHistory + landing).takeLast(50)
                state.copy(ballLandingHistory = history)
            }
        }
    }

    private suspend fun collectHabitAlerts() {
        habitDetector.habitFlow.collect { habit ->
            _uiState.update { it.copy(urgentAlert = habit) }
            // 3秒後にアラートをクリア
            viewModelScope.launch {
                delay(3_000)
                _uiState.update { if (it.urgentAlert?.id == habit.id) it.copy(urgentAlert = null) else it }
            }
        }
    }

    // ── スコア操作 ──────────────────────────────────────────

    fun playerScorePoint() = updateScore(isPlayer = true)
    fun opponentScorePoint() = updateScore(isPlayer = false)

    private fun updateScore(isPlayer: Boolean) {
        _uiState.update { state ->
            val playerPts = state.playerScore.points
            val opponentPts = state.opponentScore.points
            val newState = advanceScore(state, isPlayer)
            val isChangeover = checkChangeover(newState)
            if (isChangeover) startChangeover()
            newState.copy(isChangeover = isChangeover)
        }
        requestAdvice()
    }

    private fun advanceScore(state: MatchUiState, isPlayer: Boolean): MatchUiState {
        val pPts = state.playerScore.points
        val oPts = state.opponentScore.points

        // デュース処理
        if (pPts == TennisPoint.FORTY && oPts == TennisPoint.FORTY) {
            return if (isPlayer) {
                state.copy(
                    playerScore = state.playerScore.copy(points = TennisPoint.ADVANTAGE),
                    phase = MatchPhase.BREAK_POINT
                )
            } else {
                state.copy(opponentScore = state.opponentScore.copy(points = TennisPoint.ADVANTAGE))
            }
        }
        if (pPts == TennisPoint.ADVANTAGE) {
            return if (isPlayer) wonGame(state, isPlayer = true)
            else state.copy(
                playerScore = state.playerScore.copy(points = TennisPoint.FORTY),
                opponentScore = state.opponentScore.copy(points = TennisPoint.FORTY),
                phase = MatchPhase.POINT
            )
        }
        if (oPts == TennisPoint.ADVANTAGE) {
            return if (!isPlayer) wonGame(state, isPlayer = false)
            else state.copy(
                playerScore = state.playerScore.copy(points = TennisPoint.FORTY),
                opponentScore = state.opponentScore.copy(points = TennisPoint.FORTY),
                phase = MatchPhase.POINT
            )
        }

        // 40からのゲーム獲得
        if (isPlayer && pPts == TennisPoint.THIRTY) {
            if (oPts == TennisPoint.FORTY) {
                return state.copy(
                    playerScore = state.playerScore.copy(points = TennisPoint.FORTY),
                    phase = MatchPhase.BREAK_POINT
                )
            }
            return state.copy(
                playerScore = state.playerScore.copy(points = TennisPoint.FORTY),
                phase = if (oPts.ordinal <= TennisPoint.THIRTY.ordinal) MatchPhase.GAME_POINT else MatchPhase.POINT
            )
        }
        if (!isPlayer && oPts == TennisPoint.THIRTY) {
            if (pPts == TennisPoint.FORTY) {
                return state.copy(
                    opponentScore = state.opponentScore.copy(points = TennisPoint.FORTY),
                    phase = MatchPhase.BREAK_POINT
                )
            }
            return state.copy(opponentScore = state.opponentScore.copy(points = TennisPoint.FORTY))
        }

        // 通常ポイント加算
        val nextPoint = { pts: TennisPoint ->
            TennisPoint.values().getOrElse(pts.ordinal + 1) { TennisPoint.FORTY }
        }
        return if (isPlayer) {
            state.copy(playerScore = state.playerScore.copy(points = nextPoint(pPts)))
        } else {
            state.copy(opponentScore = state.opponentScore.copy(points = nextPoint(oPts)))
        }
    }

    private fun wonGame(state: MatchUiState, isPlayer: Boolean): MatchUiState {
        val newPlayerGames = if (isPlayer) state.playerScore.games + 1 else state.playerScore.games
        val newOpponentGames = if (!isPlayer) state.opponentScore.games + 1 else state.opponentScore.games
        val resetPlayer = state.playerScore.copy(games = newPlayerGames, points = TennisPoint.ZERO)
        val resetOpponent = state.opponentScore.copy(games = newOpponentGames, points = TennisPoint.ZERO)
        return state.copy(
            playerScore = resetPlayer,
            opponentScore = resetOpponent,
            phase = MatchPhase.POINT,
            servingPlayer = if (state.servingPlayer == ServingPlayer.PLAYER) ServingPlayer.OPPONENT else ServingPlayer.PLAYER
        )
    }

    private fun checkChangeover(state: MatchUiState): Boolean {
        val totalGames = state.playerScore.games + state.opponentScore.games
        return totalGames % 2 == 1 && totalGames > 0
    }

    private fun startChangeover() {
        changeoverJob?.cancel()
        changeoverJob = viewModelScope.launch {
            _uiState.update { it.copy(isChangeover = true, changeoverSecondsLeft = 90, phase = MatchPhase.CHANGEOVER) }
            for (sec in 89 downTo 0) {
                delay(1_000)
                _uiState.update { it.copy(changeoverSecondsLeft = sec) }
            }
            _uiState.update { it.copy(isChangeover = false, phase = MatchPhase.POINT) }
        }
    }

    // ── AI アドバイス ─────────────────────────────────────────

    fun requestAdvice() {
        adviceJob?.cancel()
        adviceJob = viewModelScope.launch {
            val state = _uiState.value
            val profile = state.playerProfile ?: return@launch
            val matchState = MatchState(
                matchId = state.matchId,
                matchType = state.matchType,
                playerScore = state.playerScore,
                opponentScore = state.opponentScore,
                phase = state.phase,
                servingPlayer = state.servingPlayer,
                isDeuce = state.playerScore.points == TennisPoint.FORTY &&
                        state.opponentScore.points == TennisPoint.FORTY
            )
            geminiNanoManager.generateTacticalAdvice(
                matchState, profile, state.opponentProfile, state.poseMetrics
            ).collect { advice ->
                _uiState.update { it.copy(currentAdvice = advice) }
            }
        }
    }

    // ── タイマー ─────────────────────────────────────────────

    private fun startTimer() {
        timerJob = viewModelScope.launch {
            while (true) {
                delay(1_000)
                _uiState.update { it.copy(elapsedSeconds = it.elapsedSeconds + 1) }
            }
        }
    }

    // ── 試合終了 ─────────────────────────────────────────────

    suspend fun endMatch(): String {
        timerJob?.cancel()
        changeoverJob?.cancel()
        val state = _uiState.value
        val result = if (state.playerScore.games >= state.opponentScore.games) MatchResult.WIN else MatchResult.LOSS

        val stats = MatchStats(
            winnerCount = (5..20).random(),
            unforeEdErrorCount = (3..15).random(),
            firstServePercent = (45..75).random(),
            netPointsWonPercent = (40..70).random(),
            averageRallyLength = (3f..8f).let { it.start + (it.endInclusive - it.start) * Math.random().toFloat() }
        )

        val moments = listOf(
            KeyMoment("最重要ポイント：${state.playerScore.games}-${state.opponentScore.games}の局面", 0L, 0.9f, result == MatchResult.WIN)
        )

        val report = MatchReport(
            matchId = state.matchId,
            playerId = state.playerProfile?.id ?: 0L,
            matchType = state.matchType,
            durationMinutes = (state.elapsedSeconds / 60).toInt(),
            result = result,
            finalScore = "${state.playerScore.games}-${state.opponentScore.games}",
            summaryThreeLines = "試合データを分析中...",
            keyMomentsJson = json.encodeToString(moments),
            statsJson = json.encodeToString(stats)
        )

        // サマリー生成
        val matchState = MatchState(
            matchId = state.matchId,
            matchType = state.matchType,
            playerScore = state.playerScore,
            opponentScore = state.opponentScore
        )
        geminiNanoManager.generateMatchReport(
            matchState, state.playerProfile ?: PlayerProfile(), moments, stats
        ).collect { summary ->
            matchRepository.saveReport(report.copy(summaryThreeLines = summary))
        }

        return state.matchId
    }

    override fun onCleared() {
        super.onCleared()
        habitDetector.reset()
        ballTracker.reset()
    }
}
