package com.tennis.ai.coach.data.local

import androidx.room.Database
import androidx.room.RoomDatabase
import com.tennis.ai.coach.data.local.dao.LessonReportDao
import com.tennis.ai.coach.data.local.dao.MatchReportDao
import com.tennis.ai.coach.data.local.dao.PlayerProfileDao
import com.tennis.ai.coach.data.model.LessonReport
import com.tennis.ai.coach.data.model.MatchReport
import com.tennis.ai.coach.data.model.PlayerProfile

@Database(
    entities = [PlayerProfile::class, MatchReport::class, LessonReport::class],
    version = 4,
    exportSchema = false
)
abstract class TennisDatabase : RoomDatabase() {
    abstract fun playerProfileDao(): PlayerProfileDao
    abstract fun matchReportDao(): MatchReportDao
    abstract fun lessonReportDao(): LessonReportDao
}
