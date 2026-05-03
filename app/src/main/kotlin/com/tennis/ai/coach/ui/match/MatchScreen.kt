package com.tennis.ai.coach.ui.match

import androidx.compose.animation.*
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
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
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.tennis.ai.coach.data.model.*
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MatchScreen(
    matchTypeStr: String,
    viewModel: MatchViewModel = hiltViewModel(),
    onMatchEnd: (String) -> Unit,
    onBack: () -> Unit
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope()
    var showEndDialog by remember { mutableStateOf(false) }

    LaunchedEffect(matchTypeStr) {
        val matchType = runCatching { MatchType.valueOf(matchTypeStr) }.getOrDefault(MatchType.SINGLES)
        viewModel.initMatchType(matchType)
        viewModel.requestAdvice()
    }

    if (showEndDialog) {
        AlertDialog(
            onDismissRequest = { showEndDialog = false },
            title = { Text("試合終了") },
            text = { Text("試合を終了してレポートを生成しますか？") },
            confirmButton = {
                TextButton(onClick = {
                    scope.launch {
                        val matchId = viewModel.endMatch()
                        onMatchEnd(matchId)
                    }
                }) { Text("終了する") }
            },
            dismissButton = {
                TextButton(onClick = { showEndDialog = false }) { Text("キャンセル") }
            }
        )
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(uiState.matchType.displayNameJa + " 試合中") },
                navigationIcon = {
                    IconButton(onClick = onBack) { Icon(Icons.Default.ArrowBack, null) }
                },
                actions = {
                    Text(
                        formatElapsed(uiState.elapsedSeconds),
                        modifier = Modifier.padding(end = 8.dp),
                        style = MaterialTheme.typography.bodyMedium
                    )
                    IconButton(onClick = { showEndDialog = true }) {
                        Icon(Icons.Default.Stop, contentDescription = "試合終了", tint = Color(0xFFEF5350))
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Color(0xFF0D1F0D))
            )
        },
        containerColor = Color(0xFF0A1A0A)
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            // スコアボード
            ScoreBoard(
                playerScore = uiState.playerScore,
                opponentScore = uiState.opponentScore,
                phase = uiState.phase,
                servingPlayer = uiState.servingPlayer,
                onPlayerScore = viewModel::playerScorePoint,
                onOpponentScore = viewModel::opponentScorePoint
            )

            // チェンジオーバー中
            if (uiState.isChangeover) {
                ChangeoverPanel(secondsLeft = uiState.changeoverSecondsLeft)
            }

            // 緊急アラート（相手の癖検知）
            AnimatedVisibility(
                visible = uiState.urgentAlert != null,
                enter = slideInVertically() + fadeIn(),
                exit = slideOutVertically() + fadeOut()
            ) {
                uiState.urgentAlert?.let { habit ->
                    HabitAlertBanner(habit = habit)
                }
            }

            // フォームメトリクス（打点・スイング速度）
            uiState.poseMetrics?.let { metrics ->
                PoseMetricsCard(metrics = metrics)
            }

            // 着弾点ARオーバーレイ（ミニコート俯瞰）
            BallLandingMapCard(landings = uiState.ballLandingHistory)

            // ダブルス陣形チェッカー
            if (uiState.matchType == MatchType.DOUBLES) {
                uiState.doublesFormation?.let { formation ->
                    DoublesFormationCard(formation = formation)
                }
            }

            // AIアドバイスカード（最優先表示）
            AnimatedVisibility(visible = uiState.currentAdvice != null) {
                uiState.currentAdvice?.let { advice ->
                    AdviceCard(advice = advice, onRefresh = viewModel::requestAdvice)
                }
            }
        }
    }
}

// ── スコアボード ─────────────────────────────────────────────

@Composable
private fun ScoreBoard(
    playerScore: ScoreState,
    opponentScore: ScoreState,
    phase: MatchPhase,
    servingPlayer: ServingPlayer,
    onPlayerScore: () -> Unit,
    onOpponentScore: () -> Unit
) {
    Card(
        colors = CardDefaults.cardColors(containerColor = Color(0xFF1A2E1A)),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(modifier = Modifier.padding(12.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                // プレイヤー側
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        if (servingPlayer == ServingPlayer.PLAYER) {
                            Icon(Icons.Default.SportsTennis, null, tint = Color(0xFFF9A825),
                                modifier = Modifier.size(14.dp))
                            Spacer(Modifier.width(4.dp))
                        }
                        Text("あなた", color = Color.White, fontWeight = FontWeight.Bold)
                    }
                    Text(
                        playerScore.games.toString(),
                        color = Color(0xFF4CAF50), fontSize = 48.sp, fontWeight = FontWeight.Black
                    )
                    Text(playerScore.points.display, color = Color.White, fontSize = 20.sp)
                    Spacer(Modifier.height(8.dp))
                    Button(
                        onClick = onPlayerScore,
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF2E7D32))
                    ) { Text("+1 ポイント") }
                }

                // フェーズ表示
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("vs", color = Color.Gray)
                    Spacer(Modifier.height(4.dp))
                    if (phase != MatchPhase.POINT) {
                        Surface(
                            color = Color(0xFFF9A825).copy(alpha = 0.2f),
                            shape = RoundedCornerShape(8.dp)
                        ) {
                            Text(
                                phase.displayNameJa,
                                color = Color(0xFFF9A825),
                                modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                                style = MaterialTheme.typography.labelSmall
                            )
                        }
                    }
                }

                // 相手側
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        if (servingPlayer == ServingPlayer.OPPONENT) {
                            Icon(Icons.Default.SportsTennis, null, tint = Color(0xFFF9A825),
                                modifier = Modifier.size(14.dp))
                            Spacer(Modifier.width(4.dp))
                        }
                        Text("相手", color = Color.White, fontWeight = FontWeight.Bold)
                    }
                    Text(
                        opponentScore.games.toString(),
                        color = Color(0xFFEF5350), fontSize = 48.sp, fontWeight = FontWeight.Black
                    )
                    Text(opponentScore.points.display, color = Color.White, fontSize = 20.sp)
                    Spacer(Modifier.height(8.dp))
                    Button(
                        onClick = onOpponentScore,
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFC62828))
                    ) { Text("+1 ポイント") }
                }
            }
        }
    }
}

// ── チェンジオーバーパネル ─────────────────────────────────────

@Composable
private fun ChangeoverPanel(secondsLeft: Int) {
    Card(
        colors = CardDefaults.cardColors(containerColor = Color(0xFF1565C0)),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text("チェンジオーバー", color = Color.White, fontWeight = FontWeight.Bold,
                style = MaterialTheme.typography.titleMedium)
            Text("$secondsLeft 秒", color = Color(0xFFF9A825), fontSize = 36.sp,
                fontWeight = FontWeight.Black)
            Text("コートを移動してください", color = Color.White.copy(alpha = 0.7f),
                style = MaterialTheme.typography.bodySmall)
        }
    }
}

// ── 相手癖アラート ─────────────────────────────────────────────

@Composable
private fun HabitAlertBanner(habit: OpponentHabit) {
    Card(
        colors = CardDefaults.cardColors(containerColor = Color(0xFFB71C1C)),
        modifier = Modifier.fillMaxWidth()
    ) {
        Row(modifier = Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Default.Warning, null, tint = Color(0xFFF9A825),
                modifier = Modifier.size(24.dp))
            Spacer(Modifier.width(8.dp))
            Column {
                Text("相手の癖を検知！", color = Color(0xFFF9A825), fontWeight = FontWeight.Bold,
                    style = MaterialTheme.typography.labelMedium)
                Text(habit.description, color = Color.White,
                    style = MaterialTheme.typography.bodySmall)
            }
            Spacer(Modifier.weight(1f))
            Text("${(habit.confidence * 100).toInt()}%", color = Color(0xFFF9A825),
                fontWeight = FontWeight.Bold)
        }
    }
}

// ── フォームメトリクス ─────────────────────────────────────────

@Composable
private fun PoseMetricsCard(metrics: PoseMetrics) {
    Card(
        colors = CardDefaults.cardColors(containerColor = Color(0xFF1B1B2F)),
        modifier = Modifier.fillMaxWidth()
    ) {
        Row(
            modifier = Modifier.padding(12.dp),
            horizontalArrangement = Arrangement.SpaceAround
        ) {
            MetricItem(
                label = "スイング速度",
                value = "${metrics.swingSpeedKmh.toInt()} km/h",
                isWarning = false
            )
            MetricItem(
                label = "打点高さ",
                value = "${metrics.impactHeightCm.toInt()} cm",
                isWarning = metrics.impactHeightCm < 80f
            )
            MetricItem(
                label = "膝の角度",
                value = "${metrics.kneeAngleDeg.toInt()}°",
                isWarning = metrics.kneeAngleDeg > 170f
            )
        }
        if (metrics.impactHeightCm < 80f) {
            Text(
                "⚠ 打点が下がっています。足を一歩踏み込んで！",
                color = Color(0xFFEF5350),
                modifier = Modifier.padding(horizontal = 12.dp, vertical = 4.dp),
                style = MaterialTheme.typography.labelSmall
            )
        }
    }
}

@Composable
private fun MetricItem(label: String, value: String, isWarning: Boolean) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(label, color = Color.Gray, style = MaterialTheme.typography.labelSmall)
        Text(
            value,
            color = if (isWarning) Color(0xFFEF5350) else Color(0xFF4CAF50),
            fontWeight = FontWeight.Bold,
            style = MaterialTheme.typography.bodyMedium
        )
    }
}

// ── 着弾点マップ ───────────────────────────────────────────────

@Composable
private fun BallLandingMapCard(landings: List<BallLandingPoint>) {
    Card(
        colors = CardDefaults.cardColors(containerColor = Color(0xFF0D1F0D)),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(modifier = Modifier.padding(8.dp)) {
            Text("着弾点マップ", color = Color.Gray, style = MaterialTheme.typography.labelSmall,
                modifier = Modifier.padding(bottom = 4.dp))
            Canvas(modifier = Modifier
                .fillMaxWidth()
                .height(90.dp)) {
                drawCourtOutline()
                landings.forEachIndexed { idx, pt ->
                    val alpha = (idx + 1).toFloat() / landings.size.coerceAtLeast(1)
                    val color = when (pt.zone) {
                        CourtZone.OUT -> Color(0xFFEF5350)
                        CourtZone.NET -> Color(0xFFF9A825)
                        else -> Color(0xFF4CAF50)
                    }
                    drawCircle(
                        color = color.copy(alpha = alpha),
                        radius = 6f,
                        center = Offset(pt.x * size.width, pt.y * size.height)
                    )
                }
            }
        }
    }
}

private fun DrawScope.drawCourtOutline() {
    val w = size.width; val h = size.height
    val paint = Color(0xFF2E7D32)
    // コートの外枠
    drawRect(color = paint.copy(alpha = 0.3f))
    // ネット
    drawLine(color = Color.White.copy(alpha = 0.5f), start = Offset(0f, h / 2), end = Offset(w, h / 2), strokeWidth = 2f)
    // センターライン
    drawLine(color = Color.White.copy(alpha = 0.3f), start = Offset(w / 2, 0f), end = Offset(w / 2, h), strokeWidth = 1f)
    // サービスライン
    drawLine(color = Color.White.copy(alpha = 0.3f), start = Offset(0f, h * 0.25f), end = Offset(w, h * 0.25f), strokeWidth = 1f)
    drawLine(color = Color.White.copy(alpha = 0.3f), start = Offset(0f, h * 0.75f), end = Offset(w, h * 0.75f), strokeWidth = 1f)
}

// ── ダブルス陣形カード ─────────────────────────────────────────

@Composable
private fun DoublesFormationCard(formation: DoublesFormation) {
    Card(
        colors = CardDefaults.cardColors(
            containerColor = if (formation.isCenterGapOpen || formation.isPartnerTooBack)
                Color(0xFF4A1A00) else Color(0xFF1A2E1A)
        ),
        modifier = Modifier.fillMaxWidth()
    ) {
        Row(modifier = Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(
                if (formation.isCenterGapOpen || formation.isPartnerTooBack)
                    Icons.Default.Warning else Icons.Default.CheckCircle,
                null,
                tint = if (formation.isCenterGapOpen) Color(0xFFEF5350) else Color(0xFF4CAF50)
            )
            Spacer(Modifier.width(8.dp))
            Column {
                Text("陣形チェック", color = Color.Gray, style = MaterialTheme.typography.labelSmall)
                Text(
                    when {
                        formation.isCenterGapOpen -> "センターが空きすぎ！詰めてください"
                        formation.isPartnerTooBack -> "前衛が下がりすぎ。ネット前へ！"
                        else -> "${formation.recommendedFormation.displayNameJa} — 良い陣形です"
                    },
                    color = Color.White,
                    style = MaterialTheme.typography.bodySmall,
                    fontWeight = FontWeight.Bold
                )
            }
        }
    }
}

// ── アドバイスカード ───────────────────────────────────────────

@Composable
private fun AdviceCard(advice: TacticalAdvice, onRefresh: () -> Unit) {
    val bgColor = when (advice.urgency) {
        AdviceUrgency.IMMEDIATE -> Color(0xFF4A1A00)
        AdviceUrgency.NORMAL -> Color(0xFF1A2E3A)
        AdviceUrgency.CHANGEOVER -> Color(0xFF1A1A2E)
    }
    Card(
        colors = CardDefaults.cardColors(containerColor = bgColor),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(modifier = Modifier.padding(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(advice.category.emoji, fontSize = 20.sp)
                Spacer(Modifier.width(8.dp))
                Text(advice.title, color = Color(0xFFF9A825), fontWeight = FontWeight.Bold,
                    style = MaterialTheme.typography.titleSmall, modifier = Modifier.weight(1f))
                Surface(
                    color = when (advice.urgency) {
                        AdviceUrgency.IMMEDIATE -> Color(0xFFEF5350)
                        AdviceUrgency.NORMAL -> Color(0xFF1565C0)
                        AdviceUrgency.CHANGEOVER -> Color(0xFF424242)
                    },
                    shape = RoundedCornerShape(4.dp)
                ) {
                    Text(
                        advice.urgency.displayNameJa,
                        color = Color.White,
                        modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
                        style = MaterialTheme.typography.labelSmall
                    )
                }
            }
            Spacer(Modifier.height(6.dp))
            Text(advice.body, color = Color.White, style = MaterialTheme.typography.bodyMedium,
                lineHeight = 22.sp)

            advice.servePlacementImage?.let { pattern ->
                Spacer(Modifier.height(6.dp))
                Surface(
                    color = Color.White.copy(alpha = 0.1f),
                    shape = RoundedCornerShape(8.dp)
                ) {
                    Row(modifier = Modifier.padding(8.dp)) {
                        Text("🎯 ", fontSize = 16.sp)
                        Column {
                            Text(
                                "${pattern.targetZone.displayNameJa}へ${pattern.ballType.displayNameJa}",
                                color = Color(0xFFF9A825), fontWeight = FontWeight.Bold,
                                style = MaterialTheme.typography.bodySmall
                            )
                            Text(
                                "成功率 ${pattern.successRatePercent}%　速度:${pattern.speedRecommendation.displayNameJa}",
                                color = Color.Gray,
                                style = MaterialTheme.typography.labelSmall
                            )
                        }
                    }
                }
            }

            Spacer(Modifier.height(6.dp))
            Row(horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth()) {
                Text(
                    "確信度 ${(advice.confidence * 100).toInt()}%",
                    color = Color.Gray, style = MaterialTheme.typography.labelSmall
                )
                TextButton(onClick = onRefresh, contentPadding = PaddingValues(0.dp)) {
                    Text("更新", style = MaterialTheme.typography.labelSmall)
                }
            }
        }
    }
}

private fun formatElapsed(totalSeconds: Long): String {
    val h = totalSeconds / 3600
    val m = (totalSeconds % 3600) / 60
    val s = totalSeconds % 60
    return if (h > 0) "%d:%02d:%02d".format(h, m, s) else "%02d:%02d".format(m, s)
}
