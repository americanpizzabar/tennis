package com.tennis.ai.coach.data.local.dao

import androidx.room.*
import com.tennis.ai.coach.data.model.LessonReport
import kotlinx.coroutines.flow.Flow

@Dao
interface LessonReportDao {
    @Query("SELECT * FROM lesson_reports WHERE lessonId = :id")
    suspend fun getById(id: String): LessonReport?

    @Query("SELECT * FROM lesson_reports ORDER BY createdAt DESC LIMIT :limit")
    fun getRecent(limit: Int = 30): Flow<List<LessonReport>>

    @Upsert
    suspend fun upsert(report: LessonReport)

    @Delete
    suspend fun delete(report: LessonReport)
}
