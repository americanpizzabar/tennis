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
    val p = stats.player
    val o = stats.opponent
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        // ── サービス ──
        StatsSection(
            title = "🎾 サービス",
            rows = listOf(
                StatComparison("サービスエース", "${p.aces}", "${o.aces}", higherIsBetter = true),
                StatComparison("ダブルフォルト", "${p.doubleFaults}", "${o.doubleFaults}", higherIsBetter = false),
                StatComparison("1st サーブ確率",
                    "${p.firstServePercent()}% (${p.firstServeIn}/${p.firstServeAttempts})",
                    "${o.firstServePercent()}% (${o.firstServeIn}/${o.firstServeAttempts})",
                    higherIsBetter = true),
                StatComparison("1st サーブ獲得率",
                    "${p.firstServePointsWonPercent()}%",
                    "${o.firstServePointsWonPercent()}%",
                    higherIsBetter = true),
                StatComparison("2nd サーブ獲得率",
                    "${p.secondServePointsWonPercent()}%",
                    "${o.secondServePointsWonPercent()}%",
                    higherIsBetter = true),
                StatComparison("ブレークポイントセーブ",
                    "${p.breakPointsSavedPercent()}% (${p.breakPointsSaved}/${p.breakPointsFaced})",
                    "${o.breakPointsSavedPercent()}% (${o.breakPointsSaved}/${o.breakPointsFaced})",
                    higherIsBetter = true),
            )
        )
        // ── リターン ──
        StatsSection(
            title = "🔄 リターン",
            rows = listOf(
                StatComparison("1st リターン獲得率",
                    "${p.firstServeReturnPointsWonPercent()}%",
                    "${o.firstServeReturnPointsWonPercent()}%",
                    higherIsBetter = true),
                StatComparison("2nd リターン獲得率",
                    "${p.secondServeReturnPointsWonPercent()}%",
                    "${o.secondServeReturnPointsWonPercent()}%",
                    higherIsBetter = true),
                StatComparison("ブレーク獲得率",
                    "${p.breakPointsWonPercent()}% (${p.breakPointsConverted}/${p.breakPointsAttempted})",
                    "${o.breakPointsWonPercent()}% (${o.breakPointsConverted}/${o.breakPointsAttempted})",
                    higherIsBetter = true),
            )
        )
        // ── ストローク全体 ──
        StatsSection(
            title = "🏓 ストローク",
            rows = listOf(
                StatComparison("ウィナー", "${p.winners}", "${o.winners}", higherIsBetter = true),
                StatComparison("アンフォースドエラー", "${p.unforcedErrors}", "${o.unforcedErrors}",
                    higherIsBetter = false),
                StatComparison("フォーストエラー", "${p.forcedErrors}", "${o.forcedErrors}",
                    higherIsBetter = false),
                StatComparison("ネットでのポイント",
                    "${p.netApproachesWon}/${p.netApproaches} (${p.netApproachesWonPercent()}%)",
                    "${o.netApproachesWon}/${o.netApproaches} (${o.netApproachesWonPercent()}%)",
                    higherIsBetter = true),
                StatComparison("総獲得ポイント",
                    "${p.totalPointsWon}/${p.totalPointsPlayed}",
                    "${o.totalPointsWon}/${o.totalPointsPlayed}",
                    higherIsBetter = true),
            )
        )
        // ── 高度なスタッツ ──
        StatsSection(
            title = "📊 アドバンストスタッツ",
            rows = listOf(
                StatComparison("平均ラリー長 (Shot Tolerance)",
                    "%.1f球".format(p.averageRallyLength()),
                    "%.1f球".format(o.averageRallyLength()),
                    higherIsBetter = true),
                StatComparison("平均球速",
                    "%.0f km/h".format(p.averageBallSpeedKmh()),
                    "%.0f km/h".format(o.averageBallSpeedKmh()),
                    higherIsBetter = true),
                StatComparison("最大球速",
                    "%.0f km/h".format(p.maxBallSpeedKmh),
                    "%.0f km/h".format(o.maxBallSpeedKmh),
                    higherIsBetter = true),
                StatComparison("FH ウィナー", "${p.forehandWinners}", "${o.forehandWinners}",
                    higherIsBetter = true),
                StatComparison("BH ウィナー", "${p.backhandWinners}", "${o.backhandWinners}",
                    higherIsBetter = true),
                StatComparison("FH エラー", "${p.forehandErrors}", "${o.forehandErrors}",
                    higherIsBetter = false),
                StatComparison("BH エラー", "${p.backhandErrors}", "${o.backhandErrors}",
                    higherIsBetter = false),
            )
        )
        // ── サマリーバー（ウィナー / エラー） ──
        WinnerErrorBalanceCard(p, o)
    }
}

private data class StatComparison(
    val label: String,
    val playerValue: String,
    val opponentValue: String,
    val higherIsBetter: Boolean,
)

@Composable
private fun StatsSection(title: String, rows: List<StatComparison>) {
    Card(
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(title, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleSmall)
            Spacer(Modifier.height(6.dp))
            // ヘッダ行
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Text("項目", color = Color.Gray, style = MaterialTheme.typography.labelSmall,
                    modifier = Modifier.weight(1.4f))
                Text("自分", color = Color(0xFF4CAF50), fontWeight = FontWeight.Bold,
                    style = MaterialTheme.typography.labelSmall, modifier = Modifier.weight(1f))
                Text("相手", color = Color(0xFFEF5350), fontWeight = FontWeight.Bold,
                    style = MaterialTheme.typography.labelSmall, modifier = Modifier.weight(1f))
            }
            HorizontalDivider(color = Color.White.copy(alpha = 0.1f))
            rows.forEach { r ->
                StatComparisonRow(r)
            }
        }
    }
}

@Composable
private fun StatComparisonRow(stat: StatComparison) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            stat.label,
            style = MaterialTheme.typography.bodySmall,
            color = Color.Gray,
            modifier = Modifier.weight(1.4f),
        )
        Text(
            stat.playerValue,
            fontWeight = FontWeight.Bold,
            style = MaterialTheme.typography.bodySmall,
            color = Color(0xFF4CAF50),
            modifier = Modifier.weight(1f),
        )
        Text(
            stat.opponentValue,
            fontWeight = FontWeight.Bold,
            style = MaterialTheme.typography.bodySmall,
            color = Color(0xFFEF5350),
            modifier = Modifier.weight(1f),
        )
    }
}

@Composable
private fun WinnerErrorBalanceCard(p: PlayerMatchStats, o: PlayerMatchStats) {
    val pBalance = p.winners - p.unforcedErrors
    val oBalance = o.winners - o.unforcedErrors
    Card(
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(modifier = Modifier.padding(14.dp)) {
            Text("⚖️ ウィナー − アンフォースドエラー（攻撃の質）",
                fontWeight = FontWeight.Bold,
                style = MaterialTheme.typography.titleSmall)
            Spacer(Modifier.height(8.dp))
            Row(modifier = Modifier.fillMaxWidth()) {
                BalanceCell(
                    label = "自分",
                    winners = p.winners,
                    errors = p.unforcedErrors,
                    balance = pBalance,
                    color = Color(0xFF4CAF50),
                    modifier = Modifier.weight(1f),
                )
                Spacer(Modifier.width(8.dp))
                BalanceCell(
                    label = "相手",
                    winners = o.winners,
                    errors = o.unforcedErrors,
                    balance = oBalance,
                    color = Color(0xFFEF5350),
                    modifier = Modifier.weight(1f),
                )
            }
            Spacer(Modifier.height(6.dp))
            Text(
                if (pBalance > oBalance)
                    "✅ 自分の方が攻撃の質が高い（差: +${pBalance - oBalance}）"
                else if (pBalance < oBalance)
                    "⚠️ 相手の方が攻撃の質が高い（差: ${pBalance - oBalance}）"
                else "互角の攻撃力",
                color = Color.Gray,
                style = MaterialTheme.typography.labelSmall,
            )
        }
    }
}

@Composable
private fun BalanceCell(
    label: String,
    winners: Int,
    errors: Int,
    balance: Int,
    color: Color,
    modifier: Modifier = Modifier,
) {
    Surface(
        modifier = modifier,
        color = color.copy(alpha = 0.15f),
        shape = RoundedCornerShape(8.dp),
    ) {
        Column(
            modifier = Modifier.padding(8.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(label, color = color, fontWeight = FontWeight.Bold,
                style = MaterialTheme.typography.labelMedium)
            Text(
                if (balance >= 0) "+$balance" else "$balance",
                color = color,
                fontWeight = FontWeight.Black,
                fontSize = 24.sp,
            )
            Text("W:$winners / UE:$errors",
                color = Color.Gray,
                style = MaterialTheme.typography.labelSmall)
        }
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
