package com.tennis.ai.coach.peer

import android.content.Context
import android.os.Build
import com.google.android.gms.nearby.Nearby
import com.google.android.gms.nearby.connection.AdvertisingOptions
import com.google.android.gms.nearby.connection.ConnectionInfo
import com.google.android.gms.nearby.connection.ConnectionLifecycleCallback
import com.google.android.gms.nearby.connection.ConnectionResolution
import com.google.android.gms.nearby.connection.ConnectionsClient
import com.google.android.gms.nearby.connection.DiscoveredEndpointInfo
import com.google.android.gms.nearby.connection.DiscoveryOptions
import com.google.android.gms.nearby.connection.EndpointDiscoveryCallback
import com.google.android.gms.nearby.connection.Payload
import com.google.android.gms.nearby.connection.PayloadCallback
import com.google.android.gms.nearby.connection.PayloadTransferUpdate
import com.google.android.gms.nearby.connection.Strategy
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Nearby Connections (P2P_POINT_TO_POINT) で 2 台の Android を直接接続し、
 * テニス試合データ（ボール着弾点・ポーズ・スコア）を相互交換する。
 *
 * 一方の端末が advertise → もう一方が discover して connect。
 * 接続後はどちらも対称的にメッセージを送れる。
 */
@Singleton
class PeerSessionManager @Inject constructor(
    @ApplicationContext private val context: Context,
    private val json: Json,
) {
    private val client: ConnectionsClient by lazy { Nearby.getConnectionsClient(context) }
    private val serviceId = "com.tennis.ai.coach.peer"

    private val _state = MutableStateFlow<PeerState>(PeerState.Idle)
    val state: StateFlow<PeerState> = _state.asStateFlow()

    private val _incoming = MutableSharedFlow<PeerMessage>(extraBufferCapacity = 64)
    val incoming: SharedFlow<PeerMessage> = _incoming.asSharedFlow()

    private val _discovered = MutableStateFlow<List<DiscoveredPeer>>(emptyList())
    val discovered: StateFlow<List<DiscoveredPeer>> = _discovered.asStateFlow()

    private var connectedEndpointId: String? = null
    private var myRole: PeerRole = PeerRole.OWN_SIDE
    // 自分がホスト（advertiser）かどうか。ゲストはホストの反対陣を自動採用する。
    private var isHost: Boolean = false

    private val deviceName = (Build.MODEL ?: "Phone").take(20)

    // ── 送信側 (advertiser) ───────────────────────────────────
    fun startAdvertising(role: PeerRole) {
        myRole = role
        isHost = true
        _state.value = PeerState.Advertising
        val options = AdvertisingOptions.Builder()
            .setStrategy(Strategy.P2P_POINT_TO_POINT)
            .build()
        runCatching {
            client.startAdvertising(deviceName, serviceId, connectionLifecycleCallback, options)
        }.onFailure { _state.value = PeerState.Error(it.message ?: "advertise failed") }
    }

    // ── 受信側 (discoverer) ───────────────────────────────────
    fun startDiscovery(role: PeerRole) {
        myRole = role
        isHost = false
        _state.value = PeerState.Discovering
        _discovered.value = emptyList()
        val options = DiscoveryOptions.Builder()
            .setStrategy(Strategy.P2P_POINT_TO_POINT)
            .build()
        runCatching {
            client.startDiscovery(serviceId, endpointDiscoveryCallback, options)
        }.onFailure { _state.value = PeerState.Error(it.message ?: "discover failed") }
    }

    fun requestConnection(endpointId: String) {
        runCatching {
            client.requestConnection(deviceName, endpointId, connectionLifecycleCallback)
        }.onFailure { _state.value = PeerState.Error(it.message ?: "request failed") }
    }

    fun stop() {
        runCatching { client.stopAdvertising() }
        runCatching { client.stopDiscovery() }
        connectedEndpointId?.let { runCatching { client.disconnectFromEndpoint(it) } }
        connectedEndpointId = null
        _state.value = PeerState.Idle
        _discovered.value = emptyList()
    }

    fun send(message: PeerMessage): Boolean {
        val endpoint = connectedEndpointId ?: return false
        val payload = runCatching {
            Payload.fromBytes(json.encodeToString(message).toByteArray(Charsets.UTF_8))
        }.getOrNull() ?: return false
        runCatching { client.sendPayload(endpoint, payload) }.onFailure { return false }
        return true
    }

    // ── Nearby callbacks ──────────────────────────────────────
    private val endpointDiscoveryCallback = object : EndpointDiscoveryCallback() {
        override fun onEndpointFound(endpointId: String, info: DiscoveredEndpointInfo) {
            val current = _discovered.value.toMutableList()
            if (current.none { it.endpointId == endpointId }) {
                current.add(DiscoveredPeer(endpointId, info.endpointName))
                _discovered.value = current
            }
        }
        override fun onEndpointLost(endpointId: String) {
            _discovered.value = _discovered.value.filterNot { it.endpointId == endpointId }
        }
    }

    private val connectionLifecycleCallback = object : ConnectionLifecycleCallback() {
        override fun onConnectionInitiated(endpointId: String, info: ConnectionInfo) {
            // 自動受け入れ（簡易版）。プロダクション版では PIN 確認 UI を出すことを推奨。
            _state.value = PeerState.Authenticating(info.endpointName, info.authenticationDigits)
            runCatching { client.acceptConnection(endpointId, payloadCallback) }
                .onFailure { _state.value = PeerState.Error(it.message ?: "accept failed") }
        }
        override fun onConnectionResult(endpointId: String, result: ConnectionResolution) {
            if (result.status.isSuccess) {
                connectedEndpointId = endpointId
                _state.value = PeerState.Connected(endpointId, myRole)
                send(PeerMessage.Hello(deviceName, myRole))
                runCatching { client.stopAdvertising() }
                runCatching { client.stopDiscovery() }
            } else {
                _state.value = PeerState.Error("接続失敗: ${result.status.statusMessage}")
            }
        }
        override fun onDisconnected(endpointId: String) {
            connectedEndpointId = null
            _state.value = PeerState.Idle
        }
    }

    private val payloadCallback = object : PayloadCallback() {
        override fun onPayloadReceived(endpointId: String, payload: Payload) {
            val bytes = payload.asBytes() ?: return
            runCatching {
                val text = String(bytes, Charsets.UTF_8)
                json.decodeFromString<PeerMessage>(text)
            }.onSuccess { msg ->
                // ゲストはホストの Hello を受け取ったら、自動的に反対の陣に切り替える
                if (msg is PeerMessage.Hello && !isHost) {
                    myRole = msg.role.other()
                    connectedEndpointId?.let { _state.value = PeerState.Connected(it, myRole) }
                }
                _incoming.tryEmit(msg)
            }
        }
        override fun onPayloadTransferUpdate(endpointId: String, update: PayloadTransferUpdate) = Unit
    }
}

sealed class PeerState {
    data object Idle : PeerState()
    data object Advertising : PeerState()
    data object Discovering : PeerState()
    data class Authenticating(val peerName: String, val pin: String) : PeerState()
    data class Connected(val endpointId: String, val myRole: PeerRole) : PeerState()
    data class Error(val message: String) : PeerState()
}

data class DiscoveredPeer(val endpointId: String, val name: String)
