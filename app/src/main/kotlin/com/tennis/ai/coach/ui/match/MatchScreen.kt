package com.tennis.ai.coach.ui.match

import android.view.ViewGroup
import androidx.camera.view.PreviewView
import androidx.compose.animation.*
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
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
    val lifecycleOwner = LocalLifecycleOwner.current
    val context = LocalContext.current
    var showEndDialog by remember { mutableStateOf(false) }
    var showCameraPreview by remember { mutableStateOf(false) }

    // カメラ接続
    val previewView = remember {
        PreviewView(context).apply {
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
            scaleType = PreviewView.ScaleType.FILL_CENTER
        }
    }
    DisposableEffect(lifecycleOwner) {
        viewModel.startCamera(lifecycleOwner, previewView)
        onDispose { }
    }

    LaunchedEffect(matchTypeStr) {
        val matchType = runCatching { MatchType.valueOf(matchTypeStr) }.getOrDefault(MatchType.SINGLES)
        viewModel.initMatchType(matchType)
    }

    // 試合前セットアップダイアログ
    if (uiState.showSetupDialog) {
        PreMatchSetupDialog(
            matchType = uiState.matchType,
            onConfirm = { opponentName, opponentLevel, partnerName ->
                viewModel.setupMatch(opponentName, opponentLevel, partnerName)
            }
        )
    }

    // 試合終了確認ダイアログ
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
                }) { Text("終了する", color = Color(0xFFEF5350)) }
            },
            dismissButton = {
                TextButton(onClick = { showEndDialog = false }) { Text("キャンセル") }
            },
            containerColor = Color(0xFF1A2E1A)
        )
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text(uiState.matchType.displayNameJa + " 試合中", style = MaterialTheme.typography.titleMedium)
                        if (!uiState.showSetupDialog) {
                            Text(
                                "vs ${uiState.opponentName}" + if (uiState.matchType == MatchType.DOUBLES) " ／ 味方: ${uiState.partnerName}" else "",
                                style = MaterialTheme.typography.labelSmall,
                                color = Color.Gray
                            )
                        }
                    }
                },
                navigationIcon = {
                    IconButton(onClick = onBack) { Icon(Icons.Default.ArrowBack, null) }
                },
                actions = {
                    if (!uiState.showSetupDialog) {
                        Text(
                            formatElapsed(uiState.elapsedSeconds),
                            modifier = Modifier.padding(end = 4.dp),
                            style = MaterialTheme.typography.bodySmall,
                            color = Color(0xFF4CAF50)
                        )
                        // カメラ状態インジケーター
                        Icon(
                            if (uiState.isCameraActive) Icons.Default.Videocam else Icons.Default.VideocamOff,
                            contentDescription = "カメラ",
                            tint = if (uiState.isCameraActive) Color(0xFF4CAF50) else Color.Gray,
                            modifier = Modifier
                                .size(20.dp)
                                .clickable { showCameraPreview = !showCameraPreview }
                                .padding(end = 4.dp)
                        )
                        IconButton(onClick = { showEndDialog = true }) {
                            Icon(Icons.Default.Stop, contentDescription = "試合終了", tint = Color(0xFFEF5350))
                        }
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
                .verticalScroll(rememberScrollState())
                .padding(10.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            // カメラプレビュー（トグルで表示）
            AnimatedVisibility(visible = showCameraPreview && uiState.isCameraActive) {
                Card(
                    colors = CardDefaults.cardColors(containerColor = Color.Black),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    AndroidView(
                        factory = { previewView },
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(160.dp)
                    )
                }
            }

            // チェンジオーバー中は分析パネルを優先表示
            if (uiState.isChangeover && !uiState.showSetupDialog) {
                ChangeoverAnalysisPanel(
                    secondsLeft = uiState.changeoverSecondsLeft,
                    tactics = uiState.changeoverTactics,
                    playerScore = uiState.playerScore,
                    opponentScore = uiState.opponentScore,
                    landingHistory = uiState.ballLandingHistory,
                    onSelectTactic = viewModel::selectTactic
                )
            } else if (!uiState.showSetupDialog) {
                // スコアボード
                ScoreBoard(
                    playerScore = uiState.playerScore,
                    opponentScore = uiState.opponentScore,
                    phase = uiState.phase,
                    servingPlayer = uiState.servingPlayer,
                    playerName = "あなた",
                    opponentName = uiState.opponentName,
                    onPlayerScore = viewModel::playerScorePoint,
                    onOpponentScore = viewModel::opponentScorePoint
                )

                // 緊急アラート
                AnimatedVisibility(
                    visible = uiState.urgentAlert != null,
                    enter = slideInVertically() + fadeIn(),
                    exit = slideOutVertically() + fadeOut()
                ) {
                    uiState.urgentAlert?.let { HabitAlertBanner(habit = it) }
                }

                // フォームメトリクス
                uiState.poseMetrics?.let { PoseMetricsCard(metrics = it) }

                // 着弾点マップ
                BallLandingMapCard(landings = uiState.ballLandingHistory)

                // ダブルス陣形
                if (uiState.matchType == MatchType.DOUBLES) {
                    uiState.doublesFormation?.let { DoublesFormationCard(formation = it) }
                }

                // AIアドバイスカード
                AnimatedVisibility(visible = uiState.currentAdvice != null) {
                    uiState.currentAdvice?.let { advice ->
                        AdviceCard(advice = advice, onRefresh = viewModel::requestAdvice)
                    }
                }
            }
        }
    }
}

// ── 試合前セットアップ ─────────────────────────────────────────

@Composable
private fun PreMatchSetupDialog(
    matchType: MatchType,
    onConfirm: (String, PlayerLevel, String) -> Unit
) {
    var opponentName by remember { mutableStateOf("") }
    var partnerName by remember { mutableStateOf("") }
    var selectedLevel by remember { mutableStateOf(PlayerLevel.INTERMEDIATE) }

    AlertDialog(
        onDismissRequest = {},
        title = {
            Text("試合前セットアップ", fontWeight = FontWeight.Bold,
                style = MaterialTheme.typography.titleLarge)
        },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text("試合情報を入力してください", color = Color.Gray,
                    style = MaterialTheme.typography.bodySmall)

                // 相手の名前
                OutlinedTextField(
                    value = opponentName,
                    onValueChange = { opponentName = it },
                    label = { Text("相手の名前（任意）") },
                    placeholder = { Text("例：田中さん") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = Color(0xFF4CAF50),
                        unfocusedBorderColor = Color.Gray
                    )
                )

                // ダブルスの場合：パートナー名
                if (matchType == MatchType.DOUBLES) {
                    OutlinedTextField(
                        value = partnerName,
                        onValueChange = { partnerName = it },
                        label = { Text("パートナーの名前（任意）") },
                        placeholder = { Text("例：山田さん") },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true,
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedBorderColor = Color(0xFF4CAF50),
                            unfocusedBorderColor = Color.Gray
                        )
                    )
                }

                // 相手のレベル選択
                Text("相手の推定レベル", style = MaterialTheme.typography.labelMedium, color = Color.Gray)
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    PlayerLevel.values().forEach { level ->
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(8.dp))
                                .background(if (selectedLevel == level) Color(0xFF2E7D32) else Color(0xFF1A2E1A))
                                .clickable { selectedLevel = level }
                                .padding(horizontal = 12.dp, vertical = 8.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            RadioButton(
                                selected = selectedLevel == level,
                                onClick = { selectedLevel = level },
                                colors = RadioButtonDefaults.colors(selectedColor = Color(0xFF4CAF50))
                            )
                            Spacer(Modifier.width(8.dp))
                            Column {
                                Text(level.displayNameJa, color = Color.White,
                                    fontWeight = if (selectedLevel == level) FontWeight.Bold else FontWeight.Normal)
                                Text(levelDescription(level), color = Color.Gray,
                                    style = MaterialTheme.typography.labelSmall)
                            }
                        }
                    }
                }
            }
        },
        confirmButton = {
            Button(
                onClick = { onConfirm(opponentName, selectedLevel, partnerName) },
                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF2E7D32))
            ) { Text("試合開始！", fontWeight = FontWeight.Bold) }
        },
        containerColor = Color(0xFF0D1F0D)
    )
}

private fun levelDescription(level: PlayerLevel) = when (level) {
    PlayerLevel.BEGINNER -> "テニスを始めて間もない"
    PlayerLevel.INTERMEDIATE -> "ラリーが続けられる"
    PlayerLevel.ADVANCED_INTERMEDIATE -> "試合経験が豊富"
    PlayerLevel.ADVANCED -> "県大会レベル"
    PlayerLevel.COMPETITIVE -> "全国・国際レベル"
}

// ── スコアボード ─────────────────────────────────────────────

@Composable
private fun ScoreBoard(
    playerScore: ScoreState,
    opponentScore: ScoreState,
    phase: MatchPhase,
    servingPlayer: ServingPlayer,
    playerName: String,
    opponentName: String,
    onPlayerScore: () -> Unit,
    onOpponentScore: () -> Unit
) {
    Card(
        colors = CardDefaults.cardColors(containerColor = Color(0xFF1A2E1A)),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {

            // フェーズ表示
            if (phase != MatchPhase.POINT) {
                Box(
                    modifier = Modifier.fillMaxWidth(),
                    contentAlignment = Alignment.Center
                ) {
                    Surface(
                        color = phaseColor(phase).copy(alpha = 0.25f),
                        shape = RoundedCornerShape(8.dp)
                    ) {
                        Text(
                            phase.displayNameJa,
                            color = phaseColor(phase),
                            modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp),
                            style = MaterialTheme.typography.labelMedium,
                            fontWeight = FontWeight.Bold
                        )
                    }
                }
            }

            // セットスコア
            if (playerScore.sets.isNotEmpty()) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.Center
                ) {
                    playerScore.sets.zip(opponentScore.sets).forEachIndexed { idx, (p, o) ->
                        val playerWon = p > o
                        Surface(
                            color = Color.White.copy(alpha = 0.05f),
                            shape = RoundedCornerShape(4.dp),
                            modifier = Modifier.padding(horizontal = 4.dp)
                        ) {
                            Row(modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp)) {
                                Text(
                                    "$p",
                                    color = if (playerWon) Color(0xFF4CAF50) else Color.Gray,
                                    fontWeight = if (playerWon) FontWeight.Bold else FontWeight.Normal,
                                    style = MaterialTheme.typography.bodySmall
                                )
                                Text("-", color = Color.Gray, style = MaterialTheme.typography.bodySmall)
                                Text(
                                    "$o",
                                    color = if (!playerWon) Color(0xFFEF5350) else Color.Gray,
                                    fontWeight = if (!playerWon) FontWeight.Bold else FontWeight.Normal,
                                    style = MaterialTheme.typography.bodySmall
                                )
                            }
                        }
                    }
                }
            }

            // メインスコア（ゲーム）
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                // プレイヤー側
                PlayerScoreColumn(
                    name = playerName,
                    games = playerScore.games,
                    points = playerScore.points,
                    isServing = servingPlayer == ServingPlayer.PLAYER,
                    isPlayer = true,
                    onClick = onPlayerScore
                )

                // 中央
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(4.dp)
                ) {
                    Text("G", color = Color.Gray, style = MaterialTheme.typography.labelSmall)
                    Text("vs", color = Color.Gray, fontSize = 20.sp, fontWeight = FontWeight.Black)
                    Text("P", color = Color.Gray, style = MaterialTheme.typography.labelSmall)
                }

                // 相手側
                PlayerScoreColumn(
                    name = opponentName,
                    games = opponentScore.games,
                    points = opponentScore.points,
                    isServing = servingPlayer == ServingPlayer.OPPONENT,
                    isPlayer = false,
                    onClick = onOpponentScore
                )
            }
        }
    }
}

@Composable
private fun PlayerScoreColumn(
    name: String,
    games: Int,
    points: TennisPoint,
    isServing: Boolean,
    isPlayer: Boolean,
    onClick: () -> Unit
) {
    val mainColor = if (isPlayer) Color(0xFF4CAF50) else Color(0xFFEF5350)
    val btnColor = if (isPlayer) Color(0xFF2E7D32) else Color(0xFFC62828)

    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(4.dp),
        modifier = Modifier.width(130.dp)
    ) {
        // 名前 + サーブマーカー
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.Center) {
            if (isServing) {
                Icon(Icons.Default.SportsTennis, null, tint = Color(0xFFF9A825),
                    modifier = Modifier.size(12.dp))
                Spacer(Modifier.width(2.dp))
            }
            Text(name, color = Color.White, fontWeight = FontWeight.Medium,
                style = MaterialTheme.typography.bodyMedium, textAlign = TextAlign.Center)
        }
        // ゲーム数
        Text(
            games.toString(),
            color = mainColor, fontSize = 52.sp, fontWeight = FontWeight.Black,
            lineHeight = 52.sp
        )
        // ポイント
        Text(
            points.display,
            color = Color.White.copy(alpha = 0.9f), fontSize = 22.sp, fontWeight = FontWeight.Bold
        )
        // +1ポイントボタン
        Button(
            onClick = onClick,
            colors = ButtonDefaults.buttonColors(containerColor = btnColor),
            modifier = Modifier.fillMaxWidth(),
            contentPadding = PaddingValues(vertical = 10.dp)
        ) {
            Icon(Icons.Default.Add, contentDescription = null, modifier = Modifier.size(16.dp))
            Spacer(Modifier.width(4.dp))
            Text("ポイント", fontWeight = FontWeight.Bold, style = MaterialTheme.typography.bodyMedium)
        }
    }
}

private fun phaseColor(phase: MatchPhase) = when (phase) {
    MatchPhase.MATCH_POINT, MatchPhase.BREAK_POINT -> Color(0xFFEF5350)
    MatchPhase.GAME_POINT, MatchPhase.SET_POINT -> Color(0xFFF9A825)
    MatchPhase.CHANGEOVER -> Color(0xFF1565C0)
    MatchPhase.TIEBREAK -> Color(0xFFAB47BC)
    else -> Color.Gray
}

// ── チェンジオーバー分析パネル ────────────────────────────────

@Composable
private fun ChangeoverAnalysisPanel(
    secondsLeft: Int,
    tactics: List<ChangeoverTactic>,
    playerScore: ScoreState,
    opponentScore: ScoreState,
    landingHistory: List<BallLandingPoint>,
    onSelectTactic: (Int) -> Unit
) {
    var expandedIndex by remember { mutableStateOf(-1) }

    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        // タイマーヘッダー
        Card(
            colors = CardDefaults.cardColors(containerColor = Color(0xFF0D47A1)),
            modifier = Modifier.fillMaxWidth()
        ) {
            Row(
                modifier = Modifier.padding(12.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Column {
                    Text("チェンジオーバー", color = Color.White, fontWeight = FontWeight.Bold,
                        style = MaterialTheme.typography.titleMedium)
                    Text("次のゲームの戦術を選んでください", color = Color.White.copy(alpha = 0.7f),
                        style = MaterialTheme.typography.bodySmall)
                }
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(
                        "$secondsLeft",
                        color = if (secondsLeft <= 20) Color(0xFFEF5350) else Color(0xFFF9A825),
                        fontSize = 36.sp, fontWeight = FontWeight.Black
                    )
                    Text("秒", color = Color.White.copy(alpha = 0.7f),
                        style = MaterialTheme.typography.labelSmall)
                }
            }
        }

        // ここまでの着弾点マップ
        Card(
            colors = CardDefaults.cardColors(containerColor = Color(0xFF0D1F0D)),
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(modifier = Modifier.padding(8.dp)) {
                Text("このゲームの着弾点", color = Color.Gray,
                    style = MaterialTheme.typography.labelSmall,
                    modifier = Modifier.padding(bottom = 4.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Canvas(modifier = Modifier.weight(1f).height(80.dp)) {
                        drawCourtOutline()
                        landingHistory.forEachIndexed { idx, pt ->
                            val alpha = (idx + 1).toFloat() / landingHistory.size.coerceAtLeast(1)
                            val color = when (pt.zone) {
                                CourtZone.OUT -> Color(0xFFEF5350)
                                CourtZone.NET -> Color(0xFFF9A825)
                                else -> Color(0xFF4CAF50)
                            }
                            drawCircle(color = color.copy(alpha = alpha), radius = 5f,
                                center = Offset(pt.x * size.width, pt.y * size.height))
                        }
                    }
                    Column(
                        modifier = Modifier.padding(start = 12.dp),
                        verticalArrangement = Arrangement.spacedBy(4.dp)
                    ) {
                        val inCount = landingHistory.count { it.isInCourt }
                        val outCount = landingHistory.size - inCount
                        Text("IN: $inCount", color = Color(0xFF4CAF50),
                            style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.Bold)
                        Text("OUT: $outCount", color = Color(0xFFEF5350),
                            style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.Bold)
                        Text("合計: ${landingHistory.size}", color = Color.Gray,
                            style = MaterialTheme.typography.labelSmall)
                    }
                }
            }
        }

        // 戦術選択カード
        Text(
            "次のゲームの戦術を選択（複数選択可）",
            color = Color(0xFFF9A825),
            fontWeight = FontWeight.Bold,
            style = MaterialTheme.typography.titleSmall
        )

        tactics.forEachIndexed { index, tactic ->
            TacticCard(
                tactic = tactic,
                isExpanded = expandedIndex == index,
                onToggleExpand = { expandedIndex = if (expandedIndex == index) -1 else index },
                onSelect = { onSelectTactic(index) }
            )
        }
    }
}

@Composable
private fun TacticCard(
    tactic: ChangeoverTactic,
    isExpanded: Boolean,
    onToggleExpand: () -> Unit,
    onSelect: () -> Unit
) {
    val borderColor = if (tactic.isSelected) Color(0xFF4CAF50) else Color.Transparent
    val bgColor = when {
        tactic.isSelected -> Color(0xFF1A3A1A)
        else -> Color(0xFF1A1A2A)
    }

    Card(
        colors = CardDefaults.cardColors(containerColor = bgColor),
        modifier = Modifier
            .fillMaxWidth()
            .border(width = if (tactic.isSelected) 2.dp else 0.dp, color = borderColor, shape = RoundedCornerShape(12.dp))
    ) {
        Column(modifier = Modifier.padding(12.dp)) {
            // ヘッダー行
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.clickable { onToggleExpand() }
            ) {
                Text(tactic.emoji, fontSize = 24.sp)
                Spacer(Modifier.width(8.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(tactic.title, color = Color.White, fontWeight = FontWeight.Bold,
                            style = MaterialTheme.typography.titleSmall)
                        Spacer(Modifier.width(6.dp))
                        Surface(
                            color = Color(0xFF2A2A3A),
                            shape = RoundedCornerShape(4.dp)
                        ) {
                            Text(tactic.category, color = Color(0xFFF9A825),
                                modifier = Modifier.padding(horizontal = 6.dp, vertical = 1.dp),
                                style = MaterialTheme.typography.labelSmall)
                        }
                    }
                    Text(tactic.shortDesc, color = Color.Gray,
                        style = MaterialTheme.typography.bodySmall)
                }
                Icon(
                    if (isExpanded) Icons.Default.ExpandLess else Icons.Default.ExpandMore,
                    contentDescription = null,
                    tint = Color.Gray,
                    modifier = Modifier.size(20.dp)
                )
            }

            // 展開時：詳細説明
            AnimatedVisibility(visible = isExpanded) {
                Column(modifier = Modifier.padding(top = 10.dp)) {
                    HorizontalDivider(color = Color.White.copy(alpha = 0.1f))
                    Spacer(Modifier.height(8.dp))
                    Text(
                        tactic.detailedExplanation,
                        color = Color.White.copy(alpha = 0.9f),
                        style = MaterialTheme.typography.bodySmall,
                        lineHeight = 20.sp
                    )
                    Spacer(Modifier.height(10.dp))
                    Button(
                        onClick = { onSelect(); onToggleExpand() },
                        colors = ButtonDefaults.buttonColors(
                            containerColor = if (tactic.isSelected) Color(0xFF388E3C) else Color(0xFF1565C0)
                        ),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Icon(
                            if (tactic.isSelected) Icons.Default.CheckCircle else Icons.Default.RadioButtonUnchecked,
                            contentDescription = null, modifier = Modifier.size(16.dp)
                        )
                        Spacer(Modifier.width(6.dp))
                        Text(if (tactic.isSelected) "選択済み" else "この戦術を選ぶ",
                            fontWeight = FontWeight.Bold)
                    }
                }
            }

            // 選択済みバッジ（折り畳み時）
            if (tactic.isSelected && !isExpanded) {
                Spacer(Modifier.height(4.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Default.CheckCircle, null, tint = Color(0xFF4CAF50),
                        modifier = Modifier.size(12.dp))
                    Spacer(Modifier.width(4.dp))
                    Text("次のゲームで実行！", color = Color(0xFF4CAF50),
                        style = MaterialTheme.typography.labelSmall)
                }
            }
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
            Icon(Icons.Default.Warning, null, tint = Color(0xFFF9A825), modifier = Modifier.size(24.dp))
            Spacer(Modifier.width(8.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text("相手の癖を検知！", color = Color(0xFFF9A825), fontWeight = FontWeight.Bold,
                    style = MaterialTheme.typography.labelMedium)
                Text(habit.description, color = Color.White, style = MaterialTheme.typography.bodySmall)
            }
            Text("${(habit.confidence * 100).toInt()}%", color = Color(0xFFF9A825), fontWeight = FontWeight.Bold)
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
        Column(modifier = Modifier.padding(10.dp)) {
            Row(horizontalArrangement = Arrangement.SpaceAround, modifier = Modifier.fillMaxWidth()) {
                MetricItem("スイング速度", "${metrics.swingSpeedKmh.toInt()} km/h", false)
                MetricItem("打点高さ", "${metrics.impactHeightCm.toInt()} cm", metrics.impactHeightCm < 80f)
                MetricItem("膝の角度", "${metrics.kneeAngleDeg.toInt()}°", metrics.kneeAngleDeg > 170f)
            }
            if (metrics.impactHeightCm < 80f) {
                Text("⚠ 打点が下がっています。足を一歩踏み込んで！",
                    color = Color(0xFFEF5350),
                    modifier = Modifier.padding(top = 4.dp),
                    style = MaterialTheme.typography.labelSmall)
            }
        }
    }
}

@Composable
private fun MetricItem(label: String, value: String, isWarning: Boolean) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(label, color = Color.Gray, style = MaterialTheme.typography.labelSmall)
        Text(value,
            color = if (isWarning) Color(0xFFEF5350) else Color(0xFF4CAF50),
            fontWeight = FontWeight.Bold, style = MaterialTheme.typography.bodyMedium)
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
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text("着弾点マップ", color = Color.Gray, style = MaterialTheme.typography.labelSmall)
                Text("${landings.size}球", color = Color(0xFF4CAF50), style = MaterialTheme.typography.labelSmall)
            }
            Canvas(modifier = Modifier.fillMaxWidth().height(90.dp)) {
                drawCourtOutline()
                landings.forEachIndexed { idx, pt ->
                    val alpha = (idx + 1).toFloat() / landings.size.coerceAtLeast(1)
                    val color = when (pt.zone) {
                        CourtZone.OUT -> Color(0xFFEF5350)
                        CourtZone.NET -> Color(0xFFF9A825)
                        else -> Color(0xFF4CAF50)
                    }
                    drawCircle(color = color.copy(alpha = alpha), radius = 6f,
                        center = Offset(pt.x * size.width, pt.y * size.height))
                }
            }
            if (landings.isEmpty()) {
                Box(modifier = Modifier.fillMaxWidth().height(90.dp), contentAlignment = Alignment.Center) {
                    Text("カメラで試合を撮影すると着弾点が表示されます",
                        color = Color.Gray, style = MaterialTheme.typography.labelSmall,
                        textAlign = TextAlign.Center)
                }
            }
            // 凡例
            Row(horizontalArrangement = Arrangement.spacedBy(16.dp), modifier = Modifier.padding(top = 4.dp)) {
                LegendItem(Color(0xFF4CAF50), "IN")
                LegendItem(Color(0xFFEF5350), "OUT")
                LegendItem(Color(0xFFF9A825), "ネット")
            }
        }
    }
}

@Composable
private fun LegendItem(color: Color, label: String) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Box(modifier = Modifier.size(8.dp).background(color, shape = RoundedCornerShape(50)))
        Spacer(Modifier.width(4.dp))
        Text(label, color = Color.Gray, style = MaterialTheme.typography.labelSmall)
    }
}

private fun DrawScope.drawCourtOutline() {
    val w = size.width; val h = size.height
    drawRect(color = Color(0xFF2E7D32).copy(alpha = 0.3f))
    drawLine(Color.White.copy(alpha = 0.5f), Offset(0f, h / 2), Offset(w, h / 2), 2f)
    drawLine(Color.White.copy(alpha = 0.3f), Offset(w / 2, 0f), Offset(w / 2, h), 1f)
    drawLine(Color.White.copy(alpha = 0.3f), Offset(0f, h * 0.25f), Offset(w, h * 0.25f), 1f)
    drawLine(Color.White.copy(alpha = 0.3f), Offset(0f, h * 0.75f), Offset(w, h * 0.75f), 1f)
}

// ── ダブルス陣形 ───────────────────────────────────────────────

@Composable
private fun DoublesFormationCard(formation: DoublesFormation) {
    val hasIssue = formation.isCenterGapOpen || formation.isPartnerTooBack
    Card(
        colors = CardDefaults.cardColors(containerColor = if (hasIssue) Color(0xFF4A1A00) else Color(0xFF1A2E1A)),
        modifier = Modifier.fillMaxWidth()
    ) {
        Row(modifier = Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(if (hasIssue) Icons.Default.Warning else Icons.Default.CheckCircle,
                null, tint = if (hasIssue) Color(0xFFEF5350) else Color(0xFF4CAF50))
            Spacer(Modifier.width(8.dp))
            Column {
                Text("陣形チェック", color = Color.Gray, style = MaterialTheme.typography.labelSmall)
                Text(when {
                    formation.isCenterGapOpen -> "センターが空きすぎ！詰めてください"
                    formation.isPartnerTooBack -> "前衛が下がりすぎ。ネット前へ！"
                    else -> "${formation.recommendedFormation.displayNameJa} — 良い陣形です"
                }, color = Color.White, style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.Bold)
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
    Card(colors = CardDefaults.cardColors(containerColor = bgColor), modifier = Modifier.fillMaxWidth()) {
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
                    }, shape = RoundedCornerShape(4.dp)
                ) {
                    Text(advice.urgency.displayNameJa, color = Color.White,
                        modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
                        style = MaterialTheme.typography.labelSmall)
                }
            }
            Spacer(Modifier.height(6.dp))
            Text(advice.body, color = Color.White, style = MaterialTheme.typography.bodyMedium, lineHeight = 22.sp)
            advice.servePlacementImage?.let { pattern ->
                Spacer(Modifier.height(6.dp))
                Surface(color = Color.White.copy(alpha = 0.1f), shape = RoundedCornerShape(8.dp)) {
                    Row(modifier = Modifier.padding(8.dp)) {
                        Text("🎯 ", fontSize = 16.sp)
                        Column {
                            Text("${pattern.targetZone.displayNameJa}へ${pattern.ballType.displayNameJa}",
                                color = Color(0xFFF9A825), fontWeight = FontWeight.Bold,
                                style = MaterialTheme.typography.bodySmall)
                            Text("成功率 ${pattern.successRatePercent}%　速度:${pattern.speedRecommendation.displayNameJa}",
                                color = Color.Gray, style = MaterialTheme.typography.labelSmall)
                        }
                    }
                }
            }
            Spacer(Modifier.height(4.dp))
            Row(horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth()) {
                Text("確信度 ${(advice.confidence * 100).toInt()}%", color = Color.Gray,
                    style = MaterialTheme.typography.labelSmall)
                TextButton(onClick = onRefresh, contentPadding = PaddingValues(0.dp)) {
                    Text("アドバイス更新", style = MaterialTheme.typography.labelSmall)
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
