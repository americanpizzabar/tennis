package com.tennis.ai.coach.service

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.os.IBinder
import androidx.core.app.NotificationCompat
import dagger.hilt.android.AndroidEntryPoint
import javax.inject.Inject

/**
 * 試合中のリアルタイム解析をバックグラウンドで継続するフォアグラウンドサービス。
 * カメラ解析はViewModelで行うが、このサービスが起動している間は
 * アプリがバックグラウンドになってもプロセスを維持する。
 */
@AndroidEntryPoint
class MatchAnalysisService : Service() {

    @Inject
    lateinit var wearService: WearDataLayerService

    companion object {
        private const val CHANNEL_ID = "tennis_analysis"
        const val ACTION_START = "com.tennis.ai.coach.START_ANALYSIS"
        const val ACTION_STOP = "com.tennis.ai.coach.STOP_ANALYSIS"
    }

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START -> startForeground(1, buildNotification())
            ACTION_STOP -> stopForeground(STOP_FOREGROUND_REMOVE).also { stopSelf() }
        }
        return START_STICKY
    }

    private fun buildNotification(): Notification =
        NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Tennis AI Coach")
            .setContentText("試合を解析中…")
            .setSmallIcon(android.R.drawable.ic_media_play)
            .setOngoing(true)
            .build()

    private fun createNotificationChannel() {
        val channel = NotificationChannel(
            CHANNEL_ID,
            "試合解析",
            NotificationManager.IMPORTANCE_LOW
        ).apply { description = "リアルタイム試合解析の通知" }
        getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }

    override fun onBind(intent: Intent?): IBinder? = null
}
