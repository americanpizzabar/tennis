package com.tennis.ai.coach.data.tactics

/**
 * プロレベルの戦術カード。
 *
 * @param triggers       推奨される状況タグ（一致が多いほどスコアが上がる）
 * @param antiTriggers   この戦術を避けるべき状況（マッチすると減点）
 * @param baseConfidence 0.0–1.0 のベース信頼度（プロでも100%ではない）
 */
data class ProTactic(
    val id: String,
    val title: String,
    val emoji: String,
    val category: TacticCategory,
    val shortDesc: String,
    val proReference: String,
    val executionSteps: List<String>,
    val whenToUse: String,
    val whenNotToUse: String,
    val triggers: Set<SituationTag>,
    val antiTriggers: Set<SituationTag> = emptySet(),
    val baseConfidence: Float = 0.7f,
)

enum class TacticCategory(val displayNameJa: String) {
    SERVE("サーブ戦術"),
    RETURN("リターン戦術"),
    BASELINE("ベースライン戦術"),
    NET("ネットプレー"),
    DEFENSIVE("守備"),
    MENTAL("メンタル"),
    DOUBLES("ダブルス専用"),
    PATTERN("ラリーパターン"),
}
