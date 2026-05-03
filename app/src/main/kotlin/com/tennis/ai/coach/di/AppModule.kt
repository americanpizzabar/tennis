package com.tennis.ai.coach.di

import android.content.Context
import com.tennis.ai.coach.ml.GeminiNanoManager
import com.tennis.ai.coach.ml.PoseAnalyzer
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object AppModule {

    @Provides
    @Singleton
    fun provideJson(): Json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
        isLenient = true
    }

    @Provides
    @Singleton
    fun provideApplicationScope(): CoroutineScope =
        CoroutineScope(SupervisorJob() + Dispatchers.Default)

    @Provides
    @Singleton
    fun provideGeminiNanoManager(
        @ApplicationContext context: Context,
        scope: CoroutineScope
    ): GeminiNanoManager {
        val manager = GeminiNanoManager(context)
        scope.launch { manager.initialize() }
        return manager
    }

    @Provides
    @Singleton
    fun providePoseAnalyzer(
        @ApplicationContext context: Context,
        scope: CoroutineScope
    ): PoseAnalyzer {
        val analyzer = PoseAnalyzer(context)
        scope.launch { analyzer.initialize() }
        return analyzer
    }
}
