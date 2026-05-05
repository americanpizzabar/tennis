package com.tennis.ai.coach.data.repository

import com.tennis.ai.coach.data.local.dao.MatchReportDao
import com.tennis.ai.coach.data.model.MatchReport
import kotlinx.coroutines.flow.Flow
import java.io.File
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class MatchRepository @Inject constructor(
    private val dao: MatchReportDao
) {
    fun getRecentReports(limit: Int = 10): Flow<List<MatchReport>> =
        dao.getRecentReports(limit)

    fun getReportsByPlayer(playerId: Long): Flow<List<MatchReport>> =
        dao.getReportsByPlayer(playerId)

    suspend fun getReportById(matchId: String): MatchReport? =
        dao.getReportById(matchId)

    suspend fun saveReport(report: MatchReport) = dao.upsertReport(report)

    suspend fun deleteReport(report: MatchReport) {
        // 関連動画ファイルもベストエフォートで削除
        report.videoPath?.let { path ->
            runCatching { File(path).takeIf { it.exists() }?.delete() }
        }
        dao.deleteReport(report)
    }

    suspend fun deleteReportById(matchId: String) {
        getReportById(matchId)?.let { deleteReport(it) }
    }
}
