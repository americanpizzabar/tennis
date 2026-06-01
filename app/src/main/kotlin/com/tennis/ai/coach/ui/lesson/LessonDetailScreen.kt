package com.tennis.ai.coach.ui.lesson

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.tennis.ai.coach.data.model.*
import kotlinx.coroutines.delay

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LessonDetailScreen(
    lessonId: String,
    onBack: () -> Unit,
    viewModel: LessonDetailViewModel = hiltViewModel(),
) {
    val state by viewModel.ui.collectAsStateWithLifecycle()
    LaunchedEffect(lessonId) { viewModel.load(lessonId) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("診断結果") },
                navigationIcon = {
                    IconButton(onClick = onBack) { Icon(Icons.Default.ArrowBack, null) }
                },
                actions = {
                    IconButton(onClick = { viewModel.delete(onBack) }) {
                        Icon(Icons.Default.Delete, "削除", tint = Color(0xFFEF5350))
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Color(0xFF0D1F0D))
            )
        },
        containerColor = Color(0xFF0A1A0A)
    ) { padding ->
        if (state.isLoading) {
            Box(Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = Color(0xFF4CAF50))
            }
            return@Scaffold
        }
        val report = state.report ?: run {
            Box(Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) {
                Text("記録が見つかりません", color = Color.White)
            }
            return@Scaffold
        }

        LazyColumn(
            modifier = Modifier.fillMaxSize().padding(padding).padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item { ScoreHeader(report) }
            item { SummaryCard(report.summaryThreeLines) }
            item { TrajectorySlowMo(state.trajectory, state.comparisonTrajectory,
                comparisonLabel = state.comparisonReport?.let { "過去" }) }
            item { CleanHitCard(state.cleanHit) }

            item {
                Text("🎯 超重要チェックポイント", color = Color.White,
                    fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium)
            }
            items(state.checkpoints) { cp ->
                val compareScore = state.comparisonCheckpoints
                    .firstOrNull { it.checkpointId == cp.checkpointId }?.score
                CheckpointCard(cp, compareScore)
            }

            // 過去の自分比較
            if (state.comparableLessons.isNotEmpty()) {
                item {
                    PastComparisonSelector(
                        lessons = state.comparableLessons,
                        selected = state.comparisonReport,
                        onSelect = viewModel::selectComparison,
                    )
                }
            }

            item {
                Text("📋 明日のためのドリル", color = Color.White,
                    fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium)
            }
            items(state.drills) { drill -> DrillCard(drill) }

            item { Spacer(Modifier.height(24.dp)) }
        }
    }
}

@Composable
private fun ScoreHeader(report: LessonReport) {
    val color = when {
        report.averageScore >= 0.8f -> Color(0xFF4CAF50)
        report.averageScore >= 0.6f -> Color(0xFFF9A825)
        else -> Color(0xFFEF5350)
    }
    Card(colors = CardDefaults.cardColors(containerColor = Color(0xFF1A2E1A))) {
        Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(report.swingType.emoji, fontSize = 40.sp)
            Spacer(Modifier.width(16.dp))
            Column(Modifier.weight(1f)) {
                Text(report.swingType.displayNameJa, color = Color.White,
                    fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleLarge)
                Text("${report.totalSwings}スイングを解析",
                    color = Color.Gray, style = MaterialTheme.typography.bodySmall)
                report.comparedProStyle?.let {
                    Text("比較: $it", color = Color(0xFF42A5F5),
                        style = MaterialTheme.typography.labelSmall)
                }
            }
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text("${(report.averageScore * 100).toInt()}", color = color,
                    fontWeight = FontWeight.Black, fontSize = 40.sp)
                Text("総合スコア", color = Color.Gray, style = MaterialTheme.typography.labelSmall)
            }
        }
    }
}

@Composable
private fun SummaryCard(summary: String) {
    Card(colors = CardDefaults.cardColors(containerColor = Color(0xFF0D2C4D))) {
        Column(Modifier.padding(14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Default.AutoAwesome, null, tint = Color(0xFFF9A825))
                Spacer(Modifier.width(6.dp))
                Text("AI 3行まとめ", color = Color(0xFFF9A825), fontWeight = FontWeight.Bold)
            }
            Spacer(Modifier.height(6.dp))
            summary.lines().filter { it.isNotBlank() }.forEach {
                Text(it.trim(), color = Color.White, style = MaterialTheme.typography.bodySmall,
                    lineHeight = 20.sp, modifier = Modifier.padding(vertical = 1.dp))
            }
        }
    }
}

/** 手首軌道のスロー再生。 */
@Composable
private fun TrajectorySlowMo(
    trajectory: List<TrajectoryPoint>,
    comparison: List<TrajectoryPoint>,
    comparisonLabel: String?,
) {
    var playing by remember { mutableStateOf(false) }
    var frame by remember { mutableStateOf(0) }
    var speed by remember { mutableStateOf(1f) }   // 1x..0.25x slow
    val maxFrame = trajectory.size.coerceAtLeast(1)

    LaunchedEffect(playing, speed) {
        if (playing && trajectory.isNotEmpty()) {
            while (playing) {
                delay((60 / speed).toLong().coerceAtLeast(16))
                frame = (frame + 1) % maxFrame
            }
        }
    }

    Card(colors = CardDefaults.cardColors(containerColor = Color(0xFF0D1F0D))) {
        Column(Modifier.padding(12.dp)) {
            Text("🎬 ラケット（手首）軌道スロー再生", color = Color(0xFFF9A825),
                fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleSmall)
            Spacer(Modifier.height(8.dp))
            Canvas(Modifier.fillMaxWidth().height(200.dp)) {
                // 背景グリッド
                drawRect(Color(0xFF142414))
                // 軌道（全体は薄く、再生位置まで濃く）
                drawTrajectory(trajectory, frame, Color(0xFF4CAF50))
                if (comparison.isNotEmpty()) {
                    drawTrajectory(comparison, (frame).coerceAtMost(comparison.size - 1),
                        Color(0xFF42A5F5))
                }
            }
            // 凡例
            Row(horizontalArrangement = Arrangement.spacedBy(14.dp),
                modifier = Modifier.padding(top = 4.dp)) {
                LegendDot(Color(0xFF4CAF50), "今回")
                if (comparisonLabel != null) LegendDot(Color(0xFF42A5F5), comparisonLabel)
            }
            // コントロール
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = { playing = !playing }) {
                    Icon(if (playing) Icons.Default.Pause else Icons.Default.PlayArrow,
                        null, tint = Color(0xFF4CAF50))
                }
                Slider(value = frame.toFloat(),
                    onValueChange = { frame = it.toInt(); playing = false },
                    valueRange = 0f..(maxFrame - 1).toFloat().coerceAtLeast(1f),
                    modifier = Modifier.weight(1f),
                    colors = SliderDefaults.colors(thumbColor = Color(0xFF4CAF50),
                        activeTrackColor = Color(0xFF2E7D32)))
            }
            // 速度
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("速度", color = Color.Gray, style = MaterialTheme.typography.labelSmall)
                Spacer(Modifier.width(8.dp))
                listOf(1f to "1x", 0.5f to "0.5x", 0.25f to "0.25x").forEach { (sp, label) ->
                    val sel = speed == sp
                    Box(Modifier.padding(end = 6.dp)
                        .clip(RoundedCornerShape(6.dp))
                        .background(if (sel) Color(0xFF2E7D32) else Color(0xFF1A2E1A))
                        .clickable { speed = sp }
                        .padding(horizontal = 10.dp, vertical = 4.dp)) {
                        Text(label, color = Color.White,
                            style = MaterialTheme.typography.labelSmall)
                    }
                }
            }
            if (trajectory.isEmpty()) {
                Text("軌道データがありません（スイングが検知されませんでした）",
                    color = Color.Gray, style = MaterialTheme.typography.labelSmall)
            }
        }
    }
}

private fun androidx.compose.ui.graphics.drawscope.DrawScope.drawTrajectory(
    pts: List<TrajectoryPoint>, upto: Int, color: Color,
) {
    if (pts.size < 2) return
    for (i in 1 until pts.size) {
        val a = pts[i - 1]; val b = pts[i]
        val alpha = if (i <= upto) 0.95f else 0.18f
        drawLine(
            color.copy(alpha = alpha),
            Offset(a.x * size.width, a.y * size.height),
            Offset(b.x * size.width, b.y * size.height),
            strokeWidth = if (i <= upto) 5f else 2f,
        )
    }
    // 現在位置マーカー
    val cur = pts[upto.coerceIn(0, pts.size - 1)]
    drawCircle(Color(0xFFF9A825), 8f, Offset(cur.x * size.width, cur.y * size.height))
}

@Composable
private fun LegendDot(color: Color, label: String) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.size(8.dp).background(color, RoundedCornerShape(50)))
        Spacer(Modifier.width(4.dp))
        Text(label, color = Color.Gray, style = MaterialTheme.typography.labelSmall)
    }
}

@Composable
private fun CleanHitCard(clean: CleanHitSummary) {
    Card(colors = CardDefaults.cardColors(containerColor = Color(0xFF1A2E1A))) {
        Column(Modifier.padding(14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Default.GraphicEq, null, tint = Color(0xFFF9A825))
                Spacer(Modifier.width(6.dp))
                Text("打球音分析（クリーンヒット判定）", color = Color.White,
                    fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleSmall)
            }
            Spacer(Modifier.height(8.dp))
            if (clean.totalDetectedHits == 0) {
                Text("打球音が検知されませんでした（マイク権限／環境音をご確認ください）",
                    color = Color.Gray, style = MaterialTheme.typography.bodySmall)
            } else {
                Row(Modifier.fillMaxWidth(), Arrangement.SpaceAround) {
                    HitStat("検知", "${clean.totalDetectedHits}", Color.White)
                    HitStat("クリーン", "${clean.cleanHits}", Color(0xFF4CAF50))
                    HitStat("ミスヒット", "${clean.mishits}", Color(0xFFEF5350))
                    HitStat("クリーン率", "${clean.cleanHitPercent}%", Color(0xFFF9A825))
                }
                if (clean.commonMishitCausesJa.isNotEmpty()) {
                    Spacer(Modifier.height(8.dp))
                    Text("ミスヒット時の傾向:", color = Color.Gray,
                        style = MaterialTheme.typography.labelSmall)
                    clean.commonMishitCausesJa.forEach {
                        Text("・$it", color = Color(0xFFEF5350),
                            style = MaterialTheme.typography.labelSmall)
                    }
                }
            }
        }
    }
}

@Composable
private fun HitStat(label: String, value: String, color: Color) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(value, color = color, fontWeight = FontWeight.Black, fontSize = 18.sp)
        Text(label, color = Color.Gray, style = MaterialTheme.typography.labelSmall)
    }
}

@Composable
private fun CheckpointCard(cp: CheckpointResult, comparisonScore: Int?) {
    val color = when {
        cp.score >= 80 -> Color(0xFF4CAF50)
        cp.score >= 60 -> Color(0xFFF9A825)
        else -> Color(0xFFEF5350)
    }
    var expanded by remember { mutableStateOf(false) }
    Card(
        colors = CardDefaults.cardColors(containerColor = Color(0xFF1A2E1A)),
        modifier = Modifier.fillMaxWidth().clickable { expanded = !expanded },
    ) {
        Column(Modifier.padding(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(cp.nameJa, color = Color.White, fontWeight = FontWeight.Bold,
                        style = MaterialTheme.typography.bodyMedium)
                    Text(cp.phase.displayNameJa, color = Color.Gray,
                        style = MaterialTheme.typography.labelSmall)
                }
                if (comparisonScore != null) {
                    val diff = cp.score - comparisonScore
                    Text(
                        (if (diff >= 0) "+$diff" else "$diff"),
                        color = if (diff >= 0) Color(0xFF4CAF50) else Color(0xFFEF5350),
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.padding(end = 8.dp),
                    )
                }
                Text("${cp.score}", color = color, fontWeight = FontWeight.Black, fontSize = 22.sp)
            }
            // バー
            Spacer(Modifier.height(6.dp))
            Box(Modifier.fillMaxWidth().height(6.dp)
                .clip(RoundedCornerShape(3.dp)).background(Color(0xFF0D1F0D))) {
                Box(Modifier.fillMaxWidth(cp.score / 100f).fillMaxHeight()
                    .clip(RoundedCornerShape(3.dp)).background(color))
            }
            AnimatedVisibility(visible = expanded) {
                Column(Modifier.padding(top = 8.dp)) {
                    Text("計測: ${cp.measuredText}　理想: ${cp.idealText}",
                        color = Color.Gray, style = MaterialTheme.typography.labelSmall)
                    Spacer(Modifier.height(4.dp))
                    Text(cp.adviceJa, color = Color.White,
                        style = MaterialTheme.typography.bodySmall, lineHeight = 18.sp)
                }
            }
        }
    }
}

@Composable
private fun PastComparisonSelector(
    lessons: List<LessonReport>,
    selected: LessonReport?,
    onSelect: (LessonReport?) -> Unit,
) {
    Card(colors = CardDefaults.cardColors(containerColor = Color(0xFF0D2C4D))) {
        Column(Modifier.padding(12.dp)) {
            Text("🔄 過去の自分と比較", color = Color(0xFF42A5F5),
                fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleSmall)
            Text("同じショットの過去レッスンを選ぶと、各項目の差分が表示されます",
                color = Color.Gray, style = MaterialTheme.typography.labelSmall)
            Spacer(Modifier.height(8.dp))
            Row(Modifier.horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                ComparisonChip("比較なし", selected == null) { onSelect(null) }
                lessons.forEach { l ->
                    val label = java.text.SimpleDateFormat("M/d HH:mm", java.util.Locale.JAPAN)
                        .format(java.util.Date(l.createdAt))
                    ComparisonChip("$label (${(l.averageScore * 100).toInt()}点)",
                        selected?.lessonId == l.lessonId) { onSelect(l) }
                }
            }
        }
    }
}

@Composable
private fun ComparisonChip(label: String, selected: Boolean, onClick: () -> Unit) {
    Box(Modifier.clip(RoundedCornerShape(16.dp))
        .background(if (selected) Color(0xFF1565C0) else Color(0xFF0D2C2C))
        .border(1.dp, if (selected) Color(0xFF42A5F5) else Color.Transparent,
            RoundedCornerShape(16.dp))
        .clickable(onClick = onClick)
        .padding(horizontal = 12.dp, vertical = 6.dp)) {
        Text(label, color = Color.White, style = MaterialTheme.typography.labelSmall)
    }
}

@Composable
private fun DrillCard(drill: RecommendedDrill) {
    Card(colors = CardDefaults.cardColors(containerColor = Color(0xFF1A2E1A))) {
        Column(Modifier.padding(14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Surface(color = Color(0xFF2E7D32), shape = RoundedCornerShape(6.dp)) {
                    Text("優先${drill.priority}", color = Color.White,
                        modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
                        style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold)
                }
                Spacer(Modifier.width(8.dp))
                Text(drill.titleJa, color = Color.White, fontWeight = FontWeight.Bold,
                    style = MaterialTheme.typography.bodyMedium)
            }
            Spacer(Modifier.height(6.dp))
            Text(drill.descriptionJa, color = Color.White.copy(alpha = 0.9f),
                style = MaterialTheme.typography.bodySmall, lineHeight = 18.sp)
            Spacer(Modifier.height(4.dp))
            Text("理由: ${drill.reasonJa}", color = Color.Gray,
                style = MaterialTheme.typography.labelSmall)
            Spacer(Modifier.height(4.dp))
            Text("🎾 ${drill.recommendedReps}球 ・ 約${drill.estimatedMinutes}分",
                color = Color(0xFF4CAF50), style = MaterialTheme.typography.labelSmall,
                fontWeight = FontWeight.Bold)
        }
    }
}
