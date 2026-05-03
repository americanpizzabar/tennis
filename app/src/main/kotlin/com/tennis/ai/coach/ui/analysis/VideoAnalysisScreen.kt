package com.tennis.ai.coach.ui.analysis

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.tennis.ai.coach.data.model.AdviceCategory
import com.tennis.ai.coach.data.model.TacticalAdvice

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun VideoAnalysisScreen(
    viewModel: VideoAnalysisViewModel = hiltViewModel(),
    onBack: () -> Unit
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val videoPicker = rememberLauncherForActivityResult(
        ActivityResultContracts.GetContent()
    ) { uri: Uri? -> uri?.let { viewModel.selectVideo(it) } }

    val progressAnim by animateFloatAsState(
        targetValue = uiState.analysisProgress,
        label = "progress"
    )

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("動画分析") },
                navigationIcon = {
                    IconButton(onClick = onBack) { Icon(Icons.Default.ArrowBack, null) }
                }
            )
        }
    ) { padding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            // 動画選択
            item {
                VideoPickerCard(
                    hasVideo = uiState.selectedVideoUri != null,
                    onClick = { videoPicker.launch("video/*") }
                )
            }

            // 補足説明入力
            if (uiState.selectedVideoUri != null) {
                item {
                    OutlinedTextField(
                        value = uiState.videoDescription,
                        onValueChange = viewModel::updateDescription,
                        label = { Text("動画の補足説明（省略可）") },
                        placeholder = { Text("例：バックハンドのスライスが課題。ラリー中の配球を見てほしい。") },
                        modifier = Modifier.fillMaxWidth(),
                        minLines = 2,
                        maxLines = 4
                    )
                }

                item {
                    Button(
                        onClick = viewModel::analyzeVideo,
                        modifier = Modifier.fillMaxWidth(),
                        enabled = !uiState.isAnalyzing,
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF1B5E20))
                    ) {
                        Icon(Icons.Default.AutoAwesome, null, modifier = Modifier.size(20.dp))
                        Spacer(Modifier.width(8.dp))
                        Text("AI で動画を分析する", style = MaterialTheme.typography.bodyLarge)
                    }
                }
            }

            // 分析中インジケーター
            if (uiState.isAnalyzing) {
                item {
                    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)) {
                        Column(
                            modifier = Modifier.padding(16.dp),
                            horizontalAlignment = Alignment.CenterHorizontally
                        ) {
                            Text("Gemini AI が動画を分析中…", fontWeight = FontWeight.Bold)
                            Spacer(Modifier.height(8.dp))
                            LinearProgressIndicator(
                                progress = { progressAnim },
                                modifier = Modifier.fillMaxWidth(),
                                color = Color(0xFF4CAF50)
                            )
                            Spacer(Modifier.height(4.dp))
                            Text(
                                "${(progressAnim * 100).toInt()}%",
                                style = MaterialTheme.typography.labelSmall,
                                color = Color.Gray
                            )
                        }
                    }
                }
            }

            // エラー表示
            uiState.errorMessage?.let { error ->
                item {
                    Card(colors = CardDefaults.cardColors(containerColor = Color(0xFF4A0000))) {
                        Row(modifier = Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Default.Error, null, tint = Color(0xFFEF5350))
                            Spacer(Modifier.width(8.dp))
                            Text(error, color = Color.White, modifier = Modifier.weight(1f))
                            IconButton(onClick = viewModel::clearError) {
                                Icon(Icons.Default.Close, null, tint = Color.Gray)
                            }
                        }
                    }
                }
            }

            // 分析結果
            if (uiState.adviceList.isNotEmpty()) {
                item {
                    Text(
                        "分析結果 — ${uiState.adviceList.size} 件のアドバイス",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold
                    )
                }
                items(uiState.adviceList) { advice ->
                    VideoAdviceCard(advice = advice)
                }
            }
        }
    }
}

@Composable
private fun VideoPickerCard(hasVideo: Boolean, onClick: () -> Unit) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(120.dp)
            .clip(RoundedCornerShape(12.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant)
            .border(
                width = 2.dp,
                color = if (hasVideo) Color(0xFF4CAF50) else Color(0xFF444444),
                shape = RoundedCornerShape(12.dp)
            )
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Icon(
                if (hasVideo) Icons.Default.CheckCircle else Icons.Default.VideoLibrary,
                null,
                tint = if (hasVideo) Color(0xFF4CAF50) else Color.Gray,
                modifier = Modifier.size(36.dp)
            )
            Spacer(Modifier.height(8.dp))
            Text(
                if (hasVideo) "動画が選択されています（タップで変更）" else "タップして動画を選択",
                color = if (hasVideo) Color(0xFF4CAF50) else Color.Gray,
                style = MaterialTheme.typography.bodyMedium
            )
        }
    }
}

@Composable
private fun VideoAdviceCard(advice: TacticalAdvice) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
    ) {
        Column(modifier = Modifier.padding(14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(advice.category.emoji, fontSize = 22.sp)
                Spacer(Modifier.width(8.dp))
                Text(
                    advice.category.displayNameJa,
                    color = MaterialTheme.colorScheme.primary,
                    style = MaterialTheme.typography.labelMedium
                )
                Spacer(Modifier.weight(1f))
                Text(
                    "確信度 ${(advice.confidence * 100).toInt()}%",
                    color = Color.Gray,
                    style = MaterialTheme.typography.labelSmall
                )
            }
            Spacer(Modifier.height(6.dp))
            Text(
                advice.title,
                fontWeight = FontWeight.Bold,
                style = MaterialTheme.typography.bodyLarge
            )
            Spacer(Modifier.height(4.dp))
            Text(
                advice.body,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.85f),
                lineHeight = 22.sp
            )
        }
    }
}
