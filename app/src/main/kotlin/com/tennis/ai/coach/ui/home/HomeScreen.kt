package com.tennis.ai.coach.ui.home

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
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
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.tennis.ai.coach.data.model.MatchReport
import com.tennis.ai.coach.data.model.MatchType
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

@OptIn(ExperimentalMaterial3Api::class, androidx.compose.foundation.ExperimentalFoundationApi::class)
@Composable
fun HomeScreen(
    viewModel: HomeViewModel = hiltViewModel(),
    onStartMatch: (String) -> Unit,
    onEditProfile: () -> Unit,
    onVideoAnalysis: () -> Unit,
    onViewReport: (String) -> Unit,
    onOpenTacticalAdvisor: () -> Unit = {},
    onOpenMultiPhone: () -> Unit = {},
    onOpenLessons: () -> Unit = {},
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    var deleteCandidate by remember { mutableStateOf<com.tennis.ai.coach.data.model.MatchReport?>(null) }

    deleteCandidate?.let { report ->
        AlertDialog(
            onDismissRequest = { deleteCandidate = null },
            title = { Text("試合記録を削除", fontWeight = FontWeight.Bold) },
            text = {
                Text(
                    "${report.matchType.displayNameJa}（${report.finalScore}）の記録を削除しますか？\n" +
                        "録画ファイルも削除され、元に戻せません。",
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    viewModel.deleteReport(report)
                    deleteCandidate = null
                }) { Text("削除", color = Color(0xFFEF5350)) }
            },
            dismissButton = {
                TextButton(onClick = { deleteCandidate = null }) { Text("キャンセル") }
            }
        )
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Tennis AI Coach", fontWeight = FontWeight.Bold) },
                actions = {
                    IconButton(onClick = onEditProfile) {
                        Icon(Icons.Default.Person, contentDescription = "プロフィール")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.primaryContainer
                )
            )
        }
    ) { padding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
            contentPadding = PaddingValues(vertical = 16.dp)
        ) {
            item {
                uiState.activeProfile?.let { profile ->
                    PlayerCard(
                        name = profile.name.ifBlank { "プレイヤー" },
                        level = profile.level.displayNameJa,
                        gender = profile.gender.displayNameJa,
                        hand = profile.dominantHand.displayNameJa,
                        onEdit = onEditProfile
                    )
                } ?: NoProfileCard(onClick = onEditProfile)
            }

            item {
                Text(
                    "試合を開始",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold
                )
            }

            item {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    MatchTypeCard(
                        modifier = Modifier.weight(1f),
                        title = "シングルス",
                        icon = Icons.Default.Person,
                        gradient = Brush.linearGradient(
                            listOf(Color(0xFF1B5E20), Color(0xFF4CAF50))
                        ),
                        onClick = { onStartMatch(MatchType.SINGLES.name) }
                    )
                    MatchTypeCard(
                        modifier = Modifier.weight(1f),
                        title = "ダブルス",
                        icon = Icons.Default.Group,
                        gradient = Brush.linearGradient(
                            listOf(Color(0xFF0D47A1), Color(0xFF2196F3))
                        ),
                        onClick = { onStartMatch(MatchType.DOUBLES.name) }
                    )
                }
            }

            item {
                ActionCard(
                    title = "個人レッスン",
                    subtitle = "AI骨格診断でスイングを分析・理想フォームと比較",
                    icon = Icons.Default.SportsTennis,
                    onClick = onOpenLessons
                )
            }

            item {
                ActionCard(
                    title = "動画分析",
                    subtitle = "録画からアドバイスを導き出す",
                    icon = Icons.Default.VideoLibrary,
                    onClick = onVideoAnalysis
                )
            }

            item {
                ActionCard(
                    title = "戦術アドバイザー",
                    subtitle = "状況を選ぶだけでプロの戦術が見つかる",
                    icon = Icons.Default.Lightbulb,
                    onClick = onOpenTacticalAdvisor
                )
            }

            item {
                ActionCard(
                    title = "2台連携モード",
                    subtitle = "もう1台のスマホとBluetooth接続して両陣を撮影",
                    icon = Icons.Default.PhoneAndroid,
                    onClick = onOpenMultiPhone
                )
            }

            if (uiState.recentReports.isNotEmpty()) {
                item {
                    Text(
                        "最近の試合",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold
                    )
                }
                items(uiState.recentReports) { report ->
                    RecentMatchItem(
                        report = report,
                        onClick = { onViewReport(report.matchId) },
                        onLongPress = { deleteCandidate = report },
                    )
                }
            }
        }
    }
}

@Composable
private fun PlayerCard(
    name: String, level: String, gender: String, hand: String, onEdit: () -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer)
    ) {
        Row(
            modifier = Modifier.padding(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(
                Icons.Default.AccountCircle,
                contentDescription = null,
                modifier = Modifier.size(48.dp),
                tint = MaterialTheme.colorScheme.primary
            )
            Spacer(Modifier.width(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(name, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                Text(
                    "$level　$gender　$hand",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onPrimaryContainer.copy(alpha = 0.7f)
                )
            }
            IconButton(onClick = onEdit) {
                Icon(Icons.Default.Edit, contentDescription = "編集")
            }
        }
    }
}

@Composable
private fun NoProfileCard(onClick: () -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth().clickable(onClick = onClick),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
    ) {
        Row(
            modifier = Modifier.padding(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(Icons.Default.AddCircle, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
            Spacer(Modifier.width(12.dp))
            Text("プロフィールを設定してください", style = MaterialTheme.typography.bodyMedium)
        }
    }
}

@Composable
private fun MatchTypeCard(
    modifier: Modifier, title: String, icon: ImageVector,
    gradient: Brush, onClick: () -> Unit
) {
    Box(
        modifier = modifier
            .height(100.dp)
            .clip(RoundedCornerShape(16.dp))
            .background(gradient)
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Icon(icon, contentDescription = null, tint = Color.White, modifier = Modifier.size(32.dp))
            Spacer(Modifier.height(8.dp))
            Text(title, color = Color.White, fontWeight = FontWeight.Bold,
                style = MaterialTheme.typography.titleSmall)
        }
    }
}

@Composable
private fun ActionCard(title: String, subtitle: String, icon: ImageVector, onClick: () -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth().clickable(onClick = onClick),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
    ) {
        Row(modifier = Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(icon, contentDescription = null, tint = MaterialTheme.colorScheme.secondary,
                modifier = Modifier.size(36.dp))
            Spacer(Modifier.width(12.dp))
            Column {
                Text(title, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.bodyLarge)
                Text(subtitle, style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
            }
            Spacer(Modifier.weight(1f))
            Icon(Icons.Default.ChevronRight, contentDescription = null)
        }
    }
}

@OptIn(androidx.compose.foundation.ExperimentalFoundationApi::class)
@Composable
private fun RecentMatchItem(
    report: MatchReport,
    onClick: () -> Unit,
    onLongPress: () -> Unit = {},
) {
    val date = remember(report.createdAt) {
        SimpleDateFormat("M/d HH:mm", Locale.JAPAN).format(Date(report.createdAt))
    }
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .combinedClickable(onClick = onClick, onLongClick = onLongPress),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
    ) {
        Row(modifier = Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(
                report.result.displayNameJa,
                color = if (report.result.name == "WIN") Color(0xFF4CAF50) else Color(0xFFEF5350),
                fontWeight = FontWeight.Bold,
                modifier = Modifier.width(40.dp)
            )
            Spacer(Modifier.width(8.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(report.matchType.displayNameJa, style = MaterialTheme.typography.bodyMedium)
                Text(date, style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
            }
            Text(report.finalScore, style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.Bold)
        }
    }
}
