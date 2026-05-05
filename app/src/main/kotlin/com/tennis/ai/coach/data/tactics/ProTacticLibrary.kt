package com.tennis.ai.coach.data.tactics

private typealias S = SituationTag
private typealias C = TacticCategory

/**
 * プロのコーチング教材・選手の試合分析を参考にした戦術ライブラリ。
 * 状況タグの一致度でスコアリングし、上位を提示する。
 */
object ProTacticLibrary {

    val all: List<ProTactic> = listOf(

        // ── サーブ戦術 ───────────────────────────────────
        ProTactic(
            id = "serve_wide_then_open",
            title = "ワイドサーブ → オープンコート",
            emoji = "🎯",
            category = C.SERVE,
            shortDesc = "ワイドで相手をコート外へ追い出し、空いた逆側を仕留める",
            proReference = "ロジャー・フェデラーが多用する基本パターン1。",
            executionSteps = listOf(
                "デュースサイドからスライスサーブで相手のフォア外側へ大きく振り出す",
                "サーブ直後、自分は1〜2歩センターに戻る",
                "相手のリターンが浅く返ってきたら3球目をオープンしたバック側へ展開",
                "深く返されたらクロスで時間を使い、もう一度ワイドサーブで反復"
            ),
            whenToUse = "デュースサイドからのサーブ／相手のフットワークが遅いとき／ハードコートで角度がつくとき",
            whenNotToUse = "強風時はコントロールが難しい／クレーで滑って届かれやすい",
            triggers = setOf(S.SERVING, S.SERVING_DEUCE, S.OPP_SLOW_MOVER, S.HARD_COURT, S.OPP_BACKHAND_WEAK),
            antiTriggers = setOf(S.WINDY, S.CLAY_COURT),
            baseConfidence = 0.85f,
        ),
        ProTactic(
            id = "serve_t_kick",
            title = "Tセンターへキックサーブ",
            emoji = "⛰️",
            category = C.SERVE,
            shortDesc = "高く跳ねるキックサーブで相手のバックハンドの肩口を突く",
            proReference = "ラファエル・ナダル／ノバク・ジョコビッチがアドサイドで多用。",
            executionSteps = listOf(
                "アドサイドからセンター（T）寄りにキックサーブを打つ",
                "ボールの上を強く擦り上げ、ネット上1.2m以上を通す",
                "相手のバック肩口で跳ねたら、3球目はオープンしたフォアサイドへ",
                "返球が高く浅ければ、すぐに前進してフォアの順クロスで決める"
            ),
            whenToUse = "アドサイドからのサーブ／相手が右利きでバックが弱い／クレーで跳ね上がるコート",
            whenNotToUse = "相手が背が高くハイボレーが得意／強い向かい風",
            triggers = setOf(S.SERVING, S.SERVING_AD, S.OPP_BACKHAND_WEAK, S.CLAY_COURT, S.SELF_FIRST_SERVE_LOW),
            antiTriggers = setOf(S.OPP_TALL, S.WINDY),
            baseConfidence = 0.82f,
        ),
        ProTactic(
            id = "serve_body_jam",
            title = "ボディサーブで詰まらせる",
            emoji = "🎳",
            category = C.SERVE,
            shortDesc = "腰元を狙い、リターンを窮屈にする",
            proReference = "アンディ・ロディック／ジョン・イズナーの定番。",
            executionSteps = listOf(
                "相手の利き腕側の腰〜みぞおち付近を狙う",
                "速度よりもコース重視。フラット気味で弾道を低く",
                "詰まったリターンは大体センター寄りに浮いて返ってくる",
                "3球目は浮いた球を前進してフォアで叩き込む"
            ),
            whenToUse = "リターンの構えが大きい相手／背が高い相手のフットワークを止めたい時／ブレークポイントを凌ぎたい場面",
            whenNotToUse = "相手がコンパクトなブロックリターンを得意とする時",
            triggers = setOf(S.SERVING, S.OPP_TALL, S.BREAK_POINT_AGAINST, S.OPP_AGGRESSIVE),
            baseConfidence = 0.78f,
        ),
        ProTactic(
            id = "serve_lefty_slice_ad",
            title = "アドサイドからの左利きスライス",
            emoji = "🌀",
            category = C.SERVE,
            shortDesc = "右利きにとっての逆ワイドで大きく逃がす",
            proReference = "ラファエル・ナダルの代表的サーブパターン。",
            executionSteps = listOf(
                "左利きのアドサイドから、右利き相手のバック外へ大きく曲げる",
                "サーブ後、自分はセンター寄りに戻りつつ前進準備",
                "相手は届かないか中ロブ気味の返球になりやすい",
                "オープンコート（フォアサイド）にフォアで決め球"
            ),
            whenToUse = "自分が左利き／相手が右利きの典型的バックハンド側を攻めたい時",
            whenNotToUse = "相手が左利き同士",
            triggers = setOf(S.SERVING, S.SERVING_AD, S.OPP_BACKHAND_WEAK),
            baseConfidence = 0.83f,
        ),
        ProTactic(
            id = "second_serve_kick_safe",
            title = "セカンドはキックで安全に深く",
            emoji = "🛡️",
            category = C.SERVE,
            shortDesc = "1stが入らない時こそ確率重視のキックで",
            proReference = "ジョコビッチが第2セカンドで使う安全策。",
            executionSteps = listOf(
                "ボール上方を擦り上げる縦回転を意識（フラット禁止）",
                "ターゲットはサービスボックス中央〜やや深め",
                "回転をかけてバウンドを高くし、相手の攻撃を抑える",
                "万一甘くなっても深さがあれば叩かれにくい"
            ),
            whenToUse = "1stサーブが入らない／緊張で腕が縮む／ダブルフォルトを避けたい",
            whenNotToUse = "相手が背の高いバックを持つ／インドアで跳ねが小さい",
            triggers = setOf(S.SERVING, S.SELF_FIRST_SERVE_LOW, S.SELF_NERVOUS, S.BREAK_POINT_AGAINST),
            antiTriggers = setOf(S.OPP_TALL, S.INDOOR),
            baseConfidence = 0.86f,
        ),

        // ── リターン戦術 ────────────────────────────────
        ProTactic(
            id = "return_block_deep",
            title = "ブロックリターンで深く返す",
            emoji = "🧱",
            category = C.RETURN,
            shortDesc = "速いサーブにはコンパクトに当てて深く",
            proReference = "アンドレ・アガシのリターン哲学。",
            executionSteps = listOf(
                "テイクバックを最小限にし、ラケット面を作って早めに構える",
                "ボールを打つというより、面で受けて押し返す",
                "ターゲットは相手ベースライン中央〜やや深め",
                "相手のサーブ＆ボレー阻止のため低く返すのも有効"
            ),
            whenToUse = "相手のサーブが速い／緊張している／序盤リターンの感覚を出したい",
            whenNotToUse = "相手のセカンドが緩い時（攻撃に切り替えるべき）",
            triggers = setOf(S.RETURNING, S.OPP_BIG_SERVE, S.SELF_NERVOUS, S.EARLY_GAME),
            antiTriggers = setOf(S.OPP_WEAK_SERVE),
            baseConfidence = 0.82f,
        ),
        ProTactic(
            id = "return_chip_charge",
            title = "チップ＆チャージ",
            emoji = "🏃",
            category = C.RETURN,
            shortDesc = "セカンドサーブをスライスで返してネット急襲",
            proReference = "ステファン・エドバーグ／パトリック・ラフター。",
            executionSteps = listOf(
                "セカンドサーブの瞬間に前進開始",
                "スライスでボールを低く滑らせ、相手の足元へ",
                "打った勢いをそのままに、ネット中央少し前まで詰める",
                "相手のパッシングを予測し、最初のボレーで角度を決める"
            ),
            whenToUse = "相手のセカンドが緩い／流れを変えたい／グラス／インドア",
            whenNotToUse = "相手のパッシングが強烈／クレーコート",
            triggers = setOf(S.RETURNING, S.OPP_WEAK_SERVE, S.GRASS_COURT, S.INDOOR, S.SELF_WANT_ATTACK, S.TRAILING),
            antiTriggers = setOf(S.CLAY_COURT, S.OPP_AGGRESSIVE),
            baseConfidence = 0.74f,
        ),
        ProTactic(
            id = "return_step_in",
            title = "1歩前で叩くアグレッシブリターン",
            emoji = "💥",
            category = C.RETURN,
            shortDesc = "ライジングで時間を奪う",
            proReference = "ノバク・ジョコビッチのリターンの真骨頂。",
            executionSteps = listOf(
                "通常より1〜2歩ベースライン内側で構える",
                "テイクバックを早く完結させ、ライジングで叩く",
                "ターゲットはベースライン深く、コーナー50cm内側",
                "リターン後すぐに前進し、ベースライン上から主導権を取る"
            ),
            whenToUse = "相手のサーブが遅い／自分のリターンの調子がいい／ブレークが欲しい",
            whenNotToUse = "1stサーブが速い相手／リターンミスが続いている",
            triggers = setOf(S.RETURNING, S.OPP_WEAK_SERVE, S.BREAK_POINT_OWN, S.SELF_WANT_ATTACK, S.TRAILING),
            antiTriggers = setOf(S.OPP_BIG_SERVE),
            baseConfidence = 0.80f,
        ),

        // ── ベースライン戦術 ──────────────────────────
        ProTactic(
            id = "rally_cross_then_dtl",
            title = "クロス3球→ダウン・ザ・ライン",
            emoji = "↗️",
            category = C.BASELINE,
            shortDesc = "クロスで揺さぶり、相手が外に出たら逆を突く",
            proReference = "クレー巧者の王道パターン。ラファエル・ナダル／ドミニク・ティーム。",
            executionSteps = listOf(
                "深いクロスを2〜3球連続で打ち、相手をサイドラインの外へ",
                "相手のスタンスがクロス側に流れたのを確認",
                "ボールが浅く来た瞬間、ストレートへ素早く展開",
                "ストレートを打った後はセンターへリカバリー"
            ),
            whenToUse = "ベースラインラリー戦／クレー／時間を使いたい／自分のフォアの調子が良い",
            whenNotToUse = "相手のフォアがフルパワー／自分のフォアの調子が悪い",
            triggers = setOf(S.SINGLES, S.CLAY_COURT, S.OPP_BACKHAND_WEAK, S.MID_GAME, S.SELF_WANT_ATTACK),
            antiTriggers = setOf(S.SELF_FH_OFF, S.OPP_FOREHAND_STRONG),
            baseConfidence = 0.83f,
        ),
        ProTactic(
            id = "high_heavy_to_bh",
            title = "高い弾道のヘビートップスピンをバックへ",
            emoji = "🌋",
            category = C.BASELINE,
            shortDesc = "相手のバックハンドの肩より上で打たせない",
            proReference = "ナダルの対フェデラー必勝パターン。",
            executionSteps = listOf(
                "ネット上1.5〜2mを通し、相手バック側深くへ",
                "強いトップスピンで相手肩〜頭の高さで弾ませる",
                "相手は下がるか中ロブ気味になりやすい",
                "中ロブが来たら一気に前進してフォアで仕留める"
            ),
            whenToUse = "相手の片手バック／クレー／自分のフォアの調子が良い",
            whenNotToUse = "風が強い／相手が両手バックでハイボールに強い",
            triggers = setOf(S.OPP_BACKHAND_WEAK, S.CLAY_COURT, S.SELF_WANT_ATTACK, S.OPP_TALL),
            antiTriggers = setOf(S.WINDY),
            baseConfidence = 0.84f,
        ),
        ProTactic(
            id = "moonball_reset",
            title = "ムーンボールでリズムを切る",
            emoji = "🌙",
            category = C.BASELINE,
            shortDesc = "山なりの高い深いボールでテンポを変える",
            proReference = "アンディ・マレーがピンチで多用する切り替え戦術。",
            executionSteps = listOf(
                "ネット上3m以上を通す山なりの軌道",
                "ベースライン手前1m以内に深く落とす",
                "相手のリズムが崩れた瞬間、自分は呼吸を整え立て直す",
                "次球は鋭いストレートかドロップでギャップを突く"
            ),
            whenToUse = "ラリーで押されている／自分が疲れている／相手が攻撃的",
            whenNotToUse = "風が強い／相手が背高くハイボレー強い",
            triggers = setOf(S.SELF_TIRED, S.OPP_AGGRESSIVE, S.TRAILING, S.SELF_WANT_DEFEND),
            antiTriggers = setOf(S.WINDY, S.OPP_TALL),
            baseConfidence = 0.72f,
        ),
        ProTactic(
            id = "drop_shot_chase",
            title = "ドロップ → 追い球（ロブ or パッシング）",
            emoji = "🐇",
            category = C.PATTERN,
            shortDesc = "前後に大きく揺さぶり、体力と集中力を削る",
            proReference = "ノバク・ジョコビッチ／カルロス・アルカラスの定番コンボ。",
            executionSteps = listOf(
                "深いラリーで「下がる印象」を作っておく",
                "突如ネット際にドロップ（高さは3〜4個分まで）",
                "相手が前に出てきたら、止まれば抜くロブ／前なら足元パッシング",
                "決めた後は自分も詰めて高めのポジションで次に備える"
            ),
            whenToUse = "相手が疲れている／フットワークが遅い／クレーで滑る／ペースを変えたい",
            whenNotToUse = "風が強い／相手の前後動が速い",
            triggers = setOf(S.OPP_TIRED, S.OPP_SLOW_MOVER, S.CLAY_COURT, S.MID_GAME, S.LATE_GAME, S.SELF_WANT_ATTACK),
            antiTriggers = setOf(S.WINDY),
            baseConfidence = 0.79f,
        ),
        ProTactic(
            id = "inside_out_forehand",
            title = "回り込みフォアの順クロス",
            emoji = "🌀",
            category = C.BASELINE,
            shortDesc = "バックに来た球を回り込み、相手バック側へ強打",
            proReference = "ロジャー・フェデラーの代名詞「インサイドアウト」。",
            executionSteps = listOf(
                "相手の球がバック寄りに来たら、回り込みでフォアで打つ準備",
                "順クロスで相手のバックハンド側深く（=自分から見て対角線）",
                "回り込んだ後はセンターより少しフォア側に戻る",
                "相手の返しが浅ければ、ストレートにフォアで仕留める"
            ),
            whenToUse = "自分のフォアが武器／相手のバックが弱い／自分のフォア側に余裕があるとき",
            whenNotToUse = "自分のフォアの調子が悪い／相手のフォアが強烈",
            triggers = setOf(S.SINGLES, S.OPP_BACKHAND_WEAK, S.SELF_WANT_ATTACK, S.MID_GAME),
            antiTriggers = setOf(S.SELF_FH_OFF),
            baseConfidence = 0.85f,
        ),

        // ── ネットプレー ───────────────────────────────
        ProTactic(
            id = "approach_short_then_volley",
            title = "アプローチ→ファーストボレー深く",
            emoji = "⚡",
            category = C.NET,
            shortDesc = "浅い球で前進し、ファーストボレーは深く決め球は角度",
            proReference = "ピート・サンプラスの王道アプローチ。",
            executionSteps = listOf(
                "相手の浅い球（サービスライン付近）を見極めて前進",
                "アプローチショットはストレート深く（バック側がおすすめ）",
                "サービスラインまで詰めてスプリットステップ",
                "ファーストボレーは深く、セカンドボレーで角度をつけて決める"
            ),
            whenToUse = "グラス／インドア／相手の球が浅い／流れを変えたい",
            whenNotToUse = "相手のパッシングが強烈／クレーで足元に取られやすい",
            triggers = setOf(S.GRASS_COURT, S.INDOOR, S.SELF_WANT_ATTACK, S.OPP_DEFENSIVE),
            antiTriggers = setOf(S.CLAY_COURT, S.OPP_AGGRESSIVE),
            baseConfidence = 0.80f,
        ),
        ProTactic(
            id = "swinging_volley",
            title = "スイングボレーで時間を奪う",
            emoji = "🦅",
            category = C.NET,
            shortDesc = "高く浮いたボールを下がらず空中で叩く",
            proReference = "セリーナ・ウィリアムズ／カルロス・アルカラスの得意技。",
            executionSteps = listOf(
                "山なりに浮いたボールを見たら、下がらず前へ",
                "ストロークと同じスイングで空中のボールを叩く",
                "ターゲットはオープンコート、または相手の足元",
                "決められなくても相手の戻り時間を奪える"
            ),
            whenToUse = "相手がムーンボールを多用／中ロブが上がってきた／攻めたい場面",
            whenNotToUse = "風が強い／自分が初級〜中級でリスクが高い",
            triggers = setOf(S.SELF_WANT_ATTACK, S.OPP_DEFENSIVE, S.MID_GAME),
            antiTriggers = setOf(S.WINDY),
            baseConfidence = 0.70f,
        ),

        // ── 守備／メンタル ─────────────────────────────
        ProTactic(
            id = "neutral_long_rally",
            title = "ニュートラルで深いラリー",
            emoji = "♻️",
            category = C.DEFENSIVE,
            shortDesc = "ミスを減らし相手のミスを待つ",
            proReference = "サイモン・ジル・ジル系の安定派戦術。",
            executionSteps = listOf(
                "ネット上1mの安全マージンで深いボールを返す",
                "コースは中央〜クロス70%、ストレート30%程度",
                "1ポイント10球以上を当たり前と考える",
                "相手が短い球を打つまで攻めない"
            ),
            whenToUse = "リードしている／緊張している／相手がアグレッシブ／クレー",
            whenNotToUse = "相手が深い球を主導権に変えてくる",
            triggers = setOf(S.LEADING, S.SELF_NERVOUS, S.OPP_AGGRESSIVE, S.CLAY_COURT, S.SELF_WANT_DEFEND),
            baseConfidence = 0.78f,
        ),
        ProTactic(
            id = "pattern_breaker",
            title = "パターンブレイカー（流れ転換ショット）",
            emoji = "🔁",
            category = C.MENTAL,
            shortDesc = "ビハインド時にあえてリスクショットで流れを断つ",
            proReference = "ジミー・コナーズ／カルロス・アルカラスのギア切替。",
            executionSteps = listOf(
                "決めるのではなく「相手の予想を裏切る」が目的",
                "突然のドロップ、サーブ＆ボレー、リターンチップ＆チャージなど",
                "1ポイントで決められなくても OK。相手の集中を切る",
                "次のポイントは堅実に深く返してリードを再構築"
            ),
            whenToUse = "ゲームを連取されている／相手にリズムを掴まれている／自分のサービスゲームを取り戻したい",
            whenNotToUse = "リードしていて流れが良い時（リスク不要）",
            triggers = setOf(S.TRAILING, S.SELF_NERVOUS, S.BREAK_POINT_AGAINST, S.LATE_GAME),
            antiTriggers = setOf(S.LEADING),
            baseConfidence = 0.68f,
        ),
        ProTactic(
            id = "mental_routine_breath",
            title = "ポイント間の儀式で再集中",
            emoji = "🧘",
            category = C.MENTAL,
            shortDesc = "ガット整え＋深呼吸で頭を冷やす",
            proReference = "ラファエル・ナダルの完璧なルーティン。",
            executionSteps = listOf(
                "ポイントが終わったら反対側に背を向ける",
                "ガットを4〜5本整えながら3秒で吸って6秒で吐く",
                "頭の中で次のポイントの第一打のコースを決める",
                "ベースラインに戻ったら過去のポイントは忘れる"
            ),
            whenToUse = "緊張している／連続ミスをした／重要な場面の前",
            whenNotToUse = "（特になし、いつでも有効）",
            triggers = setOf(S.SELF_NERVOUS, S.BREAK_POINT_OWN, S.BREAK_POINT_AGAINST, S.SET_POINT_OWN, S.SET_POINT_AGAINST, S.TIEBREAK),
            baseConfidence = 0.90f,
        ),
        ProTactic(
            id = "play_short_points",
            title = "ショートポイントで体力温存",
            emoji = "⏱️",
            category = C.MENTAL,
            shortDesc = "ラリー長期化を避けて勝負を早める",
            proReference = "ピート・サンプラス／ニック・キリオスの省エネ流。",
            executionSteps = listOf(
                "1stサーブ確率を最優先（強さより入れる）",
                "リターンも3球以内に決着を目指す配球",
                "ラリーが長引きそうな場面でドロップやネットダッシュで切る",
                "ポイント間も最大時間使って回復"
            ),
            whenToUse = "自分が疲れている／暑い／ファイナルセット／相手が長いラリーを望む",
            whenNotToUse = "サーブの調子が悪い／クレーコート",
            triggers = setOf(S.SELF_TIRED, S.HUMID, S.FINAL_SET, S.OPP_DEFENSIVE),
            antiTriggers = setOf(S.SELF_FIRST_SERVE_LOW, S.CLAY_COURT),
            baseConfidence = 0.74f,
        ),

        // ── ダブルス専用 ───────────────────────────────
        ProTactic(
            id = "doubles_i_formation",
            title = "Iフォーメーション",
            emoji = "🅸",
            category = C.DOUBLES,
            shortDesc = "前衛がセンターに座り、リターン側を惑わす",
            proReference = "ブライアン兄弟（マイク／ボブ）の代名詞。",
            executionSteps = listOf(
                "前衛がセンターラインにしゃがみ、サインで動く方向を決定",
                "サーバーは合意したコースへサーブ（多くはT or ボディ）",
                "前衛は決めた方向（左or右）へサーブ後すぐ動く",
                "リターナーがコースを読みにくく、ストレートを牽制できる"
            ),
            whenToUse = "ダブルス／リターンが良い相手／流れを変えたい／タイブレーク",
            whenNotToUse = "シングルス（無効）／前衛との連携が取れていない",
            triggers = setOf(S.DOUBLES, S.OPP_AGGRESSIVE, S.BREAK_POINT_AGAINST, S.TIEBREAK),
            antiTriggers = setOf(S.SINGLES),
            baseConfidence = 0.82f,
        ),
        ProTactic(
            id = "doubles_australian",
            title = "オーストラリアンフォーメーション",
            emoji = "🇦🇺",
            category = C.DOUBLES,
            shortDesc = "前衛がサーバーと同じサイドに立ちクロスを封じる",
            proReference = "全豪オープンで多用される名前の通りの戦術。",
            executionSteps = listOf(
                "サーバーと前衛が同じサイドに並ぶ",
                "サーブ後、サーバーが空いた逆サイドへ走る",
                "リターナーは慣れたクロスが封じられストレートに振らされる",
                "ストレートに来た球を前衛がポーチで仕留める"
            ),
            whenToUse = "ダブルス／相手のクロスリターンが強烈／パターン化されたリターンを崩したい",
            whenNotToUse = "シングルス／前衛のフットワークが遅い",
            triggers = setOf(S.DOUBLES, S.OPP_AGGRESSIVE, S.MID_GAME),
            antiTriggers = setOf(S.SINGLES),
            baseConfidence = 0.76f,
        ),
        ProTactic(
            id = "doubles_lob_then_switch",
            title = "ロブ → サイドチェンジ",
            emoji = "☁️",
            category = C.DOUBLES,
            shortDesc = "ネット詰めの相手にロブで下がらせ陣形を変える",
            proReference = "並行陣崩しの基本。",
            executionSteps = listOf(
                "相手の前衛がポーチに出る兆候を見たら、ロブで頭上を抜く",
                "ロブが決まれば自分達が前へ詰めて並行陣を取る",
                "決まらなくても相手の陣形が崩れる",
                "次の球は相手のセンターを突いて連携を切る"
            ),
            whenToUse = "ダブルス／相手の前衛が積極的／並行陣で押されている",
            whenNotToUse = "風が強い／屋外で太陽が眩しい",
            triggers = setOf(S.DOUBLES, S.OPP_AGGRESSIVE, S.OPP_NET_PLAYER),
            antiTriggers = setOf(S.WINDY, S.SUNNY, S.SINGLES),
            baseConfidence = 0.78f,
        ),
        ProTactic(
            id = "doubles_poach_signal",
            title = "ポーチサイン連携",
            emoji = "🤙",
            category = C.DOUBLES,
            shortDesc = "前衛のサインでポーチ・スティを使い分け",
            proReference = "全てのトッププロダブルスチームの基本。",
            executionSteps = listOf(
                "サーブ前、前衛が背中で「グー（ポーチ）」「パー（待機）」のサイン",
                "サーバーはコースを合わせる：ポーチなら相手バックへ、待機なら自由",
                "前衛は決めたら必ず動く（迷いは禁物）",
                "ポーチ後はサーバーが空いたサイドへスイッチ"
            ),
            whenToUse = "ダブルス／相手リターンが読まれている／序盤に主導権を握りたい",
            whenNotToUse = "シングルス／パートナーとの連携初日",
            triggers = setOf(S.DOUBLES, S.SERVING, S.EARLY_GAME),
            antiTriggers = setOf(S.SINGLES),
            baseConfidence = 0.85f,
        ),

        // ── 環境戦術 ──────────────────────────────────
        ProTactic(
            id = "wind_low_flat",
            title = "風対応：低い弾道で深く",
            emoji = "🌬️",
            category = C.BASELINE,
            shortDesc = "山なりは禁物、ネット上30〜50cmを通す",
            proReference = "ウィンブルドン経験者のスタンダード。",
            executionSteps = listOf(
                "トップスピンを少し抑え、フラット気味に",
                "ターゲットはネット上30〜50cmで深く",
                "風下サイドから打つ時は減速、風上サイドは振り抜く",
                "サーブはコースより確率重視。1stを必ず入れる"
            ),
            whenToUse = "屋外で風が強い／屋外オーストラリアンオープン的状況",
            whenNotToUse = "インドア",
            triggers = setOf(S.WINDY),
            antiTriggers = setOf(S.INDOOR),
            baseConfidence = 0.82f,
        ),
        ProTactic(
            id = "sun_change_pattern",
            title = "太陽サイドではコース変更",
            emoji = "☀️",
            category = C.SERVE,
            shortDesc = "トスを目に直接入れず、サイドにずらす",
            proReference = "全豪・全米デイセッションの常識。",
            executionSteps = listOf(
                "コートチェンジでトスの位置を確認",
                "太陽が目に入るならトスを通常より右（または左）へずらす",
                "サーブのコースもセンター集中→ボディ・ワイドへ変更",
                "ベースラインプレーでもロブは控えめに"
            ),
            whenToUse = "屋外／日中／太陽が眩しい",
            whenNotToUse = "インドア／ナイトマッチ",
            triggers = setOf(S.SUNNY, S.SERVING),
            antiTriggers = setOf(S.INDOOR),
            baseConfidence = 0.80f,
        ),
        ProTactic(
            id = "humid_short_points",
            title = "蒸し暑さ対策：1stを優先",
            emoji = "💦",
            category = C.MENTAL,
            shortDesc = "1stサーブ確率最優先で短いポイント",
            proReference = "全豪・全米の暑熱戦の鉄則。",
            executionSteps = listOf(
                "1stサーブの速度を10%落として確率を80%以上に",
                "ラリーは5〜6球以内で決着を目指す",
                "ポイント間は必ず25秒フル使用、タオル＋水分",
                "クロスチェンジでは氷タオルを首と脇に"
            ),
            whenToUse = "蒸し暑い／真夏／ファイナルセット",
            whenNotToUse = "涼しい／インドア",
            triggers = setOf(S.HUMID, S.SELF_TIRED, S.FINAL_SET),
            baseConfidence = 0.83f,
        ),

        // ── 終盤・タイブレーク ──────────────────────────
        ProTactic(
            id = "tiebreak_first_mini_break",
            title = "タイブレーク：最初のミニブレーク",
            emoji = "🪢",
            category = C.MENTAL,
            shortDesc = "最初の2ポイントは堅実に。ミニブレーク取れば優位",
            proReference = "ジョコビッチのタイブレーク勝率の高さの源。",
            executionSteps = listOf(
                "リターン側で始まる場合、最初の2ポイントは絶対1stキープ",
                "サーブ側は1球目を必ず1stで入れる",
                "リスクショットは封印。深いラリーから誘発を待つ",
                "5-3 or 6-4 になったらリードを守るプレーへ"
            ),
            whenToUse = "タイブレーク開始時／第3セットなどの大事なTB",
            whenNotToUse = "（常に有効）",
            triggers = setOf(S.TIEBREAK, S.SELF_NERVOUS),
            baseConfidence = 0.86f,
        ),
        ProTactic(
            id = "set_point_against_calm",
            title = "セットポイント阻止：1stを必ず入れる",
            emoji = "🛡️",
            category = C.MENTAL,
            shortDesc = "速度より確率。ボディサーブ＋深いラリーで凌ぐ",
            proReference = "ロジャー・フェデラーの粘りのキープ。",
            executionSteps = listOf(
                "1stサーブを必ず入れる（普段の8割の力で）",
                "コースはボディかワイド。Tセンターは読まれやすい",
                "リターンが返ってきたら深いラリーで時間を稼ぐ",
                "焦って攻めず、相手のミス待ちで OK"
            ),
            whenToUse = "相手のセットポイント／重要なブレークポイント",
            whenNotToUse = "リード時（攻めるべき）",
            triggers = setOf(S.SET_POINT_AGAINST, S.BREAK_POINT_AGAINST, S.SELF_NERVOUS),
            antiTriggers = setOf(S.LEADING),
            baseConfidence = 0.85f,
        ),
        ProTactic(
            id = "leading_protect_serve",
            title = "リード時：自分のサービスを死守",
            emoji = "👑",
            category = C.SERVE,
            shortDesc = "相手のリターンミスを誘う安定サーブ",
            proReference = "ピート・サンプラスのキープ哲学。",
            executionSteps = listOf(
                "1stサーブの確率を80%目標（速度より精度）",
                "コースmix：ワイド/T/ボディを順番に組み合わせる",
                "サービスゲームを早く終わらせる（相手にチャンスを与えない）",
                "ブレークポイントでも普段通りのルーティン"
            ),
            whenToUse = "リードしている／自分のサービスゲーム／終盤",
            whenNotToUse = "ビハインド時（リスクが必要）",
            triggers = setOf(S.LEADING, S.SERVING, S.LATE_GAME),
            antiTriggers = setOf(S.TRAILING),
            baseConfidence = 0.84f,
        ),
        ProTactic(
            id = "trailing_break_strategy",
            title = "ビハインド時：リターンに全集中",
            emoji = "🔥",
            category = C.RETURN,
            shortDesc = "1ブレーク取り返せば五分。リターンゲームに賭ける",
            proReference = "ノバク・ジョコビッチのカムバック必勝法。",
            executionSteps = listOf(
                "リターンゲームを「絶対取る」と決める",
                "30-30、30-40 まで持ち込めばチャンス",
                "セカンドサーブは必ず叩く（1〜2歩前で）",
                "自分のサーブは普段通り、力まずキープ"
            ),
            whenToUse = "ビハインド／リターンゲーム／セット中盤以降",
            whenNotToUse = "リード時",
            triggers = setOf(S.TRAILING, S.RETURNING, S.MID_GAME, S.LATE_GAME, S.BREAK_POINT_OWN),
            antiTriggers = setOf(S.LEADING),
            baseConfidence = 0.78f,
        ),
        ProTactic(
            id = "early_game_observe",
            title = "序盤：相手スカウティング",
            emoji = "🔍",
            category = C.MENTAL,
            shortDesc = "勝ち負けより情報収集。打ち手の癖を見る",
            proReference = "あらゆるトッププロが必ず行うウォームアップ＋第1ゲーム。",
            executionSteps = listOf(
                "第1ゲームは確率重視で深く返すだけ",
                "相手のサーブパターン（ワイド/T/ボディ）の傾向を観察",
                "相手のフォア／バック、走らせた時の対応を確かめる",
                "観察結果から第2〜3ゲームで攻めポイントを決める"
            ),
            whenToUse = "試合開始直後／初対戦の相手",
            whenNotToUse = "顔見知り相手",
            triggers = setOf(S.EARLY_GAME),
            baseConfidence = 0.82f,
        ),

        // ── 対特殊相手 ─────────────────────────────────
        ProTactic(
            id = "vs_lefty_pattern",
            title = "左利き対策：アドサイドのフォアを攻める",
            emoji = "🫲",
            category = C.PATTERN,
            shortDesc = "右利きとは鏡像。アドサイドで相手のバックを突く",
            proReference = "対ナダル戦略の基本（フェデラー／ジョコビッチ）。",
            executionSteps = listOf(
                "アドサイドでは相手のバックハンド側（=自分から見て対角線）を狙う",
                "デュースサイドでは相手のフォア側へワイドで逃がし、空いた逆を突く",
                "サーブも普段の鏡像で：右利き相手のワイドが、左利き相手のT",
                "ラリーは普段より相手のバック狙いの頻度を意識的に上げる"
            ),
            whenToUse = "相手が左利き／対戦経験が浅い相手",
            whenNotToUse = "（左利き相手以外）",
            triggers = setOf(S.OPP_LEFT_HANDED),
            baseConfidence = 0.80f,
        ),
        ProTactic(
            id = "vs_tall_low_slice",
            title = "長身相手：低いスライスで足元へ",
            emoji = "📏",
            category = C.BASELINE,
            shortDesc = "高い打点が得意な相手の足元を攻める",
            proReference = "対イズナー／対オペルカの常套手段。",
            executionSteps = listOf(
                "バックハンドのスライスを膝下に滞空時間短く",
                "ネット前進されたら足元の低い球＋ロブで前後揺さぶり",
                "ストロークもネット30cmの低い弾道で",
                "サーブも全部跳ねさせない（フラット低弾道）"
            ),
            whenToUse = "相手が長身／ハイボレー強い／グラス／インドア",
            whenNotToUse = "クレー（バウンドが上がりやすい）",
            triggers = setOf(S.OPP_TALL, S.OPP_NET_PLAYER, S.GRASS_COURT, S.INDOOR),
            antiTriggers = setOf(S.CLAY_COURT),
            baseConfidence = 0.79f,
        ),
        ProTactic(
            id = "vs_short_high_balls",
            title = "小柄相手：高い弾道で押し込む",
            emoji = "🌋",
            category = C.BASELINE,
            shortDesc = "肩より上で打たせて窮屈にさせる",
            proReference = "ナダルの対小柄選手戦略。",
            executionSteps = listOf(
                "強いトップスピンで肩〜頭上で打たせる",
                "コートの後ろに下げて時間を奪う",
                "下がったら一気にドロップで前後揺さぶる",
                "サーブもキックで肩口へ"
            ),
            whenToUse = "相手が小柄／クレー／自分のフォアが強い",
            whenNotToUse = "（特になし）",
            triggers = setOf(S.OPP_SHORT, S.CLAY_COURT, S.SELF_WANT_ATTACK),
            baseConfidence = 0.78f,
        ),
        ProTactic(
            id = "vs_baseliner_drop",
            title = "ベースライナー対策：前後の揺さぶり",
            emoji = "↕️",
            category = C.PATTERN,
            shortDesc = "深いラリー2〜3球→ドロップでベースライナーを困らせる",
            proReference = "対ジョコビッチ戦略（フェデラー／アルカラス）。",
            executionSteps = listOf(
                "深いクロスラリーを2〜3球で「下がる印象」を作る",
                "突然のドロップで前に走らせる",
                "前に来た瞬間、ロブで頭上を抜くか足元パッシング",
                "1ゲームに2〜3回まで（読まれないように）"
            ),
            whenToUse = "相手がベースラインに張り付く／フットワークが標準以下",
            whenNotToUse = "風が強い／相手の前後動が速い",
            triggers = setOf(S.OPP_BASELINER, S.OPP_DEFENSIVE, S.OPP_SLOW_MOVER),
            antiTriggers = setOf(S.WINDY),
            baseConfidence = 0.81f,
        ),
        ProTactic(
            id = "vs_netplayer_dipping",
            title = "ネットプレーヤー対策：足元dipping",
            emoji = "👞",
            category = C.PATTERN,
            shortDesc = "相手の足元へ低く沈むトップスピン",
            proReference = "対サンプラス／対エドバーグ時代の必勝法。",
            executionSteps = listOf(
                "リターンを相手のサービスライン手前の足元に低く落とす",
                "強いトップスピンで沈ませる（フラットNG）",
                "相手がローボレーを上げたらパッシング or ロブ",
                "前進されたら必ず1球は足元に沈める意識"
            ),
            whenToUse = "相手がサーブ＆ボレー／ネットダッシュ多用",
            whenNotToUse = "風が強い／自分のショット精度が悪い",
            triggers = setOf(S.OPP_NET_PLAYER, S.OPP_AGGRESSIVE, S.RETURNING),
            antiTriggers = setOf(S.WINDY),
            baseConfidence = 0.80f,
        ),
    )

    /**
     * 状況タグの集合から戦術をスコアリングして上位 [limit] 件を返す。
     */
    fun recommend(situations: Set<SituationTag>, limit: Int = 5): List<ScoredTactic> {
        if (situations.isEmpty()) return emptyList()
        return all
            .map { tactic ->
                val matched = tactic.triggers.intersect(situations)
                val antiMatched = tactic.antiTriggers.intersect(situations)
                val matchScore = matched.size.toFloat() / tactic.triggers.size.coerceAtLeast(1)
                val penalty = antiMatched.size * 0.4f
                val score = (matchScore - penalty).coerceIn(0f, 1f) * tactic.baseConfidence
                ScoredTactic(tactic, score, matched, antiMatched)
            }
            .filter { it.score > 0.05f }
            .sortedByDescending { it.score }
            .take(limit)
    }
}

data class ScoredTactic(
    val tactic: ProTactic,
    val score: Float,
    val matchedTriggers: Set<SituationTag>,
    val matchedAntiTriggers: Set<SituationTag>,
)
