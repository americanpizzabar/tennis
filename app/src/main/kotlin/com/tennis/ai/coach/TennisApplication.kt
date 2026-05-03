package com.tennis.ai.coach

import android.app.Application
import dagger.hilt.android.HiltAndroidApp

@HiltAndroidApp
class TennisApplication : Application() {
    override fun onCreate() {
        super.onCreate()
    }
}
