package com.tennis.ai.coach.data.repository

import android.content.Context
import com.tennis.ai.coach.data.local.dao.PlayerProfileDao
import com.tennis.ai.coach.data.model.PlayerProfile
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.Flow
import java.io.File
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class ProfileRepository @Inject constructor(
    private val dao: PlayerProfileDao,
    @ApplicationContext private val context: Context,
) {

    /** 試合動画の保存先ディレクトリ（必要なら作成）。 */
    fun getMatchVideoDir(): File {
        val dir = File(context.filesDir, "match_videos")
        if (!dir.exists()) dir.mkdirs()
        return dir
    }

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
