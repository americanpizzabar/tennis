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
    val showSetupDialog: Boolean = true,
    val opponentName: String = "相手選手",
    val opponentLevel: PlayerLevel = PlayerLevel.INTERMEDIATE,
    val partnerName: String = "パートナー",
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

    fun setupMatch(opponentName: String, opponentLevel: PlayerLevel, partnerName: String = "") {
        val oName = opponentName.ifBlank { "相手選手" }
        val pName = partnerName.ifBlank { "パートナー" }
        _uiState.update { state ->
            state.copy(
                showSetupDialog = false,
                opponentName = oName,
                opponentLevel = opponentLevel,
                partnerName = pName,
                opponentProfile = state.opponentProfile.copy(
                    name = oName,
                    estimatedLevel = opponentLevel
                )
            )
        }
        startTimer()
        requestAdvice()
    }

    // ── カメラ ────────────────────────────────────────────────

    fun startCamera(lifecycleOwner: LifecycleOwner, previewView: PreviewView) {
        viewModelScope.launch {
            val success = runCatching {
                cameraManager.startCamera(lifecycleOwner, previewView)
            }.getOrDefault(false)
            if (success) _uiState.update { it.copy(isCameraActive = true) }
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

    fun playerScorePoint() = updateScore(isPlayer = true)
    fun opponentScorePoint() = updateScore(isPlayer = false)

    private fun updateScore(isPlayer: Boolean) {
        _uiState.update { state ->
            val newState = advanceScore(state, isPlayer)
            val needsChangeover = checkChangeover(newState)
            if (needsChangeover) startChangeover(newState)
            newState.copy(isChangeover = needsChangeover)
        }
        requestAdvice()
    }

    private fun advanceScore(state: MatchUiState, isPlayer: Boolean): MatchUiState {
        val pPts = state.playerScore.points
        val oPts = state.opponentScore.points

        if (pPts == TennisPoint.FORTY && oPts == TennisPoint.FORTY) {
            return if (isPlayer)
                state.copy(playerScore = state.playerScore.copy(points = TennisPoint.ADVANTAGE), phase = MatchPhase.BREAK_POINT)
            else
                state.copy(opponentScore = state.opponentScore.copy(points = TennisPoint.ADVANTAGE))
        }
        if (pPts == TennisPoint.ADVANTAGE) {
            return if (isPlayer) wonGame(state, true)
            else state.copy(
                playerScore = state.playerScore.copy(points = TennisPoint.FORTY),
                opponentScore = state.opponentScore.copy(points = TennisPoint.FORTY),
                phase = MatchPhase.POINT
            )
        }
        if (oPts == TennisPoint.ADVANTAGE) {
            return if (!isPlayer) wonGame(state, false)
            else state.copy(
                playerScore = state.playerScore.copy(points = TennisPoint.FORTY),
                opponentScore = state.opponentScore.copy(points = TennisPoint.FORTY),
                phase = MatchPhase.POINT
            )
        }
        if (isPlayer && pPts == TennisPoint.THIRTY) {
            return if (oPts == TennisPoint.FORTY)
                state.copy(playerScore = state.playerScore.copy(points = TennisPoint.FORTY), phase = MatchPhase.BREAK_POINT)
            else
                state.copy(playerScore = state.playerScore.copy(points = TennisPoint.FORTY),
                    phase = if (oPts.ordinal <= TennisPoint.THIRTY.ordinal) MatchPhase.GAME_POINT else MatchPhase.POINT)
        }
        if (!isPlayer && oPts == TennisPoint.THIRTY) {
            return if (pPts == TennisPoint.FORTY)
                state.copy(opponentScore = state.opponentScore.copy(points = TennisPoint.FORTY), phase = MatchPhase.BREAK_POINT)
            else
                state.copy(opponentScore = state.opponentScore.copy(points = TennisPoint.FORTY))
        }
        val next = { pts: TennisPoint ->
            when (pts) {
                TennisPoint.ZERO -> TennisPoint.FIFTEEN
                TennisPoint.FIFTEEN -> TennisPoint.THIRTY
                else -> TennisPoint.FORTY
            }
        }
        return if (isPlayer)
            state.copy(playerScore = state.playerScore.copy(points = next(pPts)))
        else
            state.copy(opponentScore = state.opponentScore.copy(points = next(oPts)))
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
                phase = MatchPhase.POINT, servingPlayer = newServer
            )
        } else {
            state.copy(
                playerScore = state.playerScore.copy(games = pGames, points = TennisPoint.ZERO),
                opponentScore = state.opponentScore.copy(games = oGames, points = TennisPoint.ZERO),
                phase = MatchPhase.POINT, servingPlayer = newServer
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
                    if (isDoubles) appendLine("前衛の${state.partnerName}と役割分担を確認。センターはパートナーに任せる。")
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
                        appendLine("前衛の${state.partnerName}がポーチに出るフリをしつつ、ロブで役割交代する「ダミーポーチ＋ロブ」が有効。")
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
                shortDesc = "${state.partnerName}との連携を再確認",
                detailedExplanation = buildString {
                    appendLine("【${state.partnerName}との連携確認】")
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
        if (_uiState.value.showSetupDialog) return
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
        val state = _uiState.value
        val playerSetsWon = state.playerScore.sets.zip(state.opponentScore.sets).count { (p, o) -> p > o }
        val opponentSetsWon = state.playerScore.sets.zip(state.opponentScore.sets).count { (p, o) -> o > p }
        val result = if (playerSetsWon >= opponentSetsWon) MatchResult.WIN else MatchResult.LOSS
        val stats = MatchStats(
            winnerCount = (5..20).random(), unforeEdErrorCount = (3..15).random(),
            firstServePercent = (45..75).random(), netPointsWonPercent = (40..70).random(),
            averageRallyLength = 3f + (Math.random() * 5f).toFloat()
        )
        val moments = listOf(KeyMoment("最重要ポイント：${state.playerScore.games}-${state.opponentScore.games}の局面", 0L, 0.9f, result == MatchResult.WIN))
        val setsStr = state.playerScore.sets.zip(state.opponentScore.sets).joinToString(" ") { (p, o) -> "$p-$o" }
        val report = MatchReport(
            matchId = state.matchId, playerId = state.playerProfile?.id ?: 0L,
            matchType = state.matchType, durationMinutes = (state.elapsedSeconds / 60).toInt(),
            result = result, finalScore = setsStr.ifBlank { "${state.playerScore.games}-${state.opponentScore.games}" },
            summaryThreeLines = "試合データを分析中...",
            keyMomentsJson = json.encodeToString(moments), statsJson = json.encodeToString(stats)
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
