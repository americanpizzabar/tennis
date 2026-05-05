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
import com.google.accompanist.permissions.ExperimentalPermissionsApi
import com.google.accompanist.permissions.isGranted
import com.google.accompanist.permissions.rememberPermissionState
import com.tennis.ai.coach.data.model.*
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class, ExperimentalPermissionsApi::class)
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

    // カメラ権限（拒否されてもスコア入力は使えるよう、起動はオプション扱い）
    val cameraPermission = rememberPermissionState(android.Manifest.permission.CAMERA)
    LaunchedEffect(Unit) {
        if (!cameraPermission.status.isGranted) cameraPermission.launchPermissionRequest()
    }

    // カメラ接続（権限が許可された場合のみ）
    val previewView = remember {
        PreviewView(context).apply {
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
            scaleType = PreviewView.ScaleType.FILL_CENTER
        }
    }
    DisposableEffect(lifecycleOwner, cameraPermission.status.isGranted) {
        if (cameraPermission.status.isGranted) {
            viewModel.startCamera(lifecycleOwner, previewView)
        }
        onDispose { }
    }

    LaunchedEffect(matchTypeStr) {
        val matchType = runCatching { MatchType.valueOf(matchTypeStr) }.getOrDefault(MatchType.SINGLES)
        viewModel.initMatchType(matchType)
    }

    // ① カメラ設置画面：完了するまで他の試合 UI は出さない
    if (uiState.showCameraSetup) {
        CameraSetupScreen(
            previewView = previewView,
            isCameraGranted = cameraPermission.status.isGranted,
            zoomRatio = uiState.cameraZoomRatio,
            onZoomChange = { viewModel.setCameraZoom(it) },
            onSkip = { viewModel.skipCameraSetup() },
            onConfirm = { viewModel.completeCameraSetup() },
            onBack = onBack,
        )
        return
    }

    // ② 試合前セットアップダイアログ
    if (uiState.showSetupDialog) {
        PreMatchSetupDialog(
            matchType = uiState.matchType,
            onConfirm = { opponentName, opponentLevel, opponentHand, partner, opponent2, deuceRule ->
                viewModel.setupMatch(opponentName, opponentLevel, opponentHand, partner, opponent2, deuceRule)
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
                                "vs ${uiState.opponentName}" + if (uiState.matchType == MatchType.DOUBLES) " ／ 味方: ${uiState.partner.name}" else "",
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
                        // 録画ボタン
                        IconButton(onClick = { viewModel.toggleRecording() }) {
                            Icon(
                                if (uiState.isRecording) Icons.Default.StopCircle else Icons.Default.FiberManualRecord,
                                contentDescription = "録画",
                                tint = if (uiState.isRecording) Color(0xFFEF5350) else Color(0xFFB0B0B0),
                            )
                        }
                        // 骨格オーバーレイ切替
                        IconButton(onClick = { viewModel.toggleSkeletonOverlay() }) {
                            Icon(
                                Icons.Default.Accessibility,
                                contentDescription = "骨格表示",
                                tint = if (uiState.showSkeletonOverlay) Color(0xFF42A5F5) else Color(0xFFB0B0B0),
                            )
                        }
                        // カメラプレビュー切替
                        IconButton(onClick = { showCameraPreview = !showCameraPreview }) {
                            Icon(
                                if (uiState.isCameraActive) Icons.Default.Videocam else Icons.Default.VideocamOff,
                                contentDescription = "カメラ",
                                tint = if (uiState.isCameraActive) Color(0xFF4CAF50) else Color.Gray,
                            )
                        }
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
                    Column {
                        Box(modifier = Modifier.fillMaxWidth().height(180.dp)) {
                            AndroidView(
                                factory = { previewView },
                                modifier = Modifier.fillMaxSize()
                            )
                            // 骨格オーバーレイ（ポーズメトリクス取得済みのときに表示）
                            if (uiState.showSkeletonOverlay) {
                                SkeletonOverlay(metrics = uiState.poseMetrics, modifier = Modifier.fillMaxSize())
                            }
                            // 録画中インジケーター
                            if (uiState.isRecording) {
                                Row(
                                    modifier = Modifier
                                        .padding(8.dp)
                                        .background(Color.Black.copy(alpha = 0.6f), RoundedCornerShape(4.dp))
                                        .padding(horizontal = 6.dp, vertical = 3.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                ) {
                                    Box(
                                        modifier = Modifier
                                            .size(8.dp)
                                            .background(Color(0xFFEF5350), RoundedCornerShape(50))
                                    )
                                    Spacer(Modifier.width(4.dp))
                                    Text("REC", color = Color(0xFFEF5350),
                                        fontWeight = FontWeight.Bold,
                                        style = MaterialTheme.typography.labelSmall)
                                }
                            }
                        }
                        // ズームスライダー（広角〜望遠）
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(horizontal = 8.dp, vertical = 4.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text("広角", color = Color.Gray,
                                style = MaterialTheme.typography.labelSmall)
                            Slider(
                                value = uiState.cameraZoomRatio,
                                onValueChange = { viewModel.setCameraZoom(it) },
                                valueRange = 1f..5f,
                                modifier = Modifier.weight(1f).padding(horizontal = 6.dp),
                                colors = SliderDefaults.colors(
                                    thumbColor = Color(0xFF4CAF50),
                                    activeTrackColor = Color(0xFF2E7D32),
                                )
                            )
                            Text("望遠", color = Color.Gray,
                                style = MaterialTheme.typography.labelSmall)
                            Spacer(Modifier.width(4.dp))
                            Text(String.format("%.1fx", uiState.cameraZoomRatio),
                                color = Color(0xFF4CAF50),
                                fontWeight = FontWeight.Bold,
                                style = MaterialTheme.typography.labelMedium)
                        }
                    }
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
                    onSelectTactic = viewModel::selectTactic,
                    onSkip = viewModel::skipChangeover,
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
    onConfirm: (
        opponentName: String,
        opponentLevel: PlayerLevel,
        opponentHand: DominantHand,
        partner: PartnerProfile,
        opponent2: PartnerProfile,
        deuceRule: DeuceRule,
    ) -> Unit
) {
    var opponentName by remember { mutableStateOf("") }
    var opponentLevel by remember { mutableStateOf(PlayerLevel.INTERMEDIATE) }
    var opponentHand by remember { mutableStateOf(DominantHand.RIGHT) }

    var partnerName by remember { mutableStateOf("") }
    var partnerLevel by remember { mutableStateOf(PlayerLevel.INTERMEDIATE) }
    var partnerHand by remember { mutableStateOf(DominantHand.RIGHT) }

    var opponent2Name by remember { mutableStateOf("") }
    var opponent2Level by remember { mutableStateOf(PlayerLevel.INTERMEDIATE) }
    var opponent2Hand by remember { mutableStateOf(DominantHand.RIGHT) }

    var deuceRule by remember { mutableStateOf(DeuceRule.STANDARD_AD) }

    AlertDialog(
        onDismissRequest = {},
        title = {
            Text("試合前セットアップ", fontWeight = FontWeight.Bold,
                style = MaterialTheme.typography.titleLarge)
        },
        text = {
            Column(
                verticalArrangement = Arrangement.spacedBy(14.dp),
                modifier = Modifier.verticalScroll(rememberScrollState())
            ) {
                // ── 相手選手 1 ──
                PlayerSection(
                    label = if (matchType == MatchType.DOUBLES) "相手選手 1" else "相手選手",
                    name = opponentName,
                    onNameChange = { opponentName = it },
                    level = opponentLevel,
                    onLevelChange = { opponentLevel = it },
                    hand = opponentHand,
                    onHandChange = { opponentHand = it },
                    accentColor = Color(0xFFEF5350),
                )

                if (matchType == MatchType.DOUBLES) {
                    // 相手選手 2
                    PlayerSection(
                        label = "相手選手 2",
                        name = opponent2Name,
                        onNameChange = { opponent2Name = it },
                        level = opponent2Level,
                        onLevelChange = { opponent2Level = it },
                        hand = opponent2Hand,
                        onHandChange = { opponent2Hand = it },
                        accentColor = Color(0xFFEF5350),
                    )
                    // パートナー
                    PlayerSection(
                        label = "パートナー（味方）",
                        name = partnerName,
                        onNameChange = { partnerName = it },
                        level = partnerLevel,
                        onLevelChange = { partnerLevel = it },
                        hand = partnerHand,
                        onHandChange = { partnerHand = it },
                        accentColor = Color(0xFF4CAF50),
                    )
                }

                // ── デュースルール ──
                Text("デュースルール", style = MaterialTheme.typography.labelMedium, color = Color.Gray)
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    DeuceRule.values().forEach { rule ->
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(8.dp))
                                .background(if (deuceRule == rule) Color(0xFF1565C0) else Color(0xFF0D1F1F))
                                .clickable { deuceRule = rule }
                                .padding(horizontal = 12.dp, vertical = 8.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            RadioButton(
                                selected = deuceRule == rule,
                                onClick = { deuceRule = rule },
                                colors = RadioButtonDefaults.colors(selectedColor = Color(0xFF42A5F5))
                            )
                            Spacer(Modifier.width(8.dp))
                            Column {
                                Text(rule.displayNameJa, color = Color.White,
                                    fontWeight = if (deuceRule == rule) FontWeight.Bold else FontWeight.Normal)
                                Text(rule.description, color = Color.Gray,
                                    style = MaterialTheme.typography.labelSmall)
                            }
                        }
                    }
                }
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    onConfirm(
                        opponentName, opponentLevel, opponentHand,
                        PartnerProfile(
                            name = partnerName.ifBlank { "パートナー" },
                            estimatedLevel = partnerLevel,
                            dominantHand = partnerHand,
                        ),
                        PartnerProfile(
                            name = opponent2Name.ifBlank { "相手選手 2" },
                            estimatedLevel = opponent2Level,
                            dominantHand = opponent2Hand,
                        ),
                        deuceRule,
                    )
                },
                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF2E7D32))
            ) { Text("試合開始！", fontWeight = FontWeight.Bold) }
        },
        containerColor = Color(0xFF0D1F0D)
    )
}

@Composable
private fun PlayerSection(
    label: String,
    name: String,
    onNameChange: (String) -> Unit,
    level: PlayerLevel,
    onLevelChange: (PlayerLevel) -> Unit,
    hand: DominantHand,
    onHandChange: (DominantHand) -> Unit,
    accentColor: Color,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(10.dp))
            .background(Color(0xFF0D1F0D))
            .border(1.dp, accentColor.copy(alpha = 0.5f), RoundedCornerShape(10.dp))
            .padding(10.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        Text(label, color = accentColor, fontWeight = FontWeight.Bold,
            style = MaterialTheme.typography.titleSmall)

        OutlinedTextField(
            value = name,
            onValueChange = onNameChange,
            label = { Text("名前（任意）") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
            colors = OutlinedTextFieldDefaults.colors(
                focusedBorderColor = accentColor,
                unfocusedBorderColor = Color.Gray,
            )
        )

        // レベル（コンパクト：横並びチップ）
        Text("レベル", color = Color.Gray, style = MaterialTheme.typography.labelSmall)
        Row(horizontalArrangement = Arrangement.spacedBy(4.dp), modifier = Modifier.fillMaxWidth()) {
            PlayerLevel.values().forEach { lv ->
                val selected = lv == level
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .clip(RoundedCornerShape(6.dp))
                        .background(if (selected) accentColor.copy(alpha = 0.3f) else Color(0xFF1A2A1A))
                        .border(1.dp,
                            if (selected) accentColor else Color.Transparent,
                            RoundedCornerShape(6.dp))
                        .clickable { onLevelChange(lv) }
                        .padding(vertical = 6.dp, horizontal = 2.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        lv.displayNameJa,
                        color = if (selected) Color.White else Color.LightGray,
                        fontWeight = if (selected) FontWeight.Bold else FontWeight.Normal,
                        style = MaterialTheme.typography.labelSmall,
                        textAlign = TextAlign.Center,
                    )
                }
            }
        }

        // 利き手
        Text("利き手", color = Color.Gray, style = MaterialTheme.typography.labelSmall)
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            DominantHand.values().forEach { h ->
                val selected = h == hand
                Row(
                    modifier = Modifier
                        .weight(1f)
                        .clip(RoundedCornerShape(6.dp))
                        .background(if (selected) accentColor.copy(alpha = 0.3f) else Color(0xFF1A2A1A))
                        .border(1.dp,
                            if (selected) accentColor else Color.Transparent,
                            RoundedCornerShape(6.dp))
                        .clickable { onHandChange(h) }
                        .padding(vertical = 8.dp, horizontal = 6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.Center,
                ) {
                    RadioButton(
                        selected = selected,
                        onClick = { onHandChange(h) },
                        colors = RadioButtonDefaults.colors(selectedColor = accentColor),
                        modifier = Modifier.size(18.dp),
                    )
                    Spacer(Modifier.width(6.dp))
                    Text(h.displayNameJa, color = Color.White,
                        style = MaterialTheme.typography.bodySmall)
                }
            }
        }
    }
}

// ── カメラ設置画面 ──────────────────────────────────────────
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun CameraSetupScreen(
    previewView: PreviewView,
    isCameraGranted: Boolean,
    zoomRatio: Float,
    onZoomChange: (Float) -> Unit,
    onSkip: () -> Unit,
    onConfirm: () -> Unit,
    onBack: () -> Unit,
) {
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("① カメラ設置", fontWeight = FontWeight.Bold) },
                navigationIcon = {
                    IconButton(onClick = onBack) { Icon(Icons.Default.ArrowBack, null) }
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
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            // プレビュー
            Card(
                colors = CardDefaults.cardColors(containerColor = Color.Black),
                modifier = Modifier.fillMaxWidth().weight(1f)
            ) {
                if (isCameraGranted) {
                    AndroidView(
                        factory = { previewView },
                        modifier = Modifier.fillMaxSize()
                    )
                } else {
                    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        Text(
                            "カメラ権限を許可してください",
                            color = Color(0xFFF9A825),
                            style = MaterialTheme.typography.bodyMedium,
                        )
                    }
                }
            }

            // ズーム
            Card(colors = CardDefaults.cardColors(containerColor = Color(0xFF0D1F0D))) {
                Column(modifier = Modifier.padding(10.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text("ズーム", color = Color.Gray,
                            style = MaterialTheme.typography.labelMedium)
                        Text(
                            String.format("%.1fx", zoomRatio),
                            color = Color(0xFF4CAF50),
                            fontWeight = FontWeight.Bold,
                        )
                    }
                    Slider(
                        value = zoomRatio,
                        onValueChange = onZoomChange,
                        valueRange = 1f..5f,
                        colors = SliderDefaults.colors(
                            thumbColor = Color(0xFF4CAF50),
                            activeTrackColor = Color(0xFF2E7D32),
                        )
                    )
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        Text("広角 1.0x", color = Color.Gray,
                            style = MaterialTheme.typography.labelSmall)
                        Text("望遠 5.0x", color = Color.Gray,
                            style = MaterialTheme.typography.labelSmall)
                    }
                }
            }

            // 設置のヒント
            Card(colors = CardDefaults.cardColors(containerColor = Color(0xFF0D2C4D))) {
                Column(modifier = Modifier.padding(10.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text("📷 撮影のコツ", color = Color(0xFFF9A825),
                        fontWeight = FontWeight.Bold,
                        style = MaterialTheme.typography.labelMedium)
                    Text(
                        "・コートサイドのフェンスにスマホを横置きで固定すると全コートが映ります\n" +
                            "・縦置きの場合はベースライン後方の高い位置がおすすめ\n" +
                            "・三脚や100均クリップで揺れを抑えると分析精度が上がります\n" +
                            "・端末が映像を出すまで数秒かかる場合があります",
                        color = Color.White,
                        style = MaterialTheme.typography.bodySmall,
                    )
                }
            }

            Row(modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(
                    onClick = onSkip,
                    modifier = Modifier.weight(1f),
                ) { Text("カメラなしで進む") }
                Button(
                    onClick = onConfirm,
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF2E7D32)),
                    modifier = Modifier.weight(1f),
                ) {
                    Icon(Icons.Default.Check, null, modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(4.dp))
                    Text("設置完了", fontWeight = FontWeight.Bold)
                }
            }
        }
    }
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
    onSelectTactic: (Int) -> Unit,
    onSkip: () -> Unit,
) {
    var expandedIndex by remember { mutableStateOf(-1) }

    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        // タイマーヘッダー
        Card(
            colors = CardDefaults.cardColors(containerColor = Color(0xFF0D47A1)),
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(modifier = Modifier.padding(12.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
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
                Spacer(Modifier.height(8.dp))
                Button(
                    onClick = onSkip,
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF2E7D32)),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Icon(Icons.Default.SkipNext, null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(6.dp))
                    Text("次のゲームへ進む（待たずに開始）", fontWeight = FontWeight.Bold)
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

/** 簡易骨格オーバーレイ（ポーズメトリクスがあるかどうかと角度系の数値だけを可視化）。 */
@Composable
private fun SkeletonOverlay(metrics: PoseMetrics?, modifier: Modifier = Modifier) {
    Canvas(modifier = modifier) {
        val centerX = size.width / 2f
        val centerY = size.height / 2f
        val color = Color(0xFF42A5F5).copy(alpha = 0.7f)

        if (metrics == null) {
            // メトリクス未取得：プレースホルダ円
            drawCircle(color = color.copy(alpha = 0.3f), radius = 24f, center = Offset(centerX, centerY * 0.6f))
            return@Canvas
        }
        // 概念的な棒人間：肩・腰・膝・足首を縦並びに、肩回転と膝角度を反映
        val rotationRad = (metrics.shoulderRotationDeg * Math.PI / 180f).toFloat()
        val torsoLen = size.height * 0.25f
        val legLen = size.height * 0.20f
        val armLen = size.height * 0.18f

        val head = Offset(centerX, centerY * 0.35f)
        val shoulders = Offset(centerX, head.y + torsoLen * 0.3f)
        val hips = Offset(centerX, shoulders.y + torsoLen)
        val kneeOffsetX = legLen * 0.1f
        val knees = Offset(centerX + kneeOffsetX, hips.y + legLen * 0.5f)
        val ankles = Offset(centerX + kneeOffsetX * 1.5f, knees.y + legLen * 0.5f)

        // 頭
        drawCircle(color = color, radius = 14f, center = head)
        // 胴体
        drawLine(color, shoulders, hips, strokeWidth = 6f)
        // 腕（肩回転反映）
        val rArmEnd = Offset(
            shoulders.x + armLen * kotlin.math.cos(rotationRad),
            shoulders.y + armLen * kotlin.math.sin(rotationRad),
        )
        val lArmEnd = Offset(
            shoulders.x - armLen * kotlin.math.cos(rotationRad),
            shoulders.y - armLen * kotlin.math.sin(rotationRad),
        )
        drawLine(color, shoulders, rArmEnd, strokeWidth = 5f)
        drawLine(color, shoulders, lArmEnd, strokeWidth = 5f)
        // 脚
        drawLine(color, hips, knees, strokeWidth = 5f)
        drawLine(color, knees, ankles, strokeWidth = 5f)
        // 関節
        listOf(shoulders, hips, knees, ankles, rArmEnd, lArmEnd).forEach {
            drawCircle(color = Color.White.copy(alpha = 0.8f), radius = 4f, center = it)
        }
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
