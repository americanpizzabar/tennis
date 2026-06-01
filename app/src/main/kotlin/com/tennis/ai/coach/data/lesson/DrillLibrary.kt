package com.tennis.ai.coach.data.lesson

import com.tennis.ai.coach.data.model.CheckpointResult
import com.tennis.ai.coach.data.model.RecommendedDrill
import com.tennis.ai.coach.data.model.SwingType

/**
 * 弱点チェックポイントから具体的な練習ドリルを提案する。
 * 「打点が20cm後ろ → 手出し球出しドリル15球」のように弱点と1対1で対応させる。
 */
object DrillLibrary {

    fun recommendFor(
        swingType: SwingType,
        checkpoints: List<CheckpointResult>,
    ): List<RecommendedDrill> {
        val weak = checkpoints.filter { it.score < 70 }.sortedBy { it.score }
        if (weak.isEmpty()) {
            return listOf(maintenanceDrill(swingType))
        }
        return weak.take(3).mapIndexed { idx, cp ->
            drillForCheckpoint(swingType, cp.checkpointId, cp.nameJa, cp.measuredText)
                .copy(priority = idx + 1)
        }
    }

    private fun drillForCheckpoint(
        swing: SwingType,
        checkpointId: String,
        cpName: String,
        measured: String,
    ): RecommendedDrill = when {
        checkpointId.contains("contact") || checkpointId.contains("contact_point") ->
            RecommendedDrill(
                titleJa = "手出し球出し・打点前出しドリル",
                descriptionJa = "コーチや壁から緩い球を手出しで出し、体の前 +20cm で捉える感覚を反復。" +
                    "打点で「ラケット面が見える」位置を確認しながら打つ。",
                reasonJa = "$cpName が理想から外れています（計測: $measured）。打点を前に戻す。",
                targetSwingType = swing,
                recommendedReps = 15,
                estimatedMinutes = 10,
                priority = 1,
            )
        checkpointId.contains("knee") ->
            RecommendedDrill(
                titleJa = "膝の沈み込み・地面反力ドリル",
                descriptionJa = "シャドースイングで「膝を曲げて伸び上がる」リズムを 10 回。" +
                    "その後、球出しで下半身から打つ感覚を 15 球。",
                reasonJa = "$cpName の使い方に改善余地があります（計測: $measured）。",
                targetSwingType = swing,
                recommendedReps = 15,
                estimatedMinutes = 10,
                priority = 1,
            )
        checkpointId.contains("shoulder") || checkpointId.contains("rotation") ->
            RecommendedDrill(
                titleJa = "肩の捻り・横向きキープドリル",
                descriptionJa = "非利き手をラケットスロートに添えてテイクバックし、" +
                    "打つ瞬間まで肩を開かない練習を 15 球。",
                reasonJa = "$cpName が不足しています（計測: $measured）。上半身の捻りで力を溜める。",
                targetSwingType = swing,
                recommendedReps = 15,
                estimatedMinutes = 8,
                priority = 1,
            )
        checkpointId.contains("toss") ->
            RecommendedDrill(
                titleJa = "トス安定ドリル",
                descriptionJa = "ボールを打たずにトスだけを 20 回。前方の決まった一点（傘の先など）に" +
                    "毎回同じ高さで上げる練習。",
                reasonJa = "$cpName が安定していません（計測: $measured）。",
                targetSwingType = swing,
                recommendedReps = 20,
                estimatedMinutes = 7,
                priority = 1,
            )
        checkpointId.contains("pronation") ->
            RecommendedDrill(
                titleJa = "プロネーション素振りドリル",
                descriptionJa = "ラケットを短く持ち、インパクトで前腕を内側に返す動きを 20 回素振り。" +
                    "その後サーブで音が変わるのを確認しながら 15 球。",
                reasonJa = "$cpName が使えていません（計測: $measured）。手首の返しでスピードを出す。",
                targetSwingType = swing,
                recommendedReps = 15,
                estimatedMinutes = 10,
                priority = 1,
            )
        checkpointId.contains("takeback") || checkpointId.contains("compact") ->
            RecommendedDrill(
                titleJa = "コンパクト・テイクバックドリル",
                descriptionJa = "肩より後ろにラケットを引かないよう、後ろに壁やネットを背にして" +
                    "短いテイクバックでボレー 15 球。",
                reasonJa = "$cpName が大きすぎ／タイミングがずれています（計測: $measured）。",
                targetSwingType = swing,
                recommendedReps = 15,
                estimatedMinutes = 8,
                priority = 1,
            )
        checkpointId.contains("slice") || checkpointId.contains("path") ->
            RecommendedDrill(
                titleJa = "スライス軌道ドリル",
                descriptionJa = "高い構えから低く切り抜く軌道を意識して 15 球。" +
                    "ネット手前にコーンを置き、低く滑らせる。",
                reasonJa = "$cpName の軌道に改善余地があります（計測: $measured）。",
                targetSwingType = swing,
                recommendedReps = 15,
                estimatedMinutes = 8,
                priority = 1,
            )
        checkpointId.contains("follow") ->
            RecommendedDrill(
                titleJa = "フォロースルー延長ドリル",
                descriptionJa = "打球方向へ腕を長く伸ばし、フィニッシュで 1 秒静止する練習を 15 球。",
                reasonJa = "$cpName が短いです（計測: $measured）。振り抜きを長く。",
                targetSwingType = swing,
                recommendedReps = 15,
                estimatedMinutes = 7,
                priority = 1,
            )
        checkpointId.contains("disguise") || checkpointId.contains("soft") ->
            RecommendedDrill(
                titleJa = "ドロップショット・タッチドリル",
                descriptionJa = "通常ストロークと同じ構えから、当てる瞬間にラケットを止めて" +
                    "ネット際に落とす練習を 15 球。",
                reasonJa = "$cpName が読まれやすい／飛びすぎです（計測: $measured）。",
                targetSwingType = swing,
                recommendedReps = 15,
                estimatedMinutes = 8,
                priority = 1,
            )
        else ->
            RecommendedDrill(
                titleJa = "${swing.displayNameJa}総合フォームドリル",
                descriptionJa = "シャドースイングでフォーム全体を確認後、球出しで 20 球反復。",
                reasonJa = "$cpName を中心に改善（計測: $measured）。",
                targetSwingType = swing,
                recommendedReps = 20,
                estimatedMinutes = 12,
                priority = 1,
            )
    }

    private fun maintenanceDrill(swing: SwingType): RecommendedDrill =
        RecommendedDrill(
            titleJa = "${swing.displayNameJa}キープ・反復ドリル",
            descriptionJa = "良いフォームが出ています。連続 30 球で精度と再現性を高めましょう。",
            reasonJa = "大きな弱点がないため、現状維持と再現性向上が目標。",
            targetSwingType = swing,
            recommendedReps = 30,
            estimatedMinutes = 15,
            priority = 1,
        )
}
