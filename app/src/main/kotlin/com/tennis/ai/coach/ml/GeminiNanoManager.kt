package com.tennis.ai.coach.ml

import android.content.Context
import com.google.mediapipe.tasks.genai.llminference.LlmInference
import com.tennis.ai.coach.data.model.*
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.withContext
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
/**
 * Gemini Nano (on-device) で戦術アドバイスを生成する。
 * モデルが未ダウンロードの場合はルールベースのフォールバックを返す。
 */
class GeminiNanoManager(
    @ApplicationContext private val context: Context
) {
    private var llmInference: LlmInference? = null
    private val json = Json { ignoreUnknownKeys = true }

    // モデルは assets/gemini-nano.bin または外部ストレージに配置する前提
    private val modelPath = "${context.filesDir}/gemini_nano_tennis.bin"

    fun isModelAvailable(): Boolean = java.io.File(modelPath).exists()

    suspend fun initialize() = withContext(Dispatchers.IO) {
        if (!isModelAvailable()) return@withContext
        runCatching {
            val options = LlmInference.LlmInferenceOptions.builder()
                .setModelPath(modelPath)
                .setMaxTokens(512)
                .build()
            llmInference = LlmInference.createFromOptions(context, options)
        }
    }

    fun generateTacticalAdvice(
        matchState: MatchState,
        playerProfile: PlayerProfile,
        opponentProfile: OpponentProfile,
        poseMetrics: PoseMetrics?
    ): Flow<TacticalAdvice> = flow {
        val inference = llmInference
        if (inference == null) {
            // フォールバック：ルールベースのアドバイス
            emit(generateRuleBasedAdvice(matchState, playerProfile, opponentProfile, poseMetrics))
            return@flow
        }

        val prompt = buildTacticalPrompt(matchState, playerProfile, opponentProfile, poseMetrics)
        val result = withContext(Dispatchers.Default) {
            inference.generateResponse(prompt)
        }
        val advice = parseAdviceFromResponse(result, matchState)
        emit(advice)
    }

    fun analyzeVideoForAdvice(
        videoDescription: String,
        playerProfile: PlayerProfile
    ): Flow<TacticalAdvice> = flow {
        val inference = llmInference
        if (inference == null) {
            emit(generateVideoFallbackAdvice(videoDescription, playerProfile))
            return@flow
        }

        val prompt = buildVideoAnalysisPrompt(videoDescription, playerProfile)
        val result = withContext(Dispatchers.Default) {
            inference.generateResponse(prompt)
        }
        emit(parseAdviceFromResponse(result, null))
    }

    fun generateMatchReport(
        matchState: MatchState,
        playerProfile: PlayerProfile,
        keyMoments: List<KeyMoment>,
        stats: MatchStats
    ): Flow<String> = flow {
        val inference = llmInference
        val prompt = buildMatchReportPrompt(matchState, playerProfile, keyMoments, stats)

        if (inference == null) {
            emit(generateRuleBasedReport(matchState, stats))
            return@flow
        }

        val result = withContext(Dispatchers.Default) {
            inference.generateResponse(prompt)
        }
        emit(result)
    }

    private fun buildTacticalPrompt(
        matchState: MatchState,
        player: PlayerProfile,
        opponent: OpponentProfile,
        pose: PoseMetrics?
    ): String = buildString {
        appendLine("あなたはプロのテニスコーチです。以下の試合状況を分析し、日本語で簡潔なアドバイスを1つ生成してください。")
        appendLine()
        appendLine("【プレイヤー情報】")
        appendLine("レベル: ${player.level.displayNameJa}")
        appendLine("性別: ${player.gender.displayNameJa}")
        appendLine("利き手: ${player.dominantHand.displayNameJa}")
        appendLine()
        appendLine("【試合状況】")
        appendLine("種目: ${matchState.matchType.displayNameJa}")
        appendLine("フェーズ: ${matchState.phase.displayNameJa}")
        appendLine("スコア: ${matchState.playerScore.games}-${matchState.opponentScore.games}")
        appendLine("サーブ: ${if (matchState.servingPlayer == ServingPlayer.PLAYER) "自分" else "相手"}")
        appendLine()
        appendLine("【相手の癖】")
        opponent.detectedHabits.forEach { habit ->
            appendLine("- ${habit.description} (確信度: ${(habit.confidence * 100).toInt()}%)")
        }
        pose?.let {
            appendLine()
            appendLine("【現在のフォーム】")
            appendLine("スイング速度: ${it.swingSpeedKmh}km/h")
            appendLine("打点高さ: ${it.impactHeightCm}cm")
        }
        appendLine()
        appendLine("アドバイス（50文字以内）:")
    }

    private fun buildVideoAnalysisPrompt(description: String, player: PlayerProfile): String =
        buildString {
            appendLine("テニス動画を分析してください。")
            appendLine("プレイヤーレベル: ${player.level.displayNameJa}")
            appendLine("観察内容: $description")
            appendLine("改善点と具体的な練習方法を日本語で50文字以内で:")
        }

    private fun buildMatchReportPrompt(
        state: MatchState,
        player: PlayerProfile,
        moments: List<KeyMoment>,
        stats: MatchStats
    ): String = buildString {
        appendLine("試合終了後のレポートを3行で日本語生成してください。")
        appendLine("プレイヤー: ${player.level.displayNameJa} / ${player.gender.displayNameJa}")
        appendLine("結果スコア: ${state.playerScore.games}-${state.opponentScore.games}")
        appendLine("ウィナー: ${stats.winnerCount}, エラー: ${stats.unforeEdErrorCount}")
        appendLine("1stサーブ率: ${stats.firstServePercent}%")
        appendLine("3行まとめ（勝因or敗因、最重要ポイント、次回練習メニュー）:")
    }

    private fun parseAdviceFromResponse(response: String, matchState: MatchState?): TacticalAdvice {
        val category = when {
            response.contains("サーブ") -> AdviceCategory.SERVE_PLACEMENT
            response.contains("陣形") || response.contains("フォーメーション") -> AdviceCategory.DOUBLES_POSITIONING
            response.contains("フォーム") || response.contains("打点") -> AdviceCategory.TECHNIQUE
            response.contains("相手") -> AdviceCategory.OPPONENT_WEAKNESS
            else -> AdviceCategory.SERVE_PLACEMENT
        }
        return TacticalAdvice(
            title = if (matchState?.phase == MatchPhase.CHANGEOVER) "チェンジオーバーアドバイス" else "戦術アドバイス",
            body = response.trim().take(200),
            urgency = if (matchState?.phase == MatchPhase.MATCH_POINT) AdviceUrgency.IMMEDIATE else AdviceUrgency.NORMAL,
            category = category,
            confidence = 0.85f
        )
    }

    // ────────── Rule-based fallbacks ──────────

    private fun generateRuleBasedAdvice(
        state: MatchState,
        player: PlayerProfile,
        opponent: OpponentProfile,
        pose: PoseMetrics?
    ): TacticalAdvice {
        // 打点低下検知
        if (pose != null && pose.impactHeightCm < 80f) {
            return TacticalAdvice(
                title = "フォーム警告",
                body = "打点が${80 - pose.impactHeightCm.toInt()}cm下がっています。足を一歩踏み込んで！",
                urgency = AdviceUrgency.IMMEDIATE,
                category = AdviceCategory.TECHNIQUE,
                confidence = 0.9f
            )
        }

        // デュース/マッチポイントの配球提案
        if (state.phase == MatchPhase.MATCH_POINT || state.isDeuce) {
            val targetZone = if (opponent.dominantHand == DominantHand.RIGHT) {
                CourtZone.AD_BASELINE  // バックハンド側
            } else {
                CourtZone.DEUCE_BASELINE
            }
            return TacticalAdvice(
                title = "勝負の一手",
                body = "相手バックハンド側（${targetZone.displayNameJa}）へのスライスで崩す！",
                urgency = AdviceUrgency.IMMEDIATE,
                category = AdviceCategory.SERVE_PLACEMENT,
                servePlacementImage = ServePlacementPattern(
                    targetZone = targetZone,
                    ballType = BallType.SLICE,
                    speedRecommendation = SpeedLevel.MEDIUM,
                    successRatePercent = 72,
                    description = "相手のバックハンド側を突いてネットへ詰める"
                ),
                confidence = 0.78f
            )
        }

        // 相手の癖に基づくアドバイス
        val mostConfidentHabit = opponent.detectedHabits.maxByOrNull { it.confidence }
        if (mostConfidentHabit != null) {
            return TacticalAdvice(
                title = "相手の弱点を突け",
                body = mostConfidentHabit.description,
                urgency = AdviceUrgency.NORMAL,
                category = AdviceCategory.OPPONENT_WEAKNESS,
                confidence = mostConfidentHabit.confidence
            )
        }

        // レベル別デフォルトアドバイス
        return getDefaultAdviceForLevel(player.level, state.matchType)
    }

    private fun getDefaultAdviceForLevel(level: PlayerLevel, matchType: MatchType): TacticalAdvice {
        val body = when (level) {
            PlayerLevel.BEGINNER -> "まずミスをしない！深いボールでラリーを続ける"
            PlayerLevel.INTERMEDIATE -> "クロスラリーから相手を動かしてオープンコートへ"
            PlayerLevel.ADVANCED_INTERMEDIATE -> "サーブ＆ボレーで主導権を握る"
            PlayerLevel.ADVANCED -> "ファーストサーブの確率を上げてプレッシャーをかける"
            PlayerLevel.COMPETITIVE -> "相手の動きを先読みし、ポジショニングを最適化"
        }
        val doublesExtra = if (matchType == MatchType.DOUBLES) "　前衛のポジションを意識！" else ""
        return TacticalAdvice(
            title = "基本戦術",
            body = body + doublesExtra,
            urgency = AdviceUrgency.CHANGEOVER,
            category = AdviceCategory.SERVE_PLACEMENT,
            confidence = 0.7f
        )
    }

    private fun generateVideoFallbackAdvice(description: String, player: PlayerProfile): TacticalAdvice {
        val levelTip = when (player.level) {
            PlayerLevel.BEGINNER -> "まずは基本フォームの反復練習を優先しましょう。"
            PlayerLevel.INTERMEDIATE -> "安定性を意識しながら、積極的なショットを増やしましょう。"
            PlayerLevel.ADVANCED_INTERMEDIATE -> "戦術的な配球パターンを試合で実践しましょう。"
            PlayerLevel.ADVANCED -> "試合中の判断スピードと精度向上に集中しましょう。"
            PlayerLevel.COMPETITIVE -> "相手の動きを先読みした高度な戦術を磨きましょう。"
        }
        val (title, body, category) = when {
            description.contains("フォーム") || description.contains("打点") -> Triple(
                "フォーム分析",
                "打点の高さが安定していません。ボールをインパクトする瞬間に膝を曲げて重心を低く保ち、スイングのフォロースルーをしっかり振り切ることで、スピンとパワーが大幅に向上します。$levelTip",
                AdviceCategory.TECHNIQUE
            )
            description.contains("戦術") || description.contains("配球") -> Triple(
                "戦術・配球分析",
                "配球が単調になっています。相手のバックハンド側へのクロスを軸に、時折ストレートへの展開を混ぜることで相手のポジションを崩せます。サーブ後のファーストボールで主導権を握る意識を高めましょう。$levelTip",
                AdviceCategory.OPPONENT_WEAKNESS
            )
            description.contains("フットワーク") || description.contains("体力") -> Triple(
                "フットワーク分析",
                "ポイント間のリカバリーポジションへ戻る速度が遅くなっています。相手がボールを打つ瞬間にスプリットステップを踏む習慣をつけ、常にセンターマークに戻る意識を持つことで守備範囲が広がります。$levelTip",
                AdviceCategory.TECHNIQUE
            )
            else -> Triple(
                "動画分析結果",
                "全体的なプレーを分析しました。フォームの安定性と戦術的な配球の両面で改善の余地があります。特にラリー中のポジショニングを意識して練習に取り組みましょう。$levelTip",
                AdviceCategory.TECHNIQUE
            )
        }
        return TacticalAdvice(
            title = title,
            body = body,
            urgency = AdviceUrgency.CHANGEOVER,
            category = category,
            confidence = 0.65f
        )
    }

    private fun generateRuleBasedReport(state: MatchState, stats: MatchStats): String {
        val winLoss = if (state.playerScore.games > state.opponentScore.games) "勝利" else "惜敗"
        return buildString {
            appendLine("① $winLoss の要因は1stサーブ率${stats.firstServePercent}%と${if (stats.winnerCount > stats.unforeEdErrorCount) "積極的な攻め" else "アンフォースドエラーの多さ"}です。")
            appendLine("② ウィナー${stats.winnerCount}本・エラー${stats.unforeEdErrorCount}本。ネットプレーは${stats.netPointsWonPercent}%の成功率でした。")
            appendLine("③ 次回練習メニュー：${if (stats.firstServePercent < 60) "サーブ精度向上" else "バックハンドのコントロール"}を重点的に。")
        }
    }

    fun release() {
        llmInference?.close()
        llmInference = null
    }
}
