package com.tennis.ai.coach.ui.peer

import android.os.Build
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.google.accompanist.permissions.ExperimentalPermissionsApi
import com.google.accompanist.permissions.rememberMultiplePermissionsState
import com.tennis.ai.coach.data.model.BallLandingPoint
import com.tennis.ai.coach.data.model.CourtZone
import com.tennis.ai.coach.peer.DiscoveredPeer
import com.tennis.ai.coach.peer.PeerRole
import com.tennis.ai.coach.peer.PeerState

@OptIn(ExperimentalMaterial3Api::class, ExperimentalPermissionsApi::class)
@Composable
fun MultiPhoneScreen(
    onBack: () -> Unit,
    viewModel: MultiPhoneViewModel = hiltViewModel(),
) {
    val state by viewModel.ui.collectAsStateWithLifecycle()
    val perms = remember { requiredPermissions() }
    val permState = rememberMultiplePermissionsState(perms)
    var selectedRole by remember { mutableStateOf(PeerRole.OWN_SIDE) }

    LaunchedEffect(Unit) {
        if (!permState.allPermissionsGranted) permState.launchMultiplePermissionRequest()
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text("2台連携モード", fontWeight = FontWeight.Bold)
                        Text(
                            "Bluetooth/Wi-Fi で 2 台のスマホを連携",
                            color = Color.Gray,
                            style = MaterialTheme.typography.labelSmall
                        )
                    }
                },
                navigationIcon = {
                    // 戻るだけ。接続は維持される（明示的な「セッション終了」でのみ切断）。
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
                .verticalScroll(rememberScrollState())
                .padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            if (!permState.allPermissionsGranted) {
                PermissionWarning(onGrant = { permState.launchMultiplePermissionRequest() })
            }

            StatusCard(state.peerState, state.peerName)

            when (val ps = state.peerState) {
                PeerState.Idle, is PeerState.Error -> SetupCard(
                    selectedRole = selectedRole,
                    onSelectRole = { selectedRole = it },
                    onHost = { viewModel.startAsHost(selectedRole) },
                    onJoin = { viewModel.startAsGuest(selectedRole) },
                )
                PeerState.Discovering -> DiscoveryList(
                    peers = state.discovered,
                    onConnect = { viewModel.connectTo(it) },
                    onCancel = { viewModel.stop() }
                )
                PeerState.Advertising -> AdvertisingCard(onCancel = { viewModel.stop() })
                is PeerState.Authenticating -> AuthCard(ps)
                is PeerState.Connected -> ConnectedCard(
                    role = ps.myRole,
                    ownLandings = state.ownLandings,
                    opponentLandings = state.opponentLandings,
                    onEnd = { viewModel.stop() }
                )
            }

            if (state.log.isNotEmpty()) {
                LogCard(state.log)
            }
        }
    }
}

@Composable
private fun PermissionWarning(onGrant: () -> Unit) {
    Card(colors = CardDefaults.cardColors(containerColor = Color(0xFF4A1A00))) {
        Row(modifier = Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Default.Warning, null, tint = Color(0xFFF9A825))
            Spacer(Modifier.width(8.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text("Bluetooth/位置情報の権限が必要です", color = Color.White, fontWeight = FontWeight.Bold)
                Text(
                    "Nearby Connections を使うために必要です",
                    color = Color.Gray, style = MaterialTheme.typography.labelSmall
                )
            }
            TextButton(onClick = onGrant) { Text("許可", color = Color(0xFFF9A825)) }
        }
    }
}

@Composable
private fun StatusCard(state: PeerState, peerName: String) {
    val (label, color) = when (state) {
        PeerState.Idle -> "待機中" to Color.Gray
        PeerState.Advertising -> "他端末からの接続を待機中..." to Color(0xFFF9A825)
        PeerState.Discovering -> "周辺の端末を検索中..." to Color(0xFFF9A825)
        is PeerState.Authenticating -> "PIN: ${state.pin}（相手と一致確認）" to Color(0xFF42A5F5)
        is PeerState.Connected -> "接続中: $peerName（${state.myRole.displayNameJa}）" to Color(0xFF4CAF50)
        is PeerState.Error -> "エラー: ${state.message}" to Color(0xFFEF5350)
    }
    Card(colors = CardDefaults.cardColors(containerColor = Color(0xFF1A2E1A))) {
        Row(modifier = Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Default.BluetoothSearching, null, tint = color)
            Spacer(Modifier.width(8.dp))
            Text(label, color = color, fontWeight = FontWeight.Bold)
        }
    }
}

@Composable
private fun SetupCard(
    selectedRole: PeerRole,
    onSelectRole: (PeerRole) -> Unit,
    onHost: () -> Unit,
    onJoin: () -> Unit,
) {
    Card(colors = CardDefaults.cardColors(containerColor = Color(0xFF0D1F0D))) {
        Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text("使い方", color = Color(0xFFF9A825), fontWeight = FontWeight.Bold)
            Text(
                "① 2 台のスマホを 5m 以内に置く\n" +
                    "② コートの両サイドにそれぞれ設置（自陣・相手陣）\n" +
                    "③ ホスト側だけが担当（自陣/相手陣）を選ぶ\n" +
                    "④ 参加側は接続時に自動的に反対の陣になる",
                color = Color.White, style = MaterialTheme.typography.bodySmall
            )

            Spacer(Modifier.height(4.dp))
            Text(
                "ホストの担当（参加側は自動で反対になります）",
                color = Color.Gray, style = MaterialTheme.typography.labelMedium,
            )
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                PeerRole.values().forEach { role ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(8.dp))
                            .background(if (selectedRole == role) Color(0xFF1565C0) else Color(0xFF0D2C2C))
                            .clickable { onSelectRole(role) }
                            .padding(horizontal = 12.dp, vertical = 8.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        RadioButton(
                            selected = selectedRole == role,
                            onClick = { onSelectRole(role) },
                            colors = RadioButtonDefaults.colors(selectedColor = Color(0xFF42A5F5))
                        )
                        Spacer(Modifier.width(8.dp))
                        Text(role.displayNameJa, color = Color.White)
                    }
                }
            }

            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                Button(
                    onClick = onHost,
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF2E7D32)),
                    modifier = Modifier.weight(1f)
                ) {
                    Icon(Icons.Default.Wifi, null, modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(4.dp))
                    Text("ホストになる")
                }
                Button(
                    onClick = onJoin,
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF1565C0)),
                    modifier = Modifier.weight(1f)
                ) {
                    Icon(Icons.Default.Search, null, modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(4.dp))
                    Text("参加する")
                }
            }
        }
    }
}

@Composable
private fun DiscoveryList(
    peers: List<DiscoveredPeer>,
    onConnect: (DiscoveredPeer) -> Unit,
    onCancel: () -> Unit,
) {
    Card(colors = CardDefaults.cardColors(containerColor = Color(0xFF0D1F0D))) {
        Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("見つかった端末", color = Color(0xFFF9A825), fontWeight = FontWeight.Bold)
            if (peers.isEmpty()) {
                CircularProgressIndicator(modifier = Modifier.size(24.dp), color = Color(0xFF4CAF50))
                Text("近くに端末が見つかりません...", color = Color.Gray, style = MaterialTheme.typography.bodySmall)
            } else {
                peers.forEach { peer ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(8.dp))
                            .background(Color(0xFF1A2E1A))
                            .clickable { onConnect(peer) }
                            .padding(12.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(Icons.Default.PhoneAndroid, null, tint = Color(0xFF4CAF50))
                        Spacer(Modifier.width(8.dp))
                        Text(peer.name, color = Color.White, modifier = Modifier.weight(1f))
                        Text("接続 →", color = Color(0xFF4CAF50))
                    }
                }
            }
            TextButton(onClick = onCancel) { Text("キャンセル", color = Color(0xFFEF5350)) }
        }
    }
}

@Composable
private fun AdvertisingCard(onCancel: () -> Unit) {
    Card(colors = CardDefaults.cardColors(containerColor = Color(0xFF0D1F0D))) {
        Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                CircularProgressIndicator(modifier = Modifier.size(24.dp), color = Color(0xFFF9A825))
                Spacer(Modifier.width(10.dp))
                Text("もう 1 台で「参加する」を押してください", color = Color.White)
            }
            TextButton(onClick = onCancel) { Text("キャンセル", color = Color(0xFFEF5350)) }
        }
    }
}

@Composable
private fun AuthCard(state: PeerState.Authenticating) {
    Card(colors = CardDefaults.cardColors(containerColor = Color(0xFF0D2C4D))) {
        Column(modifier = Modifier.padding(12.dp)) {
            Text("接続認証中", color = Color(0xFF42A5F5), fontWeight = FontWeight.Bold)
            Text(state.peerName, color = Color.White)
            Text(
                "PIN: ${state.pin}",
                color = Color.White, fontSize = 22.sp, fontWeight = FontWeight.Black
            )
            Text("両端末で同じ PIN が表示されているか確認してください",
                color = Color.Gray, style = MaterialTheme.typography.labelSmall)
        }
    }
}

@Composable
private fun ConnectedCard(
    role: PeerRole,
    ownLandings: List<BallLandingPoint>,
    opponentLandings: List<BallLandingPoint>,
    onEnd: () -> Unit,
) {
    Card(colors = CardDefaults.cardColors(containerColor = Color(0xFF0D2A0D))) {
        Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Default.CheckCircle, null, tint = Color(0xFF4CAF50))
                Spacer(Modifier.width(8.dp))
                Text("接続完了 — ${role.displayNameJa}", color = Color(0xFF4CAF50), fontWeight = FontWeight.Bold)
            }

            Text(
                "コートビュー（自陣 ${ownLandings.size}球 / 相手陣 ${opponentLandings.size}球）",
                color = Color.Gray, style = MaterialTheme.typography.labelSmall
            )

            FullCourtView(ownLandings = ownLandings, opponentLandings = opponentLandings)

            Text(
                "このまま試合画面に戻ると、撮影中のデータが自動的に相手端末と共有されます。",
                color = Color.White, style = MaterialTheme.typography.bodySmall
            )

            Button(
                onClick = onEnd,
                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFC62828)),
                modifier = Modifier.fillMaxWidth()
            ) { Text("セッション終了", fontWeight = FontWeight.Bold) }
        }
    }
}

@Composable
private fun FullCourtView(ownLandings: List<BallLandingPoint>, opponentLandings: List<BallLandingPoint>) {
    Card(colors = CardDefaults.cardColors(containerColor = Color(0xFF1A4D1A))) {
        Canvas(modifier = Modifier.fillMaxWidth().height(220.dp).padding(8.dp)) {
            val w = size.width; val h = size.height
            // コート枠
            drawRect(color = Color(0xFF2E7D32).copy(alpha = 0.6f))
            drawLine(Color.White, Offset(0f, h / 2), Offset(w, h / 2), 3f)        // ネット
            drawLine(Color.White.copy(alpha = 0.5f), Offset(w / 2, 0f), Offset(w / 2, h), 1f)
            drawLine(Color.White.copy(alpha = 0.5f), Offset(0f, h * 0.25f), Offset(w, h * 0.25f), 1f)
            drawLine(Color.White.copy(alpha = 0.5f), Offset(0f, h * 0.75f), Offset(w, h * 0.75f), 1f)

            // 自陣（下半分）
            ownLandings.forEachIndexed { idx, pt ->
                val alpha = (idx + 1).toFloat() / ownLandings.size.coerceAtLeast(1)
                val color = if (pt.zone == CourtZone.OUT) Color(0xFFEF5350) else Color(0xFF4CAF50)
                drawCircle(
                    color = color.copy(alpha = alpha), radius = 6f,
                    center = Offset(pt.x * w, h / 2 + pt.y * (h / 2))
                )
            }
            // 相手陣（上半分・y を反転）
            opponentLandings.forEachIndexed { idx, pt ->
                val alpha = (idx + 1).toFloat() / opponentLandings.size.coerceAtLeast(1)
                val color = if (pt.zone == CourtZone.OUT) Color(0xFFEF5350) else Color(0xFF42A5F5)
                drawCircle(
                    color = color.copy(alpha = alpha), radius = 6f,
                    center = Offset(pt.x * w, (1f - pt.y) * (h / 2))
                )
            }
        }
    }
}

@Composable
private fun LogCard(log: List<String>) {
    Card(colors = CardDefaults.cardColors(containerColor = Color(0xFF0A0F0A))) {
        Column(modifier = Modifier.padding(10.dp)) {
            Text("ログ", color = Color.Gray, style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold)
            log.takeLast(8).forEach { line ->
                Text("· $line", color = Color.LightGray, style = MaterialTheme.typography.labelSmall)
            }
        }
    }
}

private fun requiredPermissions(): List<String> {
    val list = mutableListOf<String>()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        list += android.Manifest.permission.BLUETOOTH_ADVERTISE
        list += android.Manifest.permission.BLUETOOTH_CONNECT
        list += android.Manifest.permission.BLUETOOTH_SCAN
    } else {
        list += android.Manifest.permission.ACCESS_FINE_LOCATION
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        list += android.Manifest.permission.NEARBY_WIFI_DEVICES
    }
    return list
}
