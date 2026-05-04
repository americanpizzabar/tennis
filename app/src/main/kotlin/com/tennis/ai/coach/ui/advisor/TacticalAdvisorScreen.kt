package com.tennis.ai.coach.ui.advisor

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.tennis.ai.coach.data.tactics.ProTactic
import com.tennis.ai.coach.data.tactics.ScoredTactic
import com.tennis.ai.coach.data.tactics.SituationCategory
import com.tennis.ai.coach.data.tactics.SituationTag

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun TacticalAdvisorScreen(
    onBack: () -> Unit,
    viewModel: TacticalAdvisorViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text("戦術アドバイザー", fontWeight = FontWeight.Bold)
                        Text(
                            "状況を選ぶとプロの戦術を提案",
                            color = Color.Gray,
                            style = MaterialTheme.typography.labelSmall
                        )
                    }
                },
                navigationIcon = {
                    IconButton(onClick = onBack) { Icon(Icons.Default.ArrowBack, null) }
                },
                actions = {
                    if (state.selected.isNotEmpty()) {
                        TextButton(onClick = { viewModel.clear() }) {
                            Text("リセット", color = Color(0xFFEF5350))
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
                .padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            // 選択中タグ表示
            SelectedSummary(state.selected)

            // 推奨戦術（タグが選ばれていれば最上部に）
            if (state.recommendations.isNotEmpty()) {
                Text(
                    "🎯 上位の戦術（${state.recommendations.size}件）",
                    color = Color(0xFFF9A825),
                    fontWeight = FontWeight.Bold,
                    style = MaterialTheme.typography.titleMedium
                )
                state.recommendations.forEach { scored ->
                    TacticResultCard(
                        scored = scored,
                        isExpanded = state.expandedTacticId == scored.tactic.id,
                        onToggleExpand = { viewModel.toggleExpand(scored.tactic.id) }
                    )
                }
                Divider(color = Color.White.copy(alpha = 0.1f), modifier = Modifier.padding(vertical = 4.dp))
            }

            // 状況選択
            Text(
                "現在の状況を選んでください（複数可）",
                color = Color.White,
                fontWeight = FontWeight.Bold,
                style = MaterialTheme.typography.titleSmall
            )

            SituationCategory.values().forEach { cat ->
                CategorySection(
                    category = cat,
                    tags = SituationTag.values().filter { it.category == cat },
                    selected = state.selected,
                    onToggle = viewModel::toggle
                )
            }
        }
    }
}

@Composable
private fun SelectedSummary(selected: Set<SituationTag>) {
    if (selected.isEmpty()) {
        Card(
            colors = CardDefaults.cardColors(containerColor = Color(0xFF1A2E1A)),
            modifier = Modifier.fillMaxWidth()
        ) {
            Row(
                modifier = Modifier.padding(12.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(Icons.Default.Info, null, tint = Color(0xFF4CAF50))
                Spacer(Modifier.width(8.dp))
                Text(
                    "下から状況タグを選ぶと、プロが実際に使う戦術がスコア順に表示されます。",
                    color = Color.White,
                    style = MaterialTheme.typography.bodySmall
                )
            }
        }
    } else {
        Card(
            colors = CardDefaults.cardColors(containerColor = Color(0xFF0D2C4D)),
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(modifier = Modifier.padding(10.dp)) {
                Text(
                    "選択中: ${selected.size}項目",
                    color = Color(0xFF42A5F5),
                    fontWeight = FontWeight.Bold,
                    style = MaterialTheme.typography.labelMedium
                )
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun CategorySection(
    category: SituationCategory,
    tags: List<SituationTag>,
    selected: Set<SituationTag>,
    onToggle: (SituationTag) -> Unit,
) {
    Card(
        colors = CardDefaults.cardColors(containerColor = Color(0xFF0D1F0D)),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(modifier = Modifier.padding(10.dp)) {
            Text(
                category.displayNameJa,
                color = Color.Gray,
                fontWeight = FontWeight.Bold,
                style = MaterialTheme.typography.labelMedium,
                modifier = Modifier.padding(bottom = 6.dp)
            )
            FlowRow(
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                tags.forEach { tag ->
                    SituationChip(
                        tag = tag,
                        selected = tag in selected,
                        onClick = { onToggle(tag) }
                    )
                }
            }
        }
    }
}

@Composable
private fun SituationChip(
    tag: SituationTag,
    selected: Boolean,
    onClick: () -> Unit,
) {
    val bg = if (selected) Color(0xFF2E7D32) else Color(0xFF1A2A1A)
    val border = if (selected) Color(0xFF4CAF50) else Color.Transparent
    Row(
        modifier = Modifier
            .clip(RoundedCornerShape(20.dp))
            .background(bg)
            .border(1.dp, border, RoundedCornerShape(20.dp))
            .clickable(onClick = onClick)
            .padding(horizontal = 10.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(tag.emoji, fontSize = 14.sp)
        Spacer(Modifier.width(4.dp))
        Text(
            tag.displayNameJa,
            color = if (selected) Color.White else Color.LightGray,
            fontWeight = if (selected) FontWeight.Bold else FontWeight.Normal,
            style = MaterialTheme.typography.labelMedium
        )
    }
}

@Composable
private fun TacticResultCard(
    scored: ScoredTactic,
    isExpanded: Boolean,
    onToggleExpand: () -> Unit,
) {
    val tactic = scored.tactic
    Card(
        colors = CardDefaults.cardColors(containerColor = Color(0xFF1A1A2A)),
        modifier = Modifier
            .fillMaxWidth()
            .border(1.dp, Color(0xFF4CAF50).copy(alpha = scored.score), RoundedCornerShape(12.dp))
    ) {
        Column(modifier = Modifier.padding(12.dp)) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.clickable { onToggleExpand() }
            ) {
                Text(tactic.emoji, fontSize = 28.sp)
                Spacer(Modifier.width(10.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            tactic.title,
                            color = Color.White,
                            fontWeight = FontWeight.Bold,
                            style = MaterialTheme.typography.titleSmall,
                            modifier = Modifier.weight(1f)
                        )
                        Surface(
                            color = Color(0xFF1565C0),
                            shape = RoundedCornerShape(6.dp)
                        ) {
                            Text(
                                "${(scored.score * 100).toInt()}%",
                                color = Color.White,
                                modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
                                style = MaterialTheme.typography.labelSmall,
                                fontWeight = FontWeight.Bold
                            )
                        }
                    }
                    Text(
                        tactic.shortDesc,
                        color = Color.Gray,
                        style = MaterialTheme.typography.bodySmall
                    )
                    Spacer(Modifier.height(2.dp))
                    Surface(color = Color(0xFF2A2A3A), shape = RoundedCornerShape(4.dp)) {
                        Text(
                            tactic.category.displayNameJa,
                            color = Color(0xFFF9A825),
                            modifier = Modifier.padding(horizontal = 6.dp, vertical = 1.dp),
                            style = MaterialTheme.typography.labelSmall
                        )
                    }
                }
                Icon(
                    if (isExpanded) Icons.Default.ExpandLess else Icons.Default.ExpandMore,
                    null,
                    tint = Color.Gray
                )
            }

            AnimatedVisibility(visible = isExpanded) {
                Column(modifier = Modifier.padding(top = 10.dp)) {
                    HorizontalDivider(color = Color.White.copy(alpha = 0.1f))
                    DetailBlock(
                        label = "🎓 プロの参考",
                        body = tactic.proReference,
                        accent = Color(0xFFF9A825)
                    )
                    DetailBlock(
                        label = "📋 実行ステップ",
                        body = tactic.executionSteps.mapIndexed { i, s -> "${i + 1}. $s" }.joinToString("\n"),
                        accent = Color(0xFF4CAF50)
                    )
                    DetailBlock(
                        label = "✅ 使うべき場面",
                        body = tactic.whenToUse,
                        accent = Color(0xFF42A5F5)
                    )
                    DetailBlock(
                        label = "⚠️ 避けるべき場面",
                        body = tactic.whenNotToUse,
                        accent = Color(0xFFEF5350)
                    )
                    if (scored.matchedTriggers.isNotEmpty()) {
                        Spacer(Modifier.height(6.dp))
                        Text(
                            "今の状況とのマッチ: ${scored.matchedTriggers.joinToString(", ") { it.displayNameJa }}",
                            color = Color(0xFF4CAF50),
                            style = MaterialTheme.typography.labelSmall
                        )
                    }
                    if (scored.matchedAntiTriggers.isNotEmpty()) {
                        Text(
                            "注意：${scored.matchedAntiTriggers.joinToString(", ") { it.displayNameJa }} の状況では効果が落ちます",
                            color = Color(0xFFEF5350),
                            style = MaterialTheme.typography.labelSmall
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun DetailBlock(label: String, body: String, accent: Color) {
    Spacer(Modifier.height(8.dp))
    Text(label, color = accent, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.labelMedium)
    Text(body, color = Color.White.copy(alpha = 0.9f), style = MaterialTheme.typography.bodySmall, lineHeight = 18.sp)
}
