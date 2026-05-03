package com.tennis.ai.coach.ui.profile

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Check
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.tennis.ai.coach.data.model.DominantHand
import com.tennis.ai.coach.data.model.Gender
import com.tennis.ai.coach.data.model.PlayerLevel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProfileSetupScreen(
    viewModel: ProfileViewModel = hiltViewModel(),
    onSaved: () -> Unit
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()

    LaunchedEffect(uiState.saved) {
        if (uiState.saved) onSaved()
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("プロフィール設定") },
                navigationIcon = {
                    IconButton(onClick = onSaved) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "戻る")
                    }
                },
                actions = {
                    IconButton(onClick = { viewModel.save() }) {
                        Icon(Icons.Default.Check, contentDescription = "保存")
                    }
                }
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(20.dp)
        ) {
            // 名前
            OutlinedTextField(
                value = uiState.name,
                onValueChange = viewModel::updateName,
                label = { Text("名前") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true
            )

            // レベル
            SectionTitle("プレイレベル")
            SingleChoiceGroup(
                options = PlayerLevel.values().map { it.displayNameJa },
                selectedIndex = PlayerLevel.values().indexOfFirst { it == uiState.level },
                onSelect = { viewModel.updateLevel(PlayerLevel.values()[it]) }
            )

            // 性別
            SectionTitle("性別")
            SingleChoiceGroup(
                options = Gender.values().map { it.displayNameJa },
                selectedIndex = Gender.values().indexOfFirst { it == uiState.gender },
                onSelect = { viewModel.updateGender(Gender.values()[it]) }
            )

            // 利き手
            SectionTitle("利き手")
            SingleChoiceGroup(
                options = DominantHand.values().map { it.displayNameJa },
                selectedIndex = DominantHand.values().indexOfFirst { it == uiState.dominantHand },
                onSelect = { viewModel.updateHand(DominantHand.values()[it]) }
            )

            Spacer(Modifier.height(16.dp))

            Button(
                onClick = { viewModel.save() },
                modifier = Modifier.fillMaxWidth(),
                enabled = !uiState.isSaving
            ) {
                if (uiState.isSaving) {
                    CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp)
                } else {
                    Text("保存する", style = MaterialTheme.typography.bodyLarge)
                }
            }
        }
    }
}

@Composable
private fun SectionTitle(text: String) {
    Text(
        text,
        style = MaterialTheme.typography.titleSmall,
        fontWeight = FontWeight.Bold,
        color = MaterialTheme.colorScheme.primary
    )
}

@Composable
private fun SingleChoiceGroup(
    options: List<String>,
    selectedIndex: Int,
    onSelect: (Int) -> Unit
) {
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        options.chunked(3).forEachIndexed { rowIdx, rowItems ->
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                rowItems.forEachIndexed { colIdx, label ->
                    val globalIdx = rowIdx * 3 + colIdx
                    val selected = globalIdx == selectedIndex
                    FilterChip(
                        selected = selected,
                        onClick = { onSelect(globalIdx) },
                        label = { Text(label) },
                        modifier = Modifier.weight(1f)
                    )
                }
                // 空白埋め
                repeat(3 - rowItems.size) {
                    Spacer(modifier = Modifier.weight(1f))
                }
            }
        }
    }
}
