package com.tennis.ai.coach.ui.report

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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.tennis.ai.coach.data.model.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MatchReportScreen(
    matchId: String,
    viewModel: MatchReportViewModel = hiltViewModel(),
    onBack: () -> Unit
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()

    LaunchedEffect(matchId) { viewModel.load(matchId) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("試合レポート") },
                navigationIcon = {
                    IconButton(onClick = onBack) { Icon(Icons.Default.ArrowBack, null) }
                }
            )
        }
    ) { padding ->
        if (uiState.isLoading) {
            Box(Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }
            return@Scaffold
        }

        val report = uiState.report
        if (report == null) {
            Box(Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) {
                Text("レポートが見つかりません")
            }
            return@Scaffold
        }

        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            // 結果サマリー
            item { ResultHeaderCard(report = report) }

            // 3行まとめ
            item { ThreeLineSummaryCard(summary = report.summaryThreeLines) }

            // スタッツ
            uiState.stats?.let { stats ->
                item { StatsCard(stats = stats) }
            }

            // キーモーメント
            if (uiState.keyMoments.isNotEmpty()) {
                item {
                    Text("キーモーメント", style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold)
                }
                items(uiState.keyMoments) { moment ->
                    KeyMomentItem(moment = moment)
                }
            }

            // 練習メニュー
            if (uiState.practiceMenu.isNotEmpty()) {
                item {
                    Text("次回の練習メニュー", style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold)
                }
                items(uiState.practiceMenu) { item ->
                    PracticeMenuCard(item = item)
                }
            }

            item { Spacer(Modifier.height(24.dp)) }
        }
    }
}

@Composable
private fun ResultHeaderCard(report: MatchReport) {
    val resultColor = when (report.result) {
        MatchResult.WIN -> Color(0xFF4CAF50)
        MatchResult.LOSS -> Color(0xFFEF5350)
        MatchResult.UNFINISHED -> Color(0xFFF9A825)
    }
    Card(
        colors = CardDefaults.cardColors(containerColor = resultColor.copy(alpha = 0.15f)),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(
            modifier = Modifier.padding(20.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text(
                report.result.displayNameJa,
                color = resultColor,
                fontSize = 32.sp,
                fontWeight = FontWeight.Black
            )
            Text(
                report.finalScore,
                color = Color.White,
                fontSize = 48.sp,
                fontWeight = FontWeight.Black,
                letterSpacing = 4.sp
            )
            Spacer(Modifier.height(4.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                Chip(label = report.matchType.displayNameJa)
                Chip(label = "${report.durationMinutes}分")
            }
        }
    }
}

@Composable
private fun Chip(label: String) {
    Surface(
        color = MaterialTheme.colorScheme.surfaceVariant,
        shape = RoundedCornerShape(50)
    ) {
        Text(
            label,
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 4.dp),
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurface
        )
    }
}

@Composable
private fun ThreeLineSummaryCard(summary: String) {
    Card(
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Default.AutoAwesome, null, tint = MaterialTheme.colorScheme.primary)
                Spacer(Modifier.width(8.dp))
                Text("AI 3行まとめ", fontWeight = FontWeight.Bold,
                    style = MaterialTheme.typography.titleSmall)
            }
            Spacer(Modifier.height(8.dp))
            summary.lines().forEachIndexed { idx, line ->
                if (line.isNotBlank()) {
                    Text(
                        line.trim(),
                        style = MaterialTheme.typography.bodyMedium,
                        lineHeight = 22.sp,
                        modifier = Modifier.padding(vertical = 2.dp)
                    )
                }
            }
        }
    }
}

@Composable
private fun StatsCard(stats: MatchStats) {
    Card(
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text("スタッツ", fontWeight = FontWeight.Bold,
                style = MaterialTheme.typography.titleSmall)
            Spacer(Modifier.height(8.dp))
            StatRow("1stサーブ率", "${stats.firstServePercent}%",
                isGood = stats.firstServePercent >= 60)
            StatRow("ウィナー", "${stats.winnerCount}本", isGood = true)
            StatRow("アンフォースドエラー", "${stats.unforeEdErrorCount}本",
                isGood = stats.unforeEdErrorCount < stats.winnerCount)
            StatRow("ネットポイント勝率", "${stats.netPointsWonPercent}%",
                isGood = stats.netPointsWonPercent >= 50)
            StatRow("平均ラリー球数", "%.1f球".format(stats.averageRallyLength), isGood = true)
        }
    }
}

@Composable
private fun StatRow(label: String, value: String, isGood: Boolean) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 3.dp),
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(label, style = MaterialTheme.typography.bodySmall, color = Color.Gray)
        Text(
            value,
            fontWeight = FontWeight.Bold,
            style = MaterialTheme.typography.bodySmall,
            color = if (isGood) Color(0xFF4CAF50) else Color(0xFFEF5350)
        )
    }
}

@Composable
private fun KeyMomentItem(moment: KeyMoment) {
    Card(
        colors = CardDefaults.cardColors(
            containerColor = if (moment.isPositive) Color(0xFF1A2E1A) else Color(0xFF2E1A1A)
        ),
        modifier = Modifier.fillMaxWidth()
    ) {
        Row(modifier = Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(
                if (moment.isPositive) Icons.Default.ThumbUp else Icons.Default.ThumbDown,
                null,
                tint = if (moment.isPositive) Color(0xFF4CAF50) else Color(0xFFEF5350),
                modifier = Modifier.size(20.dp)
            )
            Spacer(Modifier.width(8.dp))
            Text(moment.description, style = MaterialTheme.typography.bodySmall,
                modifier = Modifier.weight(1f))
            Text(
                "重要度 ${(moment.impactScore * 10).toInt()}/10",
                style = MaterialTheme.typography.labelSmall,
                color = Color.Gray
            )
        }
    }
}

@Composable
private fun PracticeMenuCard(item: PracticeMenuItem) {
    Card(
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
        modifier = Modifier.fillMaxWidth()
    ) {
        Row(modifier = Modifier.padding(14.dp), verticalAlignment = Alignment.Top) {
            Surface(
                color = MaterialTheme.colorScheme.primary,
                shape = RoundedCornerShape(50),
                modifier = Modifier.size(28.dp)
            ) {
                Box(contentAlignment = Alignment.Center) {
                    Text(
                        item.priority.toString(),
                        color = Color.White,
                        fontWeight = FontWeight.Bold,
                        style = MaterialTheme.typography.labelMedium
                    )
                }
            }
            Spacer(Modifier.width(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(item.title, fontWeight = FontWeight.Bold,
                    style = MaterialTheme.typography.bodyMedium)
                Spacer(Modifier.height(2.dp))
                Text(item.description, style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f))
            }
            Spacer(Modifier.width(8.dp))
            Text("${item.estimatedMinutes}分", color = Color.Gray,
                style = MaterialTheme.typography.labelSmall)
        }
    }
}
