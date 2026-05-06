package com.tennis.ai.coach.data.repository

import android.content.Context
import com.tennis.ai.coach.data.local.dao.LessonReportDao
import com.tennis.ai.coach.data.model.LessonReport
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.Flow
import java.io.File
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class LessonRepository @Inject constructor(
    private val dao: LessonReportDao,
    @ApplicationContext private val context: Context,
) {
    fun getRecentLessons(limit: Int = 30): Flow<List<LessonReport>> = dao.getRecent(limit)

    suspend fun getById(id: String): LessonReport? = dao.getById(id)

    suspend fun save(report: LessonReport) = dao.upsert(report)

    suspend fun delete(report: LessonReport) {
        report.videoPath?.let { runCatching { File(it).takeIf { f -> f.exists() }?.delete() } }
        dao.delete(report)
    }

    /** レッスン動画の保存ディレクトリ。 */
    fun getLessonVideoDir(): File {
        val dir = File(context.filesDir, "lesson_videos")
        if (!dir.exists()) dir.mkdirs()
        return dir
    }
}
