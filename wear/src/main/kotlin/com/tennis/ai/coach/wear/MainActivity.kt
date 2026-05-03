package com.tennis.ai.coach.wear

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.wear.compose.material.*
import dagger.hilt.android.AndroidEntryPoint

@AndroidEntryPoint
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent { WearTennisApp() }
    }
}

@Composable
fun WearTennisApp() {
    var advice by remember { mutableStateOf(WearAdviceRepository.getAdvice()) }
    var alert by remember { mutableStateOf(WearAdviceRepository.getAlert()) }
    var score by remember { mutableStateOf(WearAdviceRepository.getScore()) }

    DisposableEffect(Unit) {
        val listener = {
            advice = WearAdviceRepository.getAdvice()
            alert = WearAdviceRepository.getAlert()
            score = WearAdviceRepository.getScore()
        }
        WearAdviceRepository.addListener(listener)
        onDispose { WearAdviceRepository.removeListener(listener) }
    }

    MaterialTheme {
        ScalingLazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .background(Color(0xFF0A1A0A)),
            horizontalAlignment = Alignment.CenterHorizontally,
            contentPadding = PaddingValues(vertical = 16.dp)
        ) {
            // スコア
            item {
                Text(
                    score,
                    color = Color.White,
                    fontSize = 24.sp,
                    fontWeight = FontWeight.Black,
                    textAlign = TextAlign.Center
                )
            }

            // 緊急アラート
            alert?.let { a ->
                item {
                    Chip(
                        onClick = {},
                        modifier = Modifier.fillMaxWidth(0.9f),
                        colors = ChipDefaults.chipColors(backgroundColor = Color(0xFFB71C1C)),
                        label = {
                            Text(
                                "${a.emoji} ${a.title}",
                                color = Color.White,
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Bold
                            )
                        },
                        secondaryLabel = {
                            Text(a.body, color = Color.White.copy(alpha = 0.8f), fontSize = 10.sp,
                                maxLines = 2)
                        }
                    )
                }
            }

            // アドバイスカード
            item {
                if (advice != null) {
                    val a = advice!!
                    Card(
                        onClick = {},
                        modifier = Modifier.fillMaxWidth(0.9f),
                        backgroundPainter = CardDefaults.cardBackgroundPainter(
                            startBackgroundColor = Color(0xFF1A2E1A),
                            endBackgroundColor = Color(0xFF0D1F0D)
                        )
                    ) {
                        Column(modifier = Modifier.padding(8.dp)) {
                            Text(
                                "${a.emoji} ${a.title}",
                                color = Color(0xFFF9A825),
                                fontSize = 12.sp,
                                fontWeight = FontWeight.Bold
                            )
                            Spacer(Modifier.height(4.dp))
                            Text(
                                a.body,
                                color = Color.White,
                                fontSize = 11.sp,
                                lineHeight = 16.sp
                            )
                        }
                    }
                } else {
                    Text(
                        "スマホと接続中…",
                        color = Color.Gray,
                        fontSize = 12.sp,
                        textAlign = TextAlign.Center
                    )
                }
            }
        }
    }
}
