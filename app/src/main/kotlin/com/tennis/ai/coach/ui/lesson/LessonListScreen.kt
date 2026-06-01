package com.tennis.ai.coach.ui.lesson

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.tennis.ai.coach.data.model.LessonReport
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

@OptIn(ExperimentalMaterial3Api::class, ExperimentalFoundationApi::class)
@Composable
fun LessonListScreen(
    onBack: () -> Unit,
    onNewLesson: () -> Unit,
    onOpenLesson: (String) -> Unit,
    viewModel: LessonListViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    var deleteCandidate by remember { mutableStateOf<LessonReport?>(null) }

    deleteCandidate?.let { r ->
        AlertDialog(
            onDismissRequest = { deleteCandidate = null },
            title = { Text("レッスン記録を削除") },
            text = { Text("${r.swingType.displayNameJa}の記録を削除しますか？\n録画も削除され元に戻せません。") },
            confirmButton = {
                TextButton(onClick = { viewModel.delete(r); deleteCandidate = null }) {
                    Text("削除", color = Color(0xFFEF5350))
                }
            },
            dismissButton = {
                TextButton(onClick = { deleteCandidate = null }) { Text("キャンセル") }
            },
        )
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text("個人レッスン", fontWeight = FontWeight.Bold)
                        Text("AI骨格診断であなたのフォームを分析",
                            color = Color.Gray, style = MaterialTheme.typography.labelSmall)
                    }
                },
                navigationIcon = {
                    IconButton(onClick = onBack) { Icon(Icons.Default.ArrowBack, null) }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Color(0xFF0D1F0D))
            )
        },
        floatingActionButton = {
            ExtendedFloatingActionButton(
                onClick = onNewLesson,
                containerColor = Color(0xFF2E7D32),
                icon = { Icon(Icons.Default.VideoCall, null, tint = Color.White) },
                text = { Text("新しいレッスン", color = Color.White) },
            )
        },
        containerColor = Color(0xFF0A1A0A)
    ) { padding ->
        if (state.lessons.isEmpty() && !state.isLoading) {
            Box(Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("🎾", fontSize = 48.sp)
                    Spacer(Modifier.height(8.dp))
                    Text("まだレッスン記録がありません", color = Color.Gray)
                    Text("右下のボタンから始めましょう", color = Color.Gray,
                        style = MaterialTheme.typography.labelSmall)
                }
            }
            return@Scaffold
        }
        LazyColumn(
            modifier = Modifier.fillMaxSize().padding(padding).padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            items(state.lessons) { lesson ->
                LessonCard(
                    lesson = lesson,
                    onClick = { onOpenLesson(lesson.lessonId) },
                    onLongPress = { deleteCandidate = lesson },
                )
            }
            item { Spacer(Modifier.height(72.dp)) }
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun LessonCard(
    lesson: LessonReport,
    onClick: () -> Unit,
    onLongPress: () -> Unit,
) {
    val date = remember(lesson.createdAt) {
        SimpleDateFormat("M/d HH:mm", Locale.JAPAN).format(Date(lesson.createdAt))
    }
    val scoreColor = when {
        lesson.averageScore >= 0.8f -> Color(0xFF4CAF50)
        lesson.averageScore >= 0.6f -> Color(0xFFF9A825)
        else -> Color(0xFFEF5350)
    }
    Card(
        modifier = Modifier.fillMaxWidth()
            .combinedClickable(onClick = onClick, onLongClick = onLongPress),
        colors = CardDefaults.cardColors(containerColor = Color(0xFF1A2E1A)),
    ) {
        Row(Modifier.padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(lesson.swingType.emoji, fontSize = 30.sp)
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(lesson.swingType.displayNameJa, color = Color.White,
                    fontWeight = FontWeight.Bold)
                Text("$date ・ ${lesson.totalSwings}スイング ・ ${lesson.durationSeconds}秒",
                    color = Color.Gray, style = MaterialTheme.typography.labelSmall)
                lesson.comparedProStyle?.let {
                    Text("比較: $it", color = Color(0xFF42A5F5),
                        style = MaterialTheme.typography.labelSmall)
                }
            }
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text("${(lesson.averageScore * 100).toInt()}", color = scoreColor,
                    fontWeight = FontWeight.Black, fontSize = 24.sp)
                Text("点", color = Color.Gray, style = MaterialTheme.typography.labelSmall)
            }
        }
    }
}
