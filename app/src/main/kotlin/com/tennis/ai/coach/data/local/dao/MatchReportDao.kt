package com.tennis.ai.coach.data.local.dao

import androidx.room.*
import com.tennis.ai.coach.data.model.MatchReport
import kotlinx.coroutines.flow.Flow

@Dao
interface MatchReportDao {
    @Query("SELECT * FROM match_reports WHERE playerId = :playerId ORDER BY createdAt DESC")
    fun getReportsByPlayer(playerId: Long): Flow<List<MatchReport>>

    @Query("SELECT * FROM match_reports WHERE matchId = :matchId")
    suspend fun getReportById(matchId: String): MatchReport?

    @Query("SELECT * FROM match_reports ORDER BY createdAt DESC LIMIT :limit")
    fun getRecentReports(limit: Int = 10): Flow<List<MatchReport>>

    @Upsert
    suspend fun upsertReport(report: MatchReport)

    @Delete
    suspend fun deleteReport(report: MatchReport)

    @Query("DELETE FROM match_reports WHERE createdAt < :cutoffTime")
    suspend fun deleteOldReports(cutoffTime: Long)
}
