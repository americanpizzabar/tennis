package com.tennis.ai.coach.data.local.dao

import androidx.room.*
import com.tennis.ai.coach.data.model.PlayerProfile
import kotlinx.coroutines.flow.Flow

@Dao
interface PlayerProfileDao {
    @Query("SELECT * FROM player_profiles WHERE isActive = 1 ORDER BY createdAt DESC")
    fun getAllProfiles(): Flow<List<PlayerProfile>>

    @Query("SELECT * FROM player_profiles WHERE id = :id")
    suspend fun getProfileById(id: Long): PlayerProfile?

    @Query("SELECT * FROM player_profiles WHERE isActive = 1 LIMIT 1")
    suspend fun getActiveProfile(): PlayerProfile?

    @Query("SELECT * FROM player_profiles WHERE isActive = 1 LIMIT 1")
    fun getActiveProfileFlow(): Flow<PlayerProfile?>

    @Upsert
    suspend fun upsertProfile(profile: PlayerProfile): Long

    @Query("UPDATE player_profiles SET isActive = 0")
    suspend fun deactivateAll()

    @Query("UPDATE player_profiles SET isActive = 1 WHERE id = :id")
    suspend fun activateProfile(id: Long)

    @Delete
    suspend fun deleteProfile(profile: PlayerProfile)
}
