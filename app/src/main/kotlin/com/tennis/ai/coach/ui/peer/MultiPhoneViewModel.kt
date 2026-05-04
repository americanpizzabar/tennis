package com.tennis.ai.coach.ui.peer

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tennis.ai.coach.data.model.BallLandingPoint
import com.tennis.ai.coach.peer.DiscoveredPeer
import com.tennis.ai.coach.peer.PeerMessage
import com.tennis.ai.coach.peer.PeerRole
import com.tennis.ai.coach.peer.PeerSessionManager
import com.tennis.ai.coach.peer.PeerState
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class MultiPhoneUiState(
    val peerState: PeerState = PeerState.Idle,
    val discovered: List<DiscoveredPeer> = emptyList(),
    val ownLandings: List<BallLandingPoint> = emptyList(),
    val opponentLandings: List<BallLandingPoint> = emptyList(),
    val peerName: String = "",
    val log: List<String> = emptyList(),
)

@HiltViewModel
class MultiPhoneViewModel @Inject constructor(
    private val peerSession: PeerSessionManager,
) : ViewModel() {

    private val _ui = MutableStateFlow(MultiPhoneUiState())
    val ui: StateFlow<MultiPhoneUiState> = _ui.asStateFlow()

    init {
        viewModelScope.launch {
            peerSession.state.collect { st -> _ui.update { it.copy(peerState = st) } }
        }
        viewModelScope.launch {
            peerSession.discovered.collect { list -> _ui.update { it.copy(discovered = list) } }
        }
        viewModelScope.launch {
            peerSession.incoming.collect { msg -> handleIncoming(msg) }
        }
    }

    fun startAsHost(role: PeerRole) {
        appendLog("ホストとして広告開始（${role.displayNameJa}）")
        peerSession.startAdvertising(role)
    }

    fun startAsGuest(role: PeerRole) {
        appendLog("ゲストとして探索開始（${role.displayNameJa}）")
        peerSession.startDiscovery(role)
    }

    fun connectTo(peer: DiscoveredPeer) {
        appendLog("${peer.name} に接続要求")
        peerSession.requestConnection(peer.endpointId)
    }

    fun stop() {
        appendLog("セッション終了")
        peerSession.stop()
        _ui.update { it.copy(ownLandings = emptyList(), opponentLandings = emptyList()) }
    }

    private fun handleIncoming(msg: PeerMessage) {
        when (msg) {
            is PeerMessage.Hello -> {
                appendLog("相手 ${msg.deviceName} と接続（${msg.role.displayNameJa}）")
                _ui.update { it.copy(peerName = msg.deviceName) }
            }
            is PeerMessage.BallLanding -> {
                _ui.update { state ->
                    when (msg.sourceRole) {
                        PeerRole.OWN_SIDE -> state.copy(ownLandings = (state.ownLandings + msg.landing).takeLast(50))
                        PeerRole.OPPONENT_SIDE -> state.copy(opponentLandings = (state.opponentLandings + msg.landing).takeLast(50))
                    }
                }
            }
            is PeerMessage.PoseUpdate -> appendLog("ポーズ受信: ${msg.sourceRole.displayNameJa}")
            is PeerMessage.ScoreUpdate -> appendLog("スコア同期: ${msg.playerGames}-${msg.opponentGames}")
            is PeerMessage.Heartbeat -> Unit
            PeerMessage.EndSession -> stop()
        }
    }

    private fun appendLog(line: String) {
        _ui.update { it.copy(log = (it.log + line).takeLast(20)) }
    }

    override fun onCleared() {
        super.onCleared()
        peerSession.stop()
    }
}
