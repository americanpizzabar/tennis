package com.tennis.ai.coach.data.model

import androidx.room.Entity
import androidx.room.PrimaryKey
import kotlinx.serialization.Serializable

enum class PlayerLevel(val displayName: String, val displayNameJa: String) {
    BEGINNER("Beginner", "初級"),
    INTERMEDIATE("Intermediate", "中級"),
    ADVANCED_INTERMEDIATE("Advanced Intermediate", "中上級"),
    ADVANCED("Advanced", "上級"),
    COMPETITIVE("Competitive", "競技");
}

enum class Gender(val displayNameJa: String) {
    MALE("男性"),
    FEMALE("女性"),
    OTHER("その他");
}

enum class DominantHand(val displayNameJa: String) {
    RIGHT("右利き"),
    LEFT("左利き");
}

enum class MatchType(val displayNameJa: String) {
    SINGLES("シングルス"),
    DOUBLES("ダブルス");
}

@Entity(tableName = "player_profiles")
@Serializable
data class PlayerProfile(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val name: String = "",
    val level: PlayerLevel = PlayerLevel.INTERMEDIATE,
    val gender: Gender = Gender.MALE,
    val dominantHand: DominantHand = DominantHand.RIGHT,
    val isActive: Boolean = true,
    val createdAt: Long = System.currentTimeMillis()
)

@Serializable
data class OpponentProfile(
    val id: Long = 0,
    val name: String = "相手選手",
    val estimatedLevel: PlayerLevel = PlayerLevel.INTERMEDIATE,
    val dominantHand: DominantHand = DominantHand.RIGHT,
    val detectedHabits: List<OpponentHabit> = emptyList()
)

/**
 * ダブルス時のパートナー情報。
 */
@Serializable
data class PartnerProfile(
    val name: String = "パートナー",
    val estimatedLevel: PlayerLevel = PlayerLevel.INTERMEDIATE,
    val dominantHand: DominantHand = DominantHand.RIGHT,
)

@Serializable
data class OpponentHabit(
    val id: String,
    val description: String,
    val confidence: Float,
    val category: HabitCategory,
    val detectedAt: Long = System.currentTimeMillis()
)

enum class HabitCategory(val displayNameJa: String) {
    BACKHAND("バックハンド"),
    SERVE("サーブ"),
    FOREHAND("フォアハンド"),
    VOLLEY("ボレー"),
    MOVEMENT("フットワーク"),
    RETURN("リターン");
}
