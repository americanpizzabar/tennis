package com.tennis.ai.coach.ui.match

import androidx.camera.view.PreviewView
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tennis.ai.coach.camera.CameraManager
import com.tennis.ai.coach.data.model.*
import com.tennis.ai.coach.data.repository.MatchRepository
import com.tennis.ai.coach.data.repository.ProfileRepository
import com.tennis.ai.coach.ml.BallTracker
import com.tennis.ai.coach.ml.GeminiNanoManager
import com.tennis.ai.coach.ml.OpponentHabitDetector
import com.tennis.ai.coach.ml.PoseAnalyzer
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.util.UUID
import javax.inject.Inject

data class ChangeoverTactic(
    val title: String,
    val emoji: String,
    val category: String,
    val shortDesc: String,
    val detailedExplanation: String,
    val isSelected: Boolean = false
)

data class MatchUiState(
    val matchId: String = UUID.randomUUID().toString(),
    val matchType: MatchType = MatchType.SINGLES,
    val showCameraSetup: Boolean = true,   // カメラ設置画面を試合前に表示
    val showSetupDialog: Boolean = false,
    val opponentName: String = "相手選手",
    val opponentLevel: PlayerLevel = PlayerLevel.INTERMEDIATE,
    val opponentHand: DominantHand = DominantHand.RIGHT,
    // ダブルス用：パートナー & 相手 2 名分の情報
    val partner: PartnerProfile = PartnerProfile(),
    val opponent2: PartnerProfile = PartnerProfile(name = "相手選手 2"),
    val deuceRule: DeuceRule = DeuceRule.STANDARD_AD,
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
    val changeoverTactics: List<ChangeoverTactic> = emptyList(),
    val elapsedSeconds: Long = 0L,
    val isCameraActive: Boolean = false,
    val cameraZoomRatio: Float = 1.0f,
    val showSkeletonOverlay: Boolean = false,
    val isRecording: Boolean = false,
    val playerProfile: PlayerProfile? = null,
    val opponentProfile: OpponentProfile = OpponentProfile(),
    // 現在ゲームのデュース回数（SEMI_AD ルール用）
    val deuceCountThisGame: Int = 0,
    // ポイント単位の分析履歴（試合終了時にレポートに含める）
    val pointAnalyses: List<PointAnalysisSnapshot> = emptyList(),
    // 詳細スタッツ記録モード：各ポイント獲得後に分類シートを表示
    val detailedStatsMode: Boolean = true,
    // 直近で「+1ポイント」が押されて分類待ちのポイント（null なら待機なし）
    val pendingPoint: PendingPoint? = null,
    // 現ポイントで既に 1st サーブをフォルトしたかどうか（= 次は 2nd サーブ）
    val firstServeFaultedThisPoint: Boolean = false,
    // この試合で計上された 1st/2nd サーブの累積カウンタ
    val cumulativeFirstServeAttempts: Int = 0,
    val cumulativeFirstServeIn: Int = 0,
    val cumulativeSecondServeAttempts: Int = 0,
)

/** ポイント獲得直後の分類待ち情報。シートで category 等を埋めて確定させる。 */
data class PendingPoint(
    val winnerIsPlayer: Boolean,
    val gameScoreBefore: String,
    val pointScoreBefore: String,
    val phaseBefore: MatchPhase,
    val playerWasServing: Boolean,
    val wasBreakPoint: Boolean,
    val ballSpeedKmh: Float,
    val poseMetrics: PoseMetrics?,
    val landingsSinceLastPoint: List<BallLandingPoint>,
)

/** ポイント取得時に保存する分析スナップショット（試合後レビュー用、メモリ内のみ）。 */
data class PointAnalysisSnapshot(
    val pointIndex: Int,
    val timestampMs: Long = System.currentTimeMillis(),
    val gameScore: String,                // 例 "3G - 2G"
    val pointScore: String,               // 例 "30-15"
    val winnerIsPlayer: Boolean,
    val phaseAtPoint: MatchPhase,
    val advice: TacticalAdvice?,
    val poseMetricsSnapshot: PoseMetrics?,
    val landingsSinceLastPoint: List<BallLandingPoint>,
    /** ポイントの種別（ユーザーが分類記録モードで指定）。 */
    val category: PointCategory = PointCategory.UNCATEGORIZED,
    /** どのサーブで決着したか（1st/2nd）。 */
    val serveAttempt: ServeAttempt = ServeAttempt.NONE,
    /** プレイヤーがサーブ側だったかどうか（= サーブ権）。 */
    val playerWasServing: Boolean = false,
    /** 決定的なストロークの種別。 */
    val strokeType: StrokeType = StrokeType.UNKNOWN,
    /** ラリー数（推定または手動）。 */
    val rallyLength: Int = 0,
    /** 検出された最大球速（推定）。 */
    val ballSpeedKmh: Float = 0f,
    /** ブレークポイントだったか。 */
    val wasBreakPoint: Boolean = false,
)

/** ストレージ永続化用のスナップショット形（DB に JSON 文字列として保存）。 */
@kotlinx.serialization.Serializable
data class SerializablePointSnapshot(
    val pointIndex: Int,
    val timestampMs: Long,
    val gameScore: String,
    val pointScore: String,
    val winnerIsPlayer: Boolean,
    val phaseAtPointName: String,
    val adviceTitle: String? = null,
    val adviceBody: String? = null,
    val adviceCategory: String? = null,
    val impactHeightCm: Float? = null,
    val swingSpeedKmh: Float? = null,
    val kneeAngleDeg: Float? = null,
    val landingsCount: Int = 0,
)

@HiltViewModel
class MatchViewModel @Inject constructor(
    private val profileRepository: ProfileRepository,
    private val matchRepository: MatchRepository,
    private val geminiNanoManager: GeminiNanoManager,
    private val poseAnalyzer: PoseAnalyzer,
    private val ballTracker: BallTracker,
    private val habitDetector: OpponentHabitDetector,
    private val cameraManager: CameraManager,
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
    }

    fun initMatchType(matchType: MatchType) {
        _uiState.update { it.copy(matchType = matchType) }
    }

    // ── 試合前セットアップ ─────────────────────────────────────

    /** カメラ設置完了 → セットアップダイアログへ進む */
    fun completeCameraSetup() {
        _uiState.update { it.copy(showCameraSetup = false, showSetupDialog = true) }
    }

    /** カメラ設置をスキップしていきなりセットアップへ */
    fun skipCameraSetup() = completeCameraSetup()

    fun setupMatch(
        opponentName: String,
        opponentLevel: PlayerLevel,
        opponentHand: DominantHand,
        partner: PartnerProfile,
        opponent2: PartnerProfile,
        deuceRule: DeuceRule,
    ) {
        val oName = opponentName.ifBlank { "相手選手" }
        _uiState.update { state ->
            state.copy(
                showSetupDialog = false,
                opponentName = oName,
                opponentLevel = opponentLevel,
                opponentHand = opponentHand,
                partner = partner,
                opponent2 = opponent2,
                deuceRule = deuceRule,
                opponentProfile = state.opponentProfile.copy(
                    name = oName,
                    estimatedLevel = opponentLevel,
                    dominantHand = opponentHand,
                )
            )
        }
        startTimer()
        requestAdvice()
    }

    fun setCameraZoom(ratio: Float) {
        cameraManager.setZoom(ratio.coerceIn(1f, 5f))
        _uiState.update { it.copy(cameraZoomRatio = ratio) }
    }

    fun toggleSkeletonOverlay() {
        _uiState.update { it.copy(showSkeletonOverlay = !it.showSkeletonOverlay) }
    }

    fun toggleRecording() {
        if (_uiState.value.isRecording) {
            cameraManager.stopRecording()
            _uiState.update { it.copy(isRecording = false) }
        } else {
            val outDir = profileRepository.getMatchVideoDir()
            cameraManager.startRecording(outDir)
            _uiState.update { it.copy(isRecording = true) }
        }
    }

    /** チェンジオーバー残り時間を待たずに次ゲームへ進む */
    fun skipChangeover() {
        changeoverJob?.cancel()
        _uiState.update { it.copy(isChangeover = false, phase = MatchPhase.POINT, changeoverSecondsLeft = 0) }
    }

    // ── カメラ ────────────────────────────────────────────────

    fun startCamera(lifecycleOwner: LifecycleOwner, previewView: PreviewView) {
        viewModelScope.launch {
            val ok = runCatching {
                cameraManager.startCamera(lifecycleOwner, previewView)
            }.getOrDefault(false)
            _uiState.update { it.copy(isCameraActive = ok) }
        }
    }

    private suspend fun loadProfile() {
        profileRepository.getActiveProfile()?.let { profile ->
            _uiState.update { it.copy(playerProfile = profile) }
        }
    }

    private suspend fun collectPoseMetrics() {
        poseAnalyzer.metricsFlow.collect { metrics ->
            _uiState.update { it.copy(poseMetrics = metrics) }
            if (metrics.impactHeightCm < 75f && !_uiState.value.showSetupDialog) requestAdvice()
        }
    }

    private suspend fun collectBallLandings() {
        ballTracker.landingFlow.collect { landing ->
            _uiState.update { state ->
                state.copy(ballLandingHistory = (state.ballLandingHistory + landing).takeLast(50))
            }
        }
    }

    private suspend fun collectHabitAlerts() {
        habitDetector.habitFlow.collect { habit ->
            _uiState.update { it.copy(urgentAlert = habit) }
            viewModelScope.launch {
                delay(4_000)
                _uiState.update { if (it.urgentAlert?.id == habit.id) it.copy(urgentAlert = null) else it }
            }
        }
    }

    // ── スコア操作 ──────────────────────────────────────────

    fun playerScorePoint() = beginScorePoint(isPlayer = true)
    fun opponentScorePoint() = beginScorePoint(isPlayer = false)

    /**
     * ポイント獲得を記録。詳細スタッツモードがオンならシートを出して分類待ちに。
     * オフならその場で確定。
     */
    private fun beginScorePoint(isPlayer: Boolean) {
        val before = _uiState.value
        val playerWasServing = before.servingPlayer == ServingPlayer.PLAYER
        val wasBreakPoint = before.phase == MatchPhase.BREAK_POINT
        val ballSpeed = estimateBallSpeed(before.ballLandingHistory)

        if (before.detailedStatsMode) {
            _uiState.update {
                it.copy(
                    pendingPoint = PendingPoint(
                        winnerIsPlayer = isPlayer,
                        gameScoreBefore = "${before.playerScore.games}G - ${before.opponentScore.games}G",
                        pointScoreBefore = "${before.playerScore.points.display}-${before.opponentScore.points.display}",
                        phaseBefore = before.phase,
                        playerWasServing = playerWasServing,
                        wasBreakPoint = wasBreakPoint,
                        ballSpeedKmh = ballSpeed,
                        poseMetrics = before.poseMetrics,
                        landingsSinceLastPoint = before.ballLandingHistory.takeLast(10),
                    )
                )
            }
            return
        }
        // シンプルモード：分類なしで即確定
        commitScore(
            isPlayer = isPlayer,
            category = PointCategory.UNCATEGORIZED,
            serveAttempt = ServeAttempt.NONE,
            strokeType = StrokeType.UNKNOWN,
            rallyLength = 0,
        )
    }

    /** ボトムシートで分類を選んだあとに呼ばれる確定関数。 */
    fun confirmPendingPoint(
        category: PointCategory,
        strokeType: StrokeType = StrokeType.UNKNOWN,
        rallyLength: Int = 0,
    ) {
        val pending = _uiState.value.pendingPoint ?: return
        // サーブ番号は内部状態から決定：1st フォルト後なら 2nd、ace/df 等は 1st とみなす
        val serveAttempt = when {
            !pending.playerWasServing && category != PointCategory.ACE -> ServeAttempt.NONE
            // サーバー側が決定打 / DF した場合は現在のサーブ試行を使う
            else -> if (_uiState.value.firstServeFaultedThisPoint) ServeAttempt.SECOND
                else ServeAttempt.FIRST
        }
        commitScore(
            isPlayer = pending.winnerIsPlayer,
            category = category,
            serveAttempt = serveAttempt,
            strokeType = strokeType,
            rallyLength = rallyLength,
        )
    }

    fun cancelPendingPoint() {
        _uiState.update { it.copy(pendingPoint = null) }
    }

    /** 「1st サーブをフォルト」を記録。次の getsScored は 2nd サーブ扱い。 */
    fun recordFirstServeFault() {
        _uiState.update {
            it.copy(
                firstServeFaultedThisPoint = true,
                cumulativeFirstServeAttempts = it.cumulativeFirstServeAttempts + 1,
            )
        }
    }

    fun setDetailedStatsMode(enabled: Boolean) {
        _uiState.update { it.copy(detailedStatsMode = enabled) }
    }

    private fun commitScore(
        isPlayer: Boolean,
        category: PointCategory,
        serveAttempt: ServeAttempt,
        strokeType: StrokeType,
        rallyLength: Int,
    ) {
        val before = _uiState.value
        val pending = before.pendingPoint
        val playerWasServing = pending?.playerWasServing
            ?: (before.servingPlayer == ServingPlayer.PLAYER)
        val wasBreakPoint = pending?.wasBreakPoint
            ?: (before.phase == MatchPhase.BREAK_POINT)
        val ballSpeed = pending?.ballSpeedKmh ?: estimateBallSpeed(before.ballLandingHistory)
        val poseMetrics = pending?.poseMetrics ?: before.poseMetrics
        val landings = pending?.landingsSinceLastPoint ?: before.ballLandingHistory.takeLast(10)
        val gameScoreBefore = pending?.gameScoreBefore
            ?: "${before.playerScore.games}G - ${before.opponentScore.games}G"
        val pointScoreBefore = pending?.pointScoreBefore
            ?: "${before.playerScore.points.display}-${before.opponentScore.points.display}"
        val phaseBefore = pending?.phaseBefore ?: before.phase

        val snapshot = PointAnalysisSnapshot(
            pointIndex = before.pointAnalyses.size,
            gameScore = gameScoreBefore,
            pointScore = pointScoreBefore,
            winnerIsPlayer = isPlayer,
            phaseAtPoint = phaseBefore,
            advice = before.currentAdvice,
            poseMetricsSnapshot = poseMetrics,
            landingsSinceLastPoint = landings,
            category = category,
            serveAttempt = serveAttempt,
            playerWasServing = playerWasServing,
            strokeType = strokeType,
            rallyLength = rallyLength,
            ballSpeedKmh = ballSpeed,
            wasBreakPoint = wasBreakPoint,
        )

        _uiState.update { state ->
            val newState = advanceScore(state, isPlayer)
            val needsChangeover = checkChangeover(newState)
            if (needsChangeover) startChangeover(newState)
            // サーブカウンタ更新：サーバーが今ポイントで打ったサーブを 1st/2nd 計上
            val newFirstAttempts = if (playerWasServing && serveAttempt != ServeAttempt.NONE)
                state.cumulativeFirstServeAttempts +
                    (if (serveAttempt == ServeAttempt.FIRST && !state.firstServeFaultedThisPoint) 1 else 0)
            else state.cumulativeFirstServeAttempts
            val newFirstIn = if (playerWasServing && serveAttempt == ServeAttempt.FIRST &&
                category != PointCategory.DOUBLE_FAULT && !state.firstServeFaultedThisPoint
            ) state.cumulativeFirstServeIn + 1 else state.cumulativeFirstServeIn
            val newSecondAttempts = if (playerWasServing && serveAttempt == ServeAttempt.SECOND)
                state.cumulativeSecondServeAttempts + 1
            else state.cumulativeSecondServeAttempts

            newState.copy(
                isChangeover = needsChangeover,
                pointAnalyses = state.pointAnalyses + snapshot,
                pendingPoint = null,
                firstServeFaultedThisPoint = false,    // 次ポイント用にリセット
                cumulativeFirstServeAttempts = newFirstAttempts,
                cumulativeFirstServeIn = newFirstIn,
                cumulativeSecondServeAttempts = newSecondAttempts,
            )
        }
        requestAdvice()
    }

    /**
     * 蓄積したポイント履歴から、両プレイヤーの詳細スタッツを集計する。
     * 各カテゴリは「誰が取ったか」「サーバーは誰か」「どのカテゴリか」から派生して計上される。
     */
    private fun computeStatsFromPoints(state: MatchUiState): MatchStats {
        var p = PlayerMatchStats()
        var o = PlayerMatchStats()

        for (snap in state.pointAnalyses) {
            // ── 共通：通算 / トータル ─────────────────
            p = p.copy(totalPointsPlayed = p.totalPointsPlayed + 1)
            o = o.copy(totalPointsPlayed = o.totalPointsPlayed + 1)
            if (snap.winnerIsPlayer) p = p.copy(totalPointsWon = p.totalPointsWon + 1)
            else o = o.copy(totalPointsWon = o.totalPointsWon + 1)

            // ── ラリー長＆ボール速度サンプル ─────────
            if (snap.rallyLength > 0) {
                p = p.copy(rallyLengthSum = p.rallyLengthSum + snap.rallyLength,
                    rallyCount = p.rallyCount + 1)
                o = o.copy(rallyLengthSum = o.rallyLengthSum + snap.rallyLength,
                    rallyCount = o.rallyCount + 1)
            }
            if (snap.ballSpeedKmh > 0f) {
                if (snap.winnerIsPlayer) {
                    p = p.copy(
                        ballSpeedSum = p.ballSpeedSum + snap.ballSpeedKmh,
                        ballSpeedSamples = p.ballSpeedSamples + 1,
                        maxBallSpeedKmh = maxOf(p.maxBallSpeedKmh, snap.ballSpeedKmh),
                    )
                } else {
                    o = o.copy(
                        ballSpeedSum = o.ballSpeedSum + snap.ballSpeedKmh,
                        ballSpeedSamples = o.ballSpeedSamples + 1,
                        maxBallSpeedKmh = maxOf(o.maxBallSpeedKmh, snap.ballSpeedKmh),
                    )
                }
            }

            // ── サーブ統計 ────────────────────────
            if (snap.serveAttempt != ServeAttempt.NONE) {
                val server = if (snap.playerWasServing) "P" else "O"
                val isFirst = snap.serveAttempt == ServeAttempt.FIRST
                val isAce = snap.category == PointCategory.ACE
                val isDF = snap.category == PointCategory.DOUBLE_FAULT

                if (server == "P") {
                    if (isFirst) {
                        p = p.copy(
                            firstServeAttempts = p.firstServeAttempts + 1,
                            firstServeIn = p.firstServeIn + 1,    // FIRST = 1st サーブが入った
                            firstServePointsWon = p.firstServePointsWon +
                                (if (snap.winnerIsPlayer) 1 else 0),
                        )
                    } else {
                        // 2nd サーブ決着 = 1st をフォルトしている前提で 1st カウントも追加
                        p = p.copy(
                            firstServeAttempts = p.firstServeAttempts + 1,
                            secondServeAttempts = p.secondServeAttempts + 1,
                            secondServePointsWon = p.secondServePointsWon +
                                (if (snap.winnerIsPlayer) 1 else 0),
                        )
                    }
                    if (isAce) p = p.copy(aces = p.aces + 1)
                    if (isDF) p = p.copy(doubleFaults = p.doubleFaults + 1)
                    // 相手側のリターン統計
                    if (isFirst && !isDF) {
                        o = o.copy(
                            firstServeReturnAttempts = o.firstServeReturnAttempts + 1,
                            firstServeReturnPointsWon = o.firstServeReturnPointsWon +
                                (if (!snap.winnerIsPlayer) 1 else 0),
                        )
                    } else if (!isFirst) {
                        o = o.copy(
                            secondServeReturnAttempts = o.secondServeReturnAttempts + 1,
                            secondServeReturnPointsWon = o.secondServeReturnPointsWon +
                                (if (!snap.winnerIsPlayer) 1 else 0),
                        )
                    }
                } else {
                    // 相手サーブ
                    if (isFirst) {
                        o = o.copy(
                            firstServeAttempts = o.firstServeAttempts + 1,
                            firstServeIn = o.firstServeIn + 1,
                            firstServePointsWon = o.firstServePointsWon +
                                (if (!snap.winnerIsPlayer) 1 else 0),
                        )
                    } else {
                        o = o.copy(
                            firstServeAttempts = o.firstServeAttempts + 1,
                            secondServeAttempts = o.secondServeAttempts + 1,
                            secondServePointsWon = o.secondServePointsWon +
                                (if (!snap.winnerIsPlayer) 1 else 0),
                        )
                    }
                    if (isAce) o = o.copy(aces = o.aces + 1)
                    if (isDF) o = o.copy(doubleFaults = o.doubleFaults + 1)
                    if (isFirst && !isDF) {
                        p = p.copy(
                            firstServeReturnAttempts = p.firstServeReturnAttempts + 1,
                            firstServeReturnPointsWon = p.firstServeReturnPointsWon +
                                (if (snap.winnerIsPlayer) 1 else 0),
                        )
                    } else if (!isFirst) {
                        p = p.copy(
                            secondServeReturnAttempts = p.secondServeReturnAttempts + 1,
                            secondServeReturnPointsWon = p.secondServeReturnPointsWon +
                                (if (snap.winnerIsPlayer) 1 else 0),
                        )
                    }
                }
            }

            // ── ブレークポイント ──────────────────
            if (snap.wasBreakPoint) {
                if (snap.playerWasServing) {
                    // プレイヤーサービスゲームのブレークポイント
                    p = p.copy(breakPointsFaced = p.breakPointsFaced + 1)
                    if (snap.winnerIsPlayer) p = p.copy(breakPointsSaved = p.breakPointsSaved + 1)
                    o = o.copy(breakPointsAttempted = o.breakPointsAttempted + 1)
                    if (!snap.winnerIsPlayer) o = o.copy(breakPointsConverted = o.breakPointsConverted + 1)
                } else {
                    // 相手サービスゲームのブレークポイント（プレイヤー攻撃側）
                    o = o.copy(breakPointsFaced = o.breakPointsFaced + 1)
                    if (!snap.winnerIsPlayer) o = o.copy(breakPointsSaved = o.breakPointsSaved + 1)
                    p = p.copy(breakPointsAttempted = p.breakPointsAttempted + 1)
                    if (snap.winnerIsPlayer) p = p.copy(breakPointsConverted = p.breakPointsConverted + 1)
                }
            }

            // ── ストローク種別ベースのウィナー / エラー ─────
            val winnerSidePlayer = snap.winnerIsPlayer
            when (snap.category) {
                PointCategory.WINNER, PointCategory.NET_WINNER, PointCategory.SERVICE_WINNER -> {
                    if (winnerSidePlayer) {
                        p = p.copy(winners = p.winners + 1)
                        when (snap.strokeType) {
                            StrokeType.FOREHAND -> p = p.copy(forehandWinners = p.forehandWinners + 1)
                            StrokeType.BACKHAND -> p = p.copy(backhandWinners = p.backhandWinners + 1)
                            else -> Unit
                        }
                    } else {
                        o = o.copy(winners = o.winners + 1)
                        when (snap.strokeType) {
                            StrokeType.FOREHAND -> o = o.copy(forehandWinners = o.forehandWinners + 1)
                            StrokeType.BACKHAND -> o = o.copy(backhandWinners = o.backhandWinners + 1)
                            else -> Unit
                        }
                    }
                }
                PointCategory.UNFORCED_ERROR -> {
                    // 失った側にカウント
                    if (winnerSidePlayer) {
                        // 相手のアンフォースド
                        o = o.copy(unforcedErrors = o.unforcedErrors + 1)
                        when (snap.strokeType) {
                            StrokeType.FOREHAND -> o = o.copy(forehandErrors = o.forehandErrors + 1)
                            StrokeType.BACKHAND -> o = o.copy(backhandErrors = o.backhandErrors + 1)
                            else -> Unit
                        }
                    } else {
                        // プレイヤーのアンフォースド
                        p = p.copy(unforcedErrors = p.unforcedErrors + 1)
                        when (snap.strokeType) {
                            StrokeType.FOREHAND -> p = p.copy(forehandErrors = p.forehandErrors + 1)
                            StrokeType.BACKHAND -> p = p.copy(backhandErrors = p.backhandErrors + 1)
                            else -> Unit
                        }
                    }
                }
                PointCategory.FORCED_ERROR -> {
                    if (winnerSidePlayer) o = o.copy(forcedErrors = o.forcedErrors + 1)
                    else p = p.copy(forcedErrors = p.forcedErrors + 1)
                }
                else -> Unit
            }

            // ── ネットアプローチ（ネットウィナーのみカウント） ──
            if (snap.category == PointCategory.NET_WINNER) {
                if (winnerSidePlayer) p = p.copy(
                    netApproaches = p.netApproaches + 1,
                    netApproachesWon = p.netApproachesWon + 1,
                )
                else o = o.copy(
                    netApproaches = o.netApproaches + 1,
                    netApproachesWon = o.netApproachesWon + 1,
                )
            }
        }

        // ── 集計値の派生（後方互換のための古いフィールドにも反映） ───
        val firstServePct = p.firstServePercent()
        val secondServePct = p.secondServePointsWonPercent()
        val avgRally = p.averageRallyLength()
        return MatchStats(
            firstServePercent = firstServePct,
            secondServePercent = secondServePct,
            winnerCount = p.winners,
            unforeEdErrorCount = p.unforcedErrors,
            netPointsWonPercent = p.netApproachesWonPercent(),
            breakPointsConverted = p.breakPointsConverted,
            breakPointsFaced = p.breakPointsFaced,
            averageRallyLength = avgRally,
            player = p,
            opponent = o,
        )
    }

    /** 直近の着弾点間隔から球速を簡易推定（km/h）。実精度は参考値レベル。 */
    private fun estimateBallSpeed(landings: List<BallLandingPoint>): Float {
        if (landings.size < 2) return 0f
        val a = landings[landings.size - 2]
        val b = landings.last()
        val dt = (b.timestampMs - a.timestampMs).coerceAtLeast(1L)
        val dx = b.x - a.x
        val dy = b.y - a.y
        val dist = kotlin.math.sqrt(dx * dx + dy * dy)
        // コート対角を 1 ≒ 25m と仮定
        val meters = dist * 25f
        val mPerSec = meters / (dt / 1000f)
        return (mPerSec * 3.6f).coerceIn(0f, 250f)
    }

    private fun advanceScore(state: MatchUiState, isPlayer: Boolean): MatchUiState {
        val winner = if (isPlayer) state.playerScore else state.opponentScore
        val loser = if (isPlayer) state.opponentScore else state.playerScore
        val winnerIsServer = (isPlayer && state.servingPlayer == ServingPlayer.PLAYER) ||
            (!isPlayer && state.servingPlayer == ServingPlayer.OPPONENT)

        // 1. アドバンテージ保持側が得点 → ゲーム取得
        if (winner.points == TennisPoint.ADVANTAGE) return wonGame(state, isPlayer)

        // 2. 相手がアドバンテージ → デュースに戻る（デュース回数 +1）
        if (loser.points == TennisPoint.ADVANTAGE) {
            return state.copy(
                playerScore = state.playerScore.copy(points = TennisPoint.FORTY),
                opponentScore = state.opponentScore.copy(points = TennisPoint.FORTY),
                phase = MatchPhase.POINT,
                deuceCountThisGame = state.deuceCountThisGame + 1,
            )
        }

        // 3. 40-40（デュース）
        if (winner.points == TennisPoint.FORTY && loser.points == TennisPoint.FORTY) {
            // SEMI_AD：1 回目のデュースだけ AD 方式、2 回目以降の 40-40 は次の 1 点で決着
            val effectiveRule = when (state.deuceRule) {
                DeuceRule.STANDARD_AD -> DeuceRule.STANDARD_AD
                DeuceRule.NO_AD -> DeuceRule.NO_AD
                DeuceRule.SEMI_AD -> if (state.deuceCountThisGame == 0) DeuceRule.STANDARD_AD else DeuceRule.NO_AD
            }
            return when (effectiveRule) {
                DeuceRule.NO_AD -> wonGame(state, isPlayer)
                else -> {
                    val newWinnerScore = winner.copy(points = TennisPoint.ADVANTAGE)
                    val phase = if (winnerIsServer) MatchPhase.GAME_POINT else MatchPhase.BREAK_POINT
                    if (isPlayer)
                        state.copy(playerScore = newWinnerScore, phase = phase)
                    else
                        state.copy(opponentScore = newWinnerScore, phase = phase)
                }
            }
        }

        // 4. 40-X（X<40）で 40 側が得点 → ゲーム取得
        if (winner.points == TennisPoint.FORTY) return wonGame(state, isPlayer)

        // 5. それ以外は通常の進行（0→15→30→40）
        val nextPoint = when (winner.points) {
            TennisPoint.ZERO -> TennisPoint.FIFTEEN
            TennisPoint.FIFTEEN -> TennisPoint.THIRTY
            TennisPoint.THIRTY -> TennisPoint.FORTY
            else -> TennisPoint.FORTY
        }
        val newWinnerScore = winner.copy(points = nextPoint)
        val newPhase = computePhase(
            winnerPoints = nextPoint,
            loserPoints = loser.points,
            winnerIsServer = winnerIsServer,
            deuceRule = state.deuceRule
        )
        return if (isPlayer)
            state.copy(playerScore = newWinnerScore, phase = newPhase)
        else
            state.copy(opponentScore = newWinnerScore, phase = newPhase)
    }

    private fun computePhase(
        winnerPoints: TennisPoint,
        loserPoints: TennisPoint,
        winnerIsServer: Boolean,
        deuceRule: DeuceRule
    ): MatchPhase {
        // 40-40 でノーアドの場合は次が決着 → GAME_POINT / BREAK_POINT
        if (winnerPoints == TennisPoint.FORTY && loserPoints == TennisPoint.FORTY &&
            deuceRule == DeuceRule.NO_AD
        ) {
            return if (winnerIsServer) MatchPhase.GAME_POINT else MatchPhase.BREAK_POINT
        }
        // 40-X (X<40) で得点側がサーバー → ゲームポイント
        if (winnerPoints == TennisPoint.FORTY && loserPoints.ordinal < TennisPoint.FORTY.ordinal) {
            return if (winnerIsServer) MatchPhase.GAME_POINT else MatchPhase.BREAK_POINT
        }
        return MatchPhase.POINT
    }

    private fun wonGame(state: MatchUiState, isPlayer: Boolean): MatchUiState {
        val pGames = if (isPlayer) state.playerScore.games + 1 else state.playerScore.games
        val oGames = if (!isPlayer) state.opponentScore.games + 1 else state.opponentScore.games
        val newServer = if (state.servingPlayer == ServingPlayer.PLAYER) ServingPlayer.OPPONENT else ServingPlayer.PLAYER
        val setDone = (pGames >= 6 && pGames - oGames >= 2) || (oGames >= 6 && oGames - pGames >= 2) || pGames == 7 || oGames == 7
        return if (setDone) {
            state.copy(
                playerScore = state.playerScore.copy(sets = state.playerScore.sets + pGames, games = 0, points = TennisPoint.ZERO),
                opponentScore = state.opponentScore.copy(sets = state.opponentScore.sets + oGames, games = 0, points = TennisPoint.ZERO),
                phase = MatchPhase.POINT, servingPlayer = newServer,
                deuceCountThisGame = 0,
            )
        } else {
            state.copy(
                playerScore = state.playerScore.copy(games = pGames, points = TennisPoint.ZERO),
                opponentScore = state.opponentScore.copy(games = oGames, points = TennisPoint.ZERO),
                phase = MatchPhase.POINT, servingPlayer = newServer,
                deuceCountThisGame = 0,
            )
        }
    }

    private fun checkChangeover(state: MatchUiState): Boolean {
        val total = state.playerScore.games + state.opponentScore.games
        return total % 2 == 1 && total > 0
    }

    // ── チェンジオーバー ──────────────────────────────────────

    private fun startChangeover(currentState: MatchUiState) {
        changeoverJob?.cancel()
        changeoverJob = viewModelScope.launch {
            val tactics = buildChangeoverTactics(currentState)
            _uiState.update { it.copy(
                isChangeover = true, changeoverSecondsLeft = 90,
                phase = MatchPhase.CHANGEOVER, changeoverTactics = tactics
            )}
            for (sec in 89 downTo 0) {
                delay(1_000)
                _uiState.update { it.copy(changeoverSecondsLeft = sec) }
            }
            _uiState.update { it.copy(isChangeover = false, phase = MatchPhase.POINT) }
        }
    }

    fun selectTactic(index: Int) {
        _uiState.update { state ->
            state.copy(changeoverTactics = state.changeoverTactics.mapIndexed { i, t ->
                t.copy(isSelected = i == index)
            })
        }
    }

    private fun buildChangeoverTactics(state: MatchUiState): List<ChangeoverTactic> {
        val isWinning = state.playerScore.games > state.opponentScore.games
        val isDoubles = state.matchType == MatchType.DOUBLES
        val backhandSide = if (state.opponentProfile.dominantHand == DominantHand.RIGHT) "アドサイド（左側）" else "デュースサイド（右側）"
        val level = state.playerProfile?.level ?: PlayerLevel.INTERMEDIATE
        val score = "${state.playerScore.games}G - ${state.opponentScore.games}G"

        val tactics = mutableListOf(
            ChangeoverTactic(
                title = "サーブ＆ボレー",
                emoji = "⚡",
                category = "攻撃",
                shortDesc = "サーブ後すぐにネット前へ詰める",
                detailedExplanation = buildString {
                    appendLine("【戦術の狙い】")
                    appendLine("サーブ後すぐに前進し、相手のリターンをボレーで決める積極策。相手にラリーの時間を与えません。")
                    appendLine()
                    appendLine("【実行ステップ】")
                    appendLine("① ファーストサーブをワイドまたはボディへ打つ")
                    appendLine("② 打った瞬間に2〜3歩前進しながらスプリットステップ")
                    appendLine("③ 相手のリターンを予測し、ボレーでオープンコートへ角度をつける")
                    appendLine("④ ボレーは深く打つより角度をつけて決める")
                    appendLine()
                    appendLine("【注意点】")
                    if (isDoubles) appendLine("前衛の${state.partner.name}と役割分担を確認。センターはパートナーに任せる。")
                    appendLine(if (level == PlayerLevel.BEGINNER) "まずはサービスライン付近まで前進する練習から始めましょう。" else "相手がパッシングを打ちやすい状況では使いすぎに注意。")
                }
            ),
            ChangeoverTactic(
                title = "深いクロスラリー",
                emoji = "↗️",
                category = "安定",
                shortDesc = "深いクロスで相手をベースラインに縛る",
                detailedExplanation = buildString {
                    appendLine("【戦術の狙い】")
                    appendLine("安定したクロスコートへの深いボールで相手を左右に動かし、ミスを誘う堅実な作戦。")
                    appendLine()
                    appendLine("【実行ステップ】")
                    appendLine("① ベースライン付近でポジションを取る")
                    appendLine("② ネット上30〜50cmを通してクロスへ深く打つ")
                    appendLine("③ 相手がセンターに戻る前にもう一度クロスへ")
                    appendLine("④ 浅いボールが返ってきたらストレートに展開")
                    appendLine("⑤ オープンコートにウィナーを決める")
                    appendLine()
                    appendLine("【現状（$score）との関係】")
                    appendLine(if (isWinning) "リード中のため、ミスを避けてラリーを続けることが最優先。" else "ラリーを安定させてミスを減らし、差を縮める。")
                }
            ),
            ChangeoverTactic(
                title = "バックハンド側を集中攻撃",
                emoji = "🎯",
                category = "弱点攻撃",
                shortDesc = "${backhandSide}へ繰り返し打ち込む",
                detailedExplanation = buildString {
                    appendLine("【戦術の狙い】")
                    appendLine("多くの選手はバックハンドが弱点。意図的に${backhandSide}へ打ち続けて崩す。")
                    appendLine()
                    appendLine("【実行ステップ】")
                    appendLine("① サーブを${backhandSide}へ打つ")
                    appendLine("② ラリー中も${backhandSide}を中心に攻める")
                    appendLine("③ 3〜4球連続後、逆のフォア側に大きく展開")
                    appendLine("④ 相手が走ったスキにオープンコートを決める")
                    appendLine()
                    appendLine("【組み合わせ技】")
                    appendLine("バックに打った後、ドロップショットやロブを混ぜると相手のリズムが崩れる。")
                    appendLine("バックを嫌がり始めたら、わざとフォア側に打って「次はバック」という恐怖感を与える。")
                }
            ),
            ChangeoverTactic(
                title = "ロブで高さを使う",
                emoji = "☁️",
                category = "変化球",
                shortDesc = "相手をネットから下げてリズムを変える",
                detailedExplanation = buildString {
                    appendLine("【戦術の狙い】")
                    appendLine("相手がネット前に詰めてきたとき、または試合のテンポを変えたいときに有効。")
                    appendLine()
                    appendLine("【実行ステップ】")
                    appendLine("① 相手がネット前にいるのを確認")
                    appendLine("② 高いトップスピンロブでベースラインの1m内側を狙う")
                    appendLine("③ 相手が下がった瞬間すぐに前進してポジションを上げる")
                    appendLine("④ または守備的ロブで時間を稼ぎ、自分のポジションを整える")
                    appendLine()
                    appendLine("【使う頻度】")
                    appendLine("1ゲームに2〜3回が目安。多用すると読まれる。サーブ直後の奇襲ロブが特に効果的。")
                    if (isDoubles) {
                        appendLine()
                        appendLine("【ダブルスでは】")
                        appendLine("前衛の${state.partner.name}がポーチに出るフリをしつつ、ロブで役割交代する「ダミーポーチ＋ロブ」が有効。")
                    }
                }
            ),
            ChangeoverTactic(
                title = if (isWinning) "リードを守る安全策" else "流れを変える積極策",
                emoji = if (isWinning) "🛡️" else "🔥",
                category = if (isWinning) "守備" else "逆転",
                shortDesc = if (isWinning) "確率重視でミスを最小限に" else "思い切ったプレーで流れを取り戻す",
                detailedExplanation = buildString {
                    if (isWinning) {
                        appendLine("【戦術の狙い】")
                        appendLine("現在リード中（$score）。無理なショットを避け、相手のミスを待つ堅実な戦略。")
                        appendLine()
                        appendLine("【実行ステップ】")
                        appendLine("① サーブのコースをmix（ワイド・ボディ・センター）して読まれないようにする")
                        appendLine("② 返球はネット上30〜50cm余裕を持たせる")
                        appendLine("③ 難しいコースへの挑戦は封印、安全なクロスを継続")
                        appendLine("④ 相手がリスクを取るのを待ち、ミスを誘う")
                        appendLine("⑤ ポイント間は深呼吸してルーティンを守る")
                    } else {
                        appendLine("【戦術の狙い】")
                        appendLine("現在ビハインド（$score）。プレースタイルを変えて流れを取り戻す。")
                        appendLine()
                        appendLine("【実行ステップ】")
                        appendLine("① サーブのコースを今までと変える（ワイド→ボディ or ボディ→センターへ）")
                        appendLine("② 早いタイミング（ライジング気味）で打ってテンポを上げる")
                        appendLine("③ 1ゲームに1本、ドロップショットを奇襲として使う")
                        appendLine("④ ミスを恐れず、コーナーを積極的に狙う")
                        appendLine()
                        appendLine("【メンタル面】")
                        appendLine("1ゲームずつに集中する。${state.opponentScore.games - state.playerScore.games}ゲームの差は十分逆転可能。")
                    }
                }
            ),
            ChangeoverTactic(
                title = "ドロップ＋追い球で前後に揺さぶる",
                emoji = "🏃",
                category = "体力消耗作戦",
                shortDesc = "相手を前後に大きく動かして疲弊させる",
                detailedExplanation = buildString {
                    appendLine("【戦術の狙い】")
                    appendLine("ドロップショットで前に走らせた後、追い球（パッシング or ロブ）でポイントを取る。相手の体力と集中力を削る。")
                    appendLine()
                    appendLine("【実行ステップ】")
                    appendLine("① クロスラリー数球でリズムを作る（深さを意識）")
                    appendLine("② 唐突にドロップショットをネット際に落とす")
                    appendLine("③ 相手が前に走ったら:")
                    appendLine("   → 相手が止まったらロブで追い越す")
                    appendLine("   → 相手が張り付いたらパッシングで抜く")
                    appendLine("④ ドロップ成功後は自分もポジションを上げる")
                    appendLine()
                    appendLine("【注意点】")
                    appendLine("1ゲームに1〜2回まで。前のラリーで「深く打つ」印象を与えてから使うこと。")
                }
            )
        )

        if (isDoubles) {
            tactics.add(ChangeoverTactic(
                title = "ダブルス陣形の見直し",
                emoji = "👥",
                category = "ダブルス専用",
                shortDesc = "${state.partner.name}との連携を再確認",
                detailedExplanation = buildString {
                    appendLine("【${state.partner.name}との連携確認】")
                    appendLine()
                    appendLine("① センターの担当を明確に決める（どちらがポーチに出るか）")
                    appendLine("② サーブのコースmix（ワイド→センター→ボディ）を再確認")
                    appendLine("③ ポーチのタイミングのサインを再確認（例：頭を触る→ポーチ出る）")
                    appendLine("④ ロブを打たれた時のスイッチの合図を確認")
                    appendLine()
                    appendLine("【陣形の選択】")
                    appendLine(if (state.opponentProfile.dominantHand == DominantHand.LEFT)
                        "左利きの相手にはアドサイドを強化する並行陣が有効"
                    else "右利きの相手にはデュースサイドからのサーブ＆ネットが定番")
                    appendLine()
                    appendLine("【次のゲームで試すこと】")
                    appendLine("Iフォーメーション（センターにサーバーと前衛を集める）で相手のリターンを攻める。")
                }
            ))
        }
        return tactics
    }

    // ── AI アドバイス ─────────────────────────────────────────

    fun requestAdvice() {
        val s = _uiState.value
        if (s.showSetupDialog || s.showCameraSetup) return
        adviceJob?.cancel()
        adviceJob = viewModelScope.launch {
            val state = _uiState.value
            val profile = state.playerProfile ?: return@launch
            val matchState = MatchState(
                matchId = state.matchId, matchType = state.matchType,
                playerScore = state.playerScore, opponentScore = state.opponentScore,
                phase = state.phase, servingPlayer = state.servingPlayer,
                isDeuce = state.playerScore.points == TennisPoint.FORTY && state.opponentScore.points == TennisPoint.FORTY
            )
            geminiNanoManager.generateTacticalAdvice(matchState, profile, state.opponentProfile, state.poseMetrics)
                .collect { advice -> _uiState.update { it.copy(currentAdvice = advice) } }
        }
    }

    // ── タイマー ─────────────────────────────────────────────

    private fun startTimer() {
        timerJob?.cancel()
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
        // 録画中なら停止
        if (_uiState.value.isRecording) {
            cameraManager.stopRecording()
            _uiState.update { it.copy(isRecording = false) }
        }
        val state = _uiState.value
        val playerSetsWon = state.playerScore.sets.zip(state.opponentScore.sets).count { (p, o) -> p > o }
        val opponentSetsWon = state.playerScore.sets.zip(state.opponentScore.sets).count { (p, o) -> o > p }
        val result = if (playerSetsWon >= opponentSetsWon) MatchResult.WIN else MatchResult.LOSS
        // 実データのポイント履歴から統計を集計
        val stats = computeStatsFromPoints(state)
        val moments = listOf(KeyMoment("最重要ポイント：${state.playerScore.games}-${state.opponentScore.games}の局面", 0L, 0.9f, result == MatchResult.WIN))
        val setsStr = state.playerScore.sets.zip(state.opponentScore.sets).joinToString(" ") { (p, o) -> "$p-$o" }

        // ポイント分析スナップショットをシリアライズ可能な形に変換して保存
        val serializableSnapshots = state.pointAnalyses.map {
            SerializablePointSnapshot(
                pointIndex = it.pointIndex,
                timestampMs = it.timestampMs,
                gameScore = it.gameScore,
                pointScore = it.pointScore,
                winnerIsPlayer = it.winnerIsPlayer,
                phaseAtPointName = it.phaseAtPoint.name,
                adviceTitle = it.advice?.title,
                adviceBody = it.advice?.body,
                adviceCategory = it.advice?.category?.name,
                impactHeightCm = it.poseMetricsSnapshot?.impactHeightCm,
                swingSpeedKmh = it.poseMetricsSnapshot?.swingSpeedKmh,
                kneeAngleDeg = it.poseMetricsSnapshot?.kneeAngleDeg,
                landingsCount = it.landingsSinceLastPoint.size,
            )
        }
        val report = MatchReport(
            matchId = state.matchId, playerId = state.playerProfile?.id ?: 0L,
            matchType = state.matchType, durationMinutes = (state.elapsedSeconds / 60).toInt(),
            result = result, finalScore = setsStr.ifBlank { "${state.playerScore.games}-${state.opponentScore.games}" },
            summaryThreeLines = "試合データを分析中...",
            keyMomentsJson = json.encodeToString(moments),
            statsJson = json.encodeToString(stats),
            pointAnalysesJson = json.encodeToString(serializableSnapshots),
        )
        geminiNanoManager.generateMatchReport(
            MatchState(matchId = state.matchId, matchType = state.matchType, playerScore = state.playerScore, opponentScore = state.opponentScore),
            state.playerProfile ?: PlayerProfile(), moments, stats
        ).collect { summary -> matchRepository.saveReport(report.copy(summaryThreeLines = summary)) }
        return state.matchId
    }

    override fun onCleared() {
        super.onCleared()
        habitDetector.reset()
        ballTracker.reset()
    }
}
