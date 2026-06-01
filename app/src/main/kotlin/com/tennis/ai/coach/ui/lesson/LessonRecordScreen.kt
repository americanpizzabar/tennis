package com.tennis.ai.coach.ui.lesson

import android.Manifest
import android.view.ViewGroup
import androidx.camera.view.PreviewView
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
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
import com.google.accompanist.permissions.rememberMultiplePermissionsState
import com.tennis.ai.coach.data.lesson.ProStyle
import com.tennis.ai.coach.data.model.SwingType

@OptIn(ExperimentalMaterial3Api::class, ExperimentalPermissionsApi::class)
@Composable
fun LessonRecordScreen(
    onBack: () -> Unit,
    onViewLesson: (String) -> Unit,
    viewModel: LessonViewModel = hiltViewModel(),
) {
    val state by viewModel.ui.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current

    val perms = rememberMultiplePermissionsState(
        listOf(Manifest.permission.CAMERA, Manifest.permission.RECORD_AUDIO)
    )
    LaunchedEffect(Unit) {
        if (!perms.allPermissionsGranted) perms.launchMultiplePermissionRequest()
    }

    val previewView = remember {
        PreviewView(context).apply {
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT
            )
            scaleType = PreviewView.ScaleType.FILL_CENTER
        }
    }
    val cameraGranted = perms.permissions.firstOrNull {
        it.permission == Manifest.permission.CAMERA
    }?.status?.isGranted == true

    DisposableEffect(lifecycleOwner, cameraGranted, state.phase) {
        if (cameraGranted && state.phase != LessonPhase.SELECT_SHOT) {
            viewModel.startCamera(lifecycleOwner, previewView)
        }
        onDispose { }
    }

    // 解析完了 → 詳細へ
    LaunchedEffect(state.savedLessonId) {
        state.savedLessonId?.let { onViewLesson(it) }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("個人レッスン", fontWeight = FontWeight.Bold) },
                navigationIcon = {
                    IconButton(onClick = onBack) { Icon(Icons.Default.ArrowBack, null) }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Color(0xFF0D1F0D))
            )
        },
        containerColor = Color(0xFF0A1A0A)
    ) { padding ->
        Box(Modifier.fillMaxSize().padding(padding)) {
            when (state.phase) {
                LessonPhase.SELECT_SHOT -> ShotSelectStep(onSelect = viewModel::selectShot)
                LessonPhase.CAMERA_SETUP -> CameraSetupStep(
                    state = state,
                    previewView = previewView,
                    cameraGranted = cameraGranted,
                    onZoom = viewModel::setZoom,
                    onSelectPro = viewModel::selectProStyle,
                    onStart = viewModel::proceedToRecording,
                )
                LessonPhase.RECORDING -> RecordingStep(
                    state = state,
                    previewView = previewView,
                    micGranted = perms.permissions.firstOrNull {
                        it.permission == Manifest.permission.RECORD_AUDIO
                    }?.status?.isGranted == true,
                    onZoom = viewModel::setZoom,
                    onToggleSkeleton = viewModel::toggleSkeleton,
                    onStartRec = viewModel::startRecording,
                    onStopRec = viewModel::stopAndAnalyze,
                )
                LessonPhase.DONE -> Box(
                    Modifier.fillMaxSize(), contentAlignment = Alignment.Center
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        CircularProgressIndicator(color = Color(0xFF4CAF50))
                        Spacer(Modifier.height(12.dp))
                        Text("解析結果を準備中...", color = Color.White)
                    }
                }
            }
        }
    }
}

@Composable
private fun ShotSelectStep(onSelect: (SwingType) -> Unit) {
    Column(modifier = Modifier.fillMaxSize().padding(16.dp)) {
        Text("① 練習するショットを選択", color = Color.White,
            fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium)
        Spacer(Modifier.height(4.dp))
        Text("選んだショットの理想フォームと比較して診断します",
            color = Color.Gray, style = MaterialTheme.typography.bodySmall)
        Spacer(Modifier.height(12.dp))
        LazyVerticalGrid(
            columns = GridCells.Fixed(2),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            items(SwingType.values()) { type ->
                Box(
                    modifier = Modifier
                        .height(90.dp)
                        .clip(RoundedCornerShape(14.dp))
                        .background(Color(0xFF1A2E1A))
                        .border(1.dp, Color(0xFF2E7D32), RoundedCornerShape(14.dp))
                        .clickable { onSelect(type) },
                    contentAlignment = Alignment.Center,
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(type.emoji, fontSize = 28.sp)
                        Spacer(Modifier.height(6.dp))
                        Text(type.displayNameJa, color = Color.White,
                            fontWeight = FontWeight.Bold,
                            style = MaterialTheme.typography.bodyMedium,
                            textAlign = TextAlign.Center)
                    }
                }
            }
        }
    }
}

@Composable
private fun CameraSetupStep(
    state: LessonUiState,
    previewView: PreviewView,
    cameraGranted: Boolean,
    onZoom: (Float) -> Unit,
    onSelectPro: (ProStyle?) -> Unit,
    onStart: () -> Unit,
) {
    Column(
        modifier = Modifier.fillMaxSize().padding(12.dp).verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Text("② カメラを設置（${state.swingType.displayNameJa}）", color = Color.White,
            fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium)

        Card(colors = CardDefaults.cardColors(containerColor = Color.Black),
            modifier = Modifier.fillMaxWidth().height(220.dp)) {
            if (cameraGranted) {
                AndroidView(factory = { previewView }, modifier = Modifier.fillMaxSize())
            } else {
                Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text("カメラ権限を許可してください", color = Color(0xFFF9A825))
                }
            }
        }

        // ズーム
        Card(colors = CardDefaults.cardColors(containerColor = Color(0xFF0D1F0D))) {
            Column(Modifier.padding(10.dp)) {
                Row(Modifier.fillMaxWidth(), Arrangement.SpaceBetween) {
                    Text("ズーム（広角〜望遠）", color = Color.Gray,
                        style = MaterialTheme.typography.labelMedium)
                    Text("%.1fx".format(state.cameraZoomRatio), color = Color(0xFF4CAF50),
                        fontWeight = FontWeight.Bold)
                }
                Slider(value = state.cameraZoomRatio, onValueChange = onZoom,
                    valueRange = 1f..5f,
                    colors = SliderDefaults.colors(thumbColor = Color(0xFF4CAF50),
                        activeTrackColor = Color(0xFF2E7D32)))
            }
        }

        // プロ比較スタイル選択
        if (state.availableProStyles.isNotEmpty()) {
            Card(colors = CardDefaults.cardColors(containerColor = Color(0xFF0D2C4D))) {
                Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text("プロ比較モード（任意）", color = Color(0xFFF9A825),
                        fontWeight = FontWeight.Bold, style = MaterialTheme.typography.labelMedium)
                    Text("理想のプロスタイルと重ねて診断します", color = Color.Gray,
                        style = MaterialTheme.typography.labelSmall)
                    state.availableProStyles.forEach { pro ->
                        ProStyleRow(pro = pro, selected = state.proStyle?.id == pro.id,
                            onClick = { onSelectPro(if (state.proStyle?.id == pro.id) null else pro) })
                    }
                }
            }
        }

        // 設置のコツ
        Card(colors = CardDefaults.cardColors(containerColor = Color(0xFF1A2E1A))) {
            Text(
                "💡 横向きで体の側面が映る位置に三脚で固定すると、打点や肩の回転が正確に解析できます。",
                color = Color.White, modifier = Modifier.padding(10.dp),
                style = MaterialTheme.typography.bodySmall)
        }

        Button(onClick = onStart, modifier = Modifier.fillMaxWidth(),
            colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF2E7D32))) {
            Icon(Icons.Default.Check, null, modifier = Modifier.size(16.dp))
            Spacer(Modifier.width(6.dp))
            Text("設置完了 → 録画へ", fontWeight = FontWeight.Bold)
        }
    }
}

@Composable
private fun ProStyleRow(pro: ProStyle, selected: Boolean, onClick: () -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth()
            .clip(RoundedCornerShape(8.dp))
            .background(if (selected) Color(0xFF1565C0) else Color(0xFF0D2C2C))
            .clickable(onClick = onClick)
            .padding(10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        RadioButton(selected = selected, onClick = onClick,
            colors = RadioButtonDefaults.colors(selectedColor = Color(0xFF42A5F5)))
        Spacer(Modifier.width(6.dp))
        Column {
            Text(pro.nameJa, color = Color.White, fontWeight = FontWeight.Bold,
                style = MaterialTheme.typography.bodyMedium)
            Text(pro.descriptionJa, color = Color.Gray,
                style = MaterialTheme.typography.labelSmall)
        }
    }
}

@Composable
private fun RecordingStep(
    state: LessonUiState,
    previewView: PreviewView,
    micGranted: Boolean,
    onZoom: (Float) -> Unit,
    onToggleSkeleton: () -> Unit,
    onStartRec: () -> Unit,
    onStopRec: () -> Unit,
) {
    Column(modifier = Modifier.fillMaxSize().padding(8.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Box(Modifier.fillMaxWidth().weight(1f)) {
            Card(colors = CardDefaults.cardColors(containerColor = Color.Black),
                modifier = Modifier.fillMaxSize()) {
                Box(Modifier.fillMaxSize()) {
                    AndroidView(factory = { previewView }, modifier = Modifier.fillMaxSize())
                    if (state.showSkeleton) {
                        LessonSkeletonOverlay(state.liveMetrics, Modifier.fillMaxSize())
                    }
                    if (state.isRecording) {
                        Row(Modifier.padding(8.dp)
                            .background(Color.Black.copy(alpha = 0.6f), RoundedCornerShape(4.dp))
                            .padding(horizontal = 8.dp, vertical = 4.dp),
                            verticalAlignment = Alignment.CenterVertically) {
                            Box(Modifier.size(8.dp)
                                .background(Color(0xFFEF5350), RoundedCornerShape(50)))
                            Spacer(Modifier.width(4.dp))
                            Text("REC ${state.elapsedSeconds}s", color = Color(0xFFEF5350),
                                fontWeight = FontWeight.Bold,
                                style = MaterialTheme.typography.labelSmall)
                        }
                    }
                    // 骨格トグル
                    IconButton(onClick = onToggleSkeleton,
                        modifier = Modifier.align(Alignment.TopEnd).padding(4.dp)) {
                        Icon(Icons.Default.Accessibility, "骨格",
                            tint = if (state.showSkeleton) Color(0xFF42A5F5) else Color.Gray)
                    }
                }
            }
        }

        // ライブ統計
        Row(Modifier.fillMaxWidth(), Arrangement.SpaceAround) {
            LiveStat("検知スイング", "${state.detectedSwings}")
            LiveStat("打球音", "${state.detectedHits}")
            LiveStat("クリーン", if (state.detectedHits > 0)
                "${state.cleanHits * 100 / state.detectedHits}%" else "—")
        }

        if (!micGranted) {
            Text("⚠️ マイク権限がないため打球音解析は無効です",
                color = Color(0xFFF9A825), style = MaterialTheme.typography.labelSmall)
        }

        // ズーム
        Row(Modifier.fillMaxWidth().padding(horizontal = 4.dp),
            verticalAlignment = Alignment.CenterVertically) {
            Text("広角", color = Color.Gray, style = MaterialTheme.typography.labelSmall)
            Slider(value = state.cameraZoomRatio, onValueChange = onZoom, valueRange = 1f..5f,
                modifier = Modifier.weight(1f).padding(horizontal = 6.dp),
                colors = SliderDefaults.colors(thumbColor = Color(0xFF4CAF50),
                    activeTrackColor = Color(0xFF2E7D32)))
            Text("望遠", color = Color.Gray, style = MaterialTheme.typography.labelSmall)
        }

        if (state.analysisInProgress) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center,
                verticalAlignment = Alignment.CenterVertically) {
                CircularProgressIndicator(modifier = Modifier.size(20.dp), color = Color(0xFF4CAF50))
                Spacer(Modifier.width(8.dp))
                Text("解析中...", color = Color.White)
            }
        } else if (!state.isRecording) {
            Button(onClick = onStartRec, modifier = Modifier.fillMaxWidth(),
                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF2E7D32))) {
                Icon(Icons.Default.FiberManualRecord, null, modifier = Modifier.size(18.dp))
                Spacer(Modifier.width(6.dp))
                Text("録画開始（スイングを繰り返してください）", fontWeight = FontWeight.Bold)
            }
        } else {
            Button(onClick = onStopRec, modifier = Modifier.fillMaxWidth(),
                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFC62828))) {
                Icon(Icons.Default.Stop, null, modifier = Modifier.size(18.dp))
                Spacer(Modifier.width(6.dp))
                Text("録画停止 → AI 診断", fontWeight = FontWeight.Bold)
            }
        }
    }
}

@Composable
private fun LiveStat(label: String, value: String) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(value, color = Color(0xFF4CAF50), fontWeight = FontWeight.Black, fontSize = 20.sp)
        Text(label, color = Color.Gray, style = MaterialTheme.typography.labelSmall)
    }
}

/** 録画中の簡易骨格オーバーレイ。 */
@Composable
private fun LessonSkeletonOverlay(
    metrics: com.tennis.ai.coach.data.model.PoseMetrics?,
    modifier: Modifier = Modifier,
) {
    Canvas(modifier = modifier) {
        val color = Color(0xFF42A5F5).copy(alpha = 0.75f)
        val cx = size.width / 2f
        if (metrics == null) {
            drawCircle(color.copy(alpha = 0.3f), 20f, Offset(cx, size.height * 0.3f))
            return@Canvas
        }
        val rot = Math.toRadians(metrics.shoulderRotationDeg.toDouble())
        val head = Offset(cx, size.height * 0.25f)
        val sh = Offset(cx, size.height * 0.38f)
        val hip = Offset(cx, size.height * 0.60f)
        val knee = Offset(cx + 12f, size.height * 0.75f)
        val ankle = Offset(cx + 18f, size.height * 0.90f)
        // 手首（実座標）
        val wrist = Offset(metrics.wristX * size.width, metrics.wristY * size.height)

        drawCircle(color, 16f, head)
        drawLine(color, sh, hip, strokeWidth = 6f)
        drawLine(color, sh, wrist, strokeWidth = 5f)   // 利き腕→手首
        val lArm = Offset(sh.x - 60f * kotlin.math.cos(rot).toFloat(),
            sh.y - 60f * kotlin.math.sin(rot).toFloat())
        drawLine(color, sh, lArm, strokeWidth = 5f)
        drawLine(color, hip, knee, strokeWidth = 5f)
        drawLine(color, knee, ankle, strokeWidth = 5f)
        listOf(sh, hip, knee, ankle, lArm).forEach {
            drawCircle(Color.White.copy(alpha = 0.85f), 4f, it)
        }
        // 手首は強調
        drawCircle(Color(0xFFF9A825), 7f, wrist)
    }
}
