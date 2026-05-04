package com.tennis.ai.coach.data.tactics

/**
 * 状況タグ。複数選択して戦術マッチングに使う。
 */
enum class SituationTag(val category: SituationCategory, val displayNameJa: String, val emoji: String) {
    // ── 試合状況 ────────────────────────
    LEADING(SituationCategory.SCORE, "リードしている", "📈"),
    TRAILING(SituationCategory.SCORE, "ビハインド", "📉"),
    DEUCE(SituationCategory.SCORE, "デュース／競り合い", "⚖️"),
    SET_POINT_OWN(SituationCategory.SCORE, "自分のセットポイント", "🎯"),
    SET_POINT_AGAINST(SituationCategory.SCORE, "相手のセットポイント", "🚨"),
    BREAK_POINT_OWN(SituationCategory.SCORE, "自分のブレークポイント", "🔓"),
    BREAK_POINT_AGAINST(SituationCategory.SCORE, "相手のブレークポイント", "🛡️"),
    FINAL_SET(SituationCategory.SCORE, "ファイナルセット", "🏁"),
    TIEBREAK(SituationCategory.SCORE, "タイブレーク中", "🪢"),

    // ── サーブ／リターン ─────────────────
    SERVING(SituationCategory.ROLE, "自分のサーブ", "🎾"),
    RETURNING(SituationCategory.ROLE, "リターンサイド", "🔄"),
    SERVING_DEUCE(SituationCategory.ROLE, "デュースサイドからサーブ", "➡️"),
    SERVING_AD(SituationCategory.ROLE, "アドサイドからサーブ", "⬅️"),

    // ── 相手のスタイル ──────────────────
    OPP_FOREHAND_STRONG(SituationCategory.OPPONENT, "相手のフォアが強い", "💪"),
    OPP_BACKHAND_WEAK(SituationCategory.OPPONENT, "相手のバックが弱い", "🦴"),
    OPP_BIG_SERVE(SituationCategory.OPPONENT, "相手のサーブが速い", "💥"),
    OPP_WEAK_SERVE(SituationCategory.OPPONENT, "相手のサーブが遅い", "🐢"),
    OPP_NET_PLAYER(SituationCategory.OPPONENT, "相手はネットプレーヤー", "🥅"),
    OPP_BASELINER(SituationCategory.OPPONENT, "相手はベースライナー", "🛤️"),
    OPP_LEFT_HANDED(SituationCategory.OPPONENT, "相手は左利き", "🫲"),
    OPP_TALL(SituationCategory.OPPONENT, "相手は背が高い", "🗼"),
    OPP_SHORT(SituationCategory.OPPONENT, "相手は背が低い", "📏"),
    OPP_SLOW_MOVER(SituationCategory.OPPONENT, "相手はフットワークが遅い", "🦥"),
    OPP_AGGRESSIVE(SituationCategory.OPPONENT, "相手は攻撃的", "🦁"),
    OPP_DEFENSIVE(SituationCategory.OPPONENT, "相手は守備的", "🐢"),
    OPP_NERVOUS(SituationCategory.OPPONENT, "相手が緊張している", "😰"),
    OPP_TIRED(SituationCategory.OPPONENT, "相手が疲れている", "💧"),

    // ── 自分のコンディション ────────────
    SELF_TIRED(SituationCategory.SELF, "自分が疲れている", "😮‍💨"),
    SELF_NERVOUS(SituationCategory.SELF, "緊張している", "😬"),
    SELF_FH_OFF(SituationCategory.SELF, "フォアの調子が悪い", "🩹"),
    SELF_BH_OFF(SituationCategory.SELF, "バックの調子が悪い", "🩹"),
    SELF_FIRST_SERVE_LOW(SituationCategory.SELF, "1stサーブが入らない", "📉"),
    SELF_WANT_ATTACK(SituationCategory.SELF, "攻めたい気分", "🔥"),
    SELF_WANT_DEFEND(SituationCategory.SELF, "守りに徹したい", "🛡️"),
    SELF_INJURED(SituationCategory.SELF, "軽い故障あり", "🤕"),

    // ── 環境 ──────────────────────────
    WINDY(SituationCategory.ENV, "風が強い", "🌬️"),
    SUNNY(SituationCategory.ENV, "日差しが強い", "☀️"),
    HUMID(SituationCategory.ENV, "蒸し暑い", "💦"),
    HARD_COURT(SituationCategory.ENV, "ハードコート", "🟦"),
    CLAY_COURT(SituationCategory.ENV, "クレーコート", "🟫"),
    GRASS_COURT(SituationCategory.ENV, "グラスコート", "🟩"),
    INDOOR(SituationCategory.ENV, "インドア", "🏛️"),

    // ── 種目／時間帯 ────────────────────
    SINGLES(SituationCategory.MODE, "シングルス", "👤"),
    DOUBLES(SituationCategory.MODE, "ダブルス", "👥"),
    EARLY_GAME(SituationCategory.PHASE, "序盤", "🌅"),
    MID_GAME(SituationCategory.PHASE, "中盤", "🏃"),
    LATE_GAME(SituationCategory.PHASE, "終盤", "🌆"),
}

enum class SituationCategory(val displayNameJa: String) {
    SCORE("スコア状況"),
    ROLE("サーブ／リターン"),
    OPPONENT("相手のスタイル"),
    SELF("自分のコンディション"),
    ENV("環境"),
    MODE("種目"),
    PHASE("試合時間帯");
}
