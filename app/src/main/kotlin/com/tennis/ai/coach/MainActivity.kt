package com.tennis.ai.coach

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import com.tennis.ai.coach.ui.navigation.TennisNavHost
import com.tennis.ai.coach.ui.theme.TennisAITheme
import dagger.hilt.android.AndroidEntryPoint

@AndroidEntryPoint
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            TennisAITheme {
                TennisNavHost()
            }
        }
    }
}
