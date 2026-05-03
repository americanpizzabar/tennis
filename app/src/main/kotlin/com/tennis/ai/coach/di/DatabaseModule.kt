package com.tennis.ai.coach.di

import android.content.Context
import androidx.room.Room
import com.tennis.ai.coach.data.local.TennisDatabase
import com.tennis.ai.coach.data.local.dao.MatchReportDao
import com.tennis.ai.coach.data.local.dao.PlayerProfileDao
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object DatabaseModule {

    @Provides
    @Singleton
    fun provideDatabase(@ApplicationContext context: Context): TennisDatabase =
        Room.databaseBuilder(context, TennisDatabase::class.java, "tennis_ai.db")
            .fallbackToDestructiveMigration()
            .build()

    @Provides
    fun providePlayerProfileDao(db: TennisDatabase): PlayerProfileDao = db.playerProfileDao()

    @Provides
    fun provideMatchReportDao(db: TennisDatabase): MatchReportDao = db.matchReportDao()
}
