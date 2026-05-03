package com.tennis.ai.coach.data.repository

import com.tennis.ai.coach.data.local.dao.PlayerProfileDao
import com.tennis.ai.coach.data.model.PlayerProfile
import kotlinx.coroutines.flow.Flow
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class ProfileRepository @Inject constructor(
    private val dao: PlayerProfileDao
) {
    fun getAllProfiles(): Flow<List<PlayerProfile>> = dao.getAllProfiles()

    fun getActiveProfileFlow(): Flow<PlayerProfile?> = dao.getActiveProfileFlow()

    suspend fun getActiveProfile(): PlayerProfile? = dao.getActiveProfile()

    suspend fun saveProfile(profile: PlayerProfile): Long {
        return dao.upsertProfile(profile)
    }

    suspend fun setActiveProfile(profileId: Long) {
        dao.deactivateAll()
        dao.activateProfile(profileId)
    }

    suspend fun deleteProfile(profile: PlayerProfile) = dao.deleteProfile(profile)
}
