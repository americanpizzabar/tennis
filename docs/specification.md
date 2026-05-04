# Tennis AI Coach — システム仕様書

**バージョン:** 1.0.0  
**作成日:** 2026年5月4日  
**対象読者:** 開発者・技術レビュアー・プロジェクトオーナー

---

## 目次

1. [システム概要](#1-システム概要)
2. [動作環境・前提条件](#2-動作環境前提条件)
3. [アーキテクチャ設計](#3-アーキテクチャ設計)
4. [モジュール構成](#4-モジュール構成)
5. [機能仕様](#5-機能仕様)
6. [データモデル仕様](#6-データモデル仕様)
7. [AI・ML エンジン仕様](#7-aiml-エンジン仕様)
8. [画面仕様](#8-画面仕様)
9. [Wear OS 仕様](#9-wear-os-仕様)
10. [パーミッション仕様](#10-パーミッション仕様)
11. [非機能要件](#11-非機能要件)
12. [ライブラリ一覧](#12-ライブラリ一覧)
13. [ファイル構成一覧](#13-ファイル構成一覧)

---

## 1. システム概要

### 1.1 アプリの目的

Tennis AI Coach は、Android スマートフォンをコートサイドに置くだけで、シングルスとダブルスのテニスの試合中にリアルタイムで戦術アドバイスを提供するアプリです。

プレイヤーのレベル・性別・利き手を事前に登録しておくと、試合の流れ・スコア状況・相手選手の傾向・自分のフォームの乱れを AI が自動分析し、「チェンジオーバー中に見てすぐ実行できる」具体的なアドバイスを画面表示とスマートウォッチへの通知で届けます。

### 1.2 対象ユーザー

| ユーザー種別 | 想定レベル | 主な利用シーン |
|---|---|---|
| 一般プレイヤー | 初級〜中上級 | 週末の試合・練習試合 |
| 競技プレイヤー | 上級〜競技 | 公式大会・練習試合分析 |
| テニスコーチ | — | 選手のフォーム・戦術チェック |

### 1.3 サポートする試合種別

- **シングルス**（1対1）
- **ダブルス**（2対2、前衛・後衛の陣形分析あり）

---

## 2. 動作環境・前提条件

### 2.1 スマートフォン（メインアプリ）

| 項目 | 要件 |
|---|---|
| OS | Android 8.0（API 26）以上 |
| 推奨 OS | Android 14 / 15（API 34 / 35） |
| ターゲット SDK | API 35 |
| CPU アーキテクチャ | arm64-v8a（MediaPipe 最適化） |
| RAM | 4GB 以上推奨（ML 推論のため） |
| ストレージ | 本体 200MB 以上の空き（Gemini Nano モデル使用時は +2GB） |
| カメラ | 背面カメラ必須（オートフォーカスは任意） |
| ネットワーク | クラウド AI フォールバック使用時のみ必要。オンデバイスモデル使用時は完全オフライン動作 |

### 2.2 スマートウォッチ（Wear OS アプリ、任意）

| 項目 | 要件 |
|---|---|
| OS | Wear OS 3.0（API 30）以上 |
| ペアリング | 同じ Google アカウントでペアリング済みのスマートフォン |

### 2.3 開発環境

| 項目 | バージョン |
|---|---|
| Android Studio | Ladybug（2024.2.x）以降 |
| Android Gradle Plugin | 8.7.3 |
| Kotlin | 2.1.0 |
| JDK | 17 |

---

## 3. アーキテクチャ設計

### 3.1 全体設計方針

Clean Architecture + MVVM パターンを採用し、以下の 4 層で構成します。

```
┌────────────────────────────────────────┐
│           UI Layer (Compose)           │  ← 画面・ViewModel
├────────────────────────────────────────┤
│           Domain / UseCase             │  ← ビジネスロジック（ルールベース判定）
├────────────────────────────────────────┤
│           Data Layer                   │  ← Repository・DAO・Room DB
├────────────────────────────────────────┤
│     ML / Camera / Service Layer        │  ← AI推論・カメラ・バックグラウンド処理
└────────────────────────────────────────┘
```

### 3.2 依存関係グラフ（概略）

```
MainActivity
  └─ TennisNavHost（Navigation）
       ├─ HomeScreen ← HomeViewModel ← ProfileRepository, MatchRepository
       ├─ ProfileSetupScreen ← ProfileViewModel ← ProfileRepository
       ├─ MatchScreen ← MatchViewModel ← GeminiNanoManager, PoseAnalyzer,
       │                                  BallTracker, OpponentHabitDetector
       │                                  WearDataLayerService
       ├─ VideoAnalysisScreen ← VideoAnalysisViewModel ← GeminiNanoManager
       └─ MatchReportScreen ← MatchReportViewModel ← MatchRepository
```

### 3.3 データフロー（試合中）

```
カメラ（CameraX）
  ├─ PoseAnalyzer（MediaPipe） → PoseMetrics（SharedFlow）
  │       ↓ 打点低下検知
  │   MatchViewModel → requestAdvice()
  │
  ├─ BallTracker（色検出）→ BallDetection → BallLandingPoint（SharedFlow）
  │       ↓ 着弾点を蓄積
  │   MatchUiState.ballLandingHistory → 着弾点マップ表示
  │
  └─ DoublesPositionAnalyzer（PoseランドマークからY座標分析）
          ↓ 陣形警告
      MatchUiState.doublesFormation → 陣形カード表示

GeminiNanoManager
  ├─ オンデバイス LLM（gemini_nano_tennis.bin 配置済みの場合）
  └─ ルールベースフォールバック（モデル未配置の場合）
          ↓
      TacticalAdvice → MatchUiState.currentAdvice → アドバイスカード表示
                                                   → WearDataLayerService → Wear OS
```

### 3.4 DI（依存性注入）

Hilt（Dagger）を使用。シングルトンスコープのコンポーネント：

| コンポーネント | スコープ | 管理モジュール |
|---|---|---|
| TennisDatabase | Singleton | DatabaseModule |
| PlayerProfileDao | Singleton（DB派生） | DatabaseModule |
| MatchReportDao | Singleton（DB派生） | DatabaseModule |
| GeminiNanoManager | Singleton | AppModule |
| PoseAnalyzer | Singleton | AppModule |
| BallTracker | Singleton | AppModule（自動生成） |
| Json（kotlinx.serialization） | Singleton | AppModule |
| CoroutineScope（アプリ全体） | Singleton | AppModule |

---

## 4. モジュール構成

### 4.1 モジュール一覧

| モジュール名 | 種別 | 役割 |
|---|---|---|
| `:app` | Android Application | メインアプリ（スマートフォン） |
| `:wear` | Android Application | Wear OS コンパニオンアプリ |

### 4.2 パッケージ構成（`:app`）

```
com.tennis.ai.coach/
├── TennisApplication.kt        # Hilt アプリケーションクラス
├── MainActivity.kt             # エントリーポイント
├── camera/
│   └── CameraManager.kt        # CameraX 制御・フレーム解析パイプライン
├── data/
│   ├── local/
│   │   ├── TennisDatabase.kt   # Room データベース定義
│   │   └── dao/
│   │       ├── PlayerProfileDao.kt
│   │       └── MatchReportDao.kt
│   ├── model/
│   │   ├── PlayerProfile.kt    # プレイヤー・相手選手モデル
│   │   ├── MatchState.kt       # 試合状態・スコア・ゾーン・陣形モデル
│   │   ├── TacticalAdvice.kt   # アドバイス・配球パターンモデル
│   │   └── MatchReport.kt      # 試合レポート・スタッツモデル
│   └── repository/
│       ├── ProfileRepository.kt
│       └── MatchRepository.kt
├── di/
│   ├── AppModule.kt            # AI・Json・CoroutineScope の提供
│   └── DatabaseModule.kt       # Room DB・DAO の提供
├── ml/
│   ├── GeminiNanoManager.kt    # Gemini Nano（LLM）アドバイス生成
│   ├── PoseAnalyzer.kt         # MediaPipe PoseLandmarker 骨格検知
│   ├── BallTracker.kt          # ボールリアルタイム追跡・着弾点推定
│   ├── OpponentHabitDetector.kt # 相手選手の癖統計検知
│   └── DoublesPositionAnalyzer.kt # ダブルス陣形リアルタイム診断
├── service/
│   ├── MatchAnalysisService.kt # フォアグラウンドサービス（解析継続）
│   └── WearDataLayerService.kt # Wear OS へのデータ送信
└── ui/
    ├── theme/Theme.kt           # Compose テーマ（ダークモード固定）
    ├── navigation/Navigation.kt # Compose Navigation ルート定義
    ├── home/
    │   ├── HomeScreen.kt
    │   └── HomeViewModel.kt
    ├── profile/
    │   ├── ProfileSetupScreen.kt
    │   └── ProfileViewModel.kt
    ├── match/
    │   ├── MatchScreen.kt
    │   └── MatchViewModel.kt
    ├── analysis/
    │   ├── VideoAnalysisScreen.kt
    │   └── VideoAnalysisViewModel.kt
    └── report/
        ├── MatchReportScreen.kt
        └── MatchReportViewModel.kt
```

---

## 5. 機能仕様

### 5.1 プロフィール管理

#### 5.1.1 登録できる情報

| 項目 | 選択肢 | 必須 |
|---|---|---|
| 名前 | 任意テキスト | 任意 |
| プレイレベル | 初級 / 中級 / 中上級 / 上級 / 競技 | 必須 |
| 性別 | 男性 / 女性 / その他 | 必須 |
| 利き手 | 右利き / 左利き | 必須 |

#### 5.1.2 プロフィールの保存仕様
- Room データベースの `player_profiles` テーブルに保存
- アクティブなプロフィールは常に 1 件のみ（`isActive = true`）
- 新規保存時に全プロフィールを `isActive = false` に更新後、新規レコードを `isActive = true` で挿入

---

### 5.2 試合管理

#### 5.2.1 スコア管理

テニスの正式スコアカウントに準拠して実装：

| 状態 | ポイント表示 | 処理 |
|---|---|---|
| 通常ポイント | 0 → 15 → 30 → 40 → ゲーム獲得 | 順次加算 |
| デュース | 40-40 | 次ポイント獲得でアドバンテージ移行 |
| アドバンテージ | AD | 次ポイント獲得でゲーム、失うとデュースに戻る |
| チェンジオーバー | — | ゲーム合計が奇数になった時点で自動発動（90秒カウントダウン） |

#### 5.2.2 フェーズ自動判定

| フェーズ名（内部） | 表示名 | 発動条件 |
|---|---|---|
| POINT | ポイント中 | 通常ラリー |
| CHANGEOVER | チェンジオーバー | ゲーム合計数が奇数 |
| BREAK_POINT | ブレークポイント | 30-40 または デュースからの相手アドバンテージ |
| GAME_POINT | ゲームポイント | 40-30 以上のリード |
| MATCH_POINT | マッチポイント | (実装予定・現在はゲームポイントと同扱い) |

#### 5.2.3 試合タイマー
- 試合開始と同時にバックグラウンドで経過時間カウント（1秒更新）
- 表示形式：`MM:SS`（1時間以上は `H:MM:SS`）
- 試合終了時に `durationMinutes` としてレポートに保存

---

### 5.3 リアルタイム AI 戦術アドバイス

#### 5.3.1 アドバイス生成のトリガー

| トリガー | 詳細 |
|---|---|
| スコアが更新された時 | ポイント獲得・失点のたびに自動生成 |
| 打点が 75cm 以下に低下した時 | PoseAnalyzer が検知次第、即時生成 |
| ユーザーが「更新」ボタンを押した時 | 手動リクエスト |

#### 5.3.2 アドバイスの優先度（緊急度）

| 緊急度 | 表示ラベル | 表示色 | 発動場面 |
|---|---|---|---|
| IMMEDIATE | 今すぐ実行 | 赤 | マッチポイント・打点低下 |
| NORMAL | 次のポイントで | 青 | 通常ポイント間 |
| CHANGEOVER | チェンジオーバーで | グレー | 戦術レベルの提案 |

#### 5.3.3 アドバイスカテゴリ

| カテゴリ | 絵文字 | 内容 |
|---|---|---|
| 配球（SERVE_PLACEMENT） | 🎯 | どこにどんな球を打つか |
| 相手の弱点（OPPONENT_WEAKNESS） | 🔍 | 検知した相手の癖を活用 |
| 陣形（DOUBLES_POSITIONING） | 👥 | ダブルスの立ち位置 |
| フォーム修正（TECHNIQUE） | 🏃 | 骨格検知からの修正提案 |
| メンタル（MENTAL） | 💪 | 精神的な立て直し |
| リターン（RETURN） | 🔄 | 相手サーブへの対応 |
| ネットプレー（NET_PLAY） | ⚡ | 前衛・ボレー戦術 |

#### 5.3.4 配球パターン（ServePlacementPattern）

アドバイスに配球パターンが含まれる場合、以下の情報を表示：

| 情報 | 内容 |
|---|---|
| ターゲットゾーン | 7 コートゾーンのいずれか（下記「コートゾーン」参照） |
| ボール種別 | フラット / スライス / トップスピン / キック / ドロップ / ロブ |
| 推奨速度 | ゆっくり / 普通 / 速め / 全力 |
| 成功率 | 0〜100%（ルールベース or LLM が推定） |
| 説明文 | 1〜2 文の補足 |

#### 5.3.5 コートゾーン定義

| ゾーン ID | 名称 | 画面座標の目安（Y比率） |
|---|---|---|
| DEUCE_SERVICE_BOX | デュースサービスボックス | 上半分・左寄り（Y < 0.5、X < 0.5） |
| AD_SERVICE_BOX | アドサービスボックス | 上半分・右寄り（Y < 0.5、X ≥ 0.5） |
| DEUCE_BASELINE | デュースベースライン | 下半分・左寄り（Y ≥ 0.5、X < 0.33） |
| AD_BASELINE | アドベースライン | 下半分・右寄り（Y ≥ 0.5、X > 0.67） |
| CENTER_BASELINE | センターベースライン | 下半分・中央（Y ≥ 0.5、0.33 ≤ X ≤ 0.67） |
| NET | ネット | — |
| OUT | アウト | コート外枠外 |

---

### 5.4 相手選手の癖自動検知

#### 5.4.1 検知対象の癖

| 癖 ID | 説明 | 検知方法 | アラート発動閾値 |
|---|---|---|---|
| bh_slice_tendency | バックハンドを打つ時ほぼ必ずスライス | バックハンドショットの ball type 統計 | 観測 5 回以上かつ確信度 65% 以上 |
| serve_wide_tendency | 2nd サーブがボディに集まりやすい | サーブ着弾ゾーン統計 | 観測 5 回以上かつ確信度 65% 以上 |
| fh_crosscourt_tendency | フォアハンドがクロスコート多用 | フォア着弾ゾーン統計 | 観測 5 回以上かつ確信度 65% 以上 |
| serve_toss_left | サーブトスが左に寄るとワイドへ | トス位置 X 座標統計（30 サンプル以内） | 観測 10 回以上かつ左偏率 65% 以上 |

#### 5.4.2 アラート表示仕様
- 癖が検知された瞬間、画面上部に赤いバナー表示（スライドイン・フェードイン）
- **3 秒後に自動消去**（同じ癖 ID の場合）
- バナーには：癖の説明文・確信度（%）を表示

#### 5.4.3 統計蓄積の上限
- イベントログ：最大 200 件（古いものから削除）
- サーブトス記録：最大 30 件
- バックハンド種別記録：最大 50 件

---

### 5.5 バイオメトリクス（フォーム解析）

#### 5.5.1 計測値と計算方法

| 計測値 | 計算方法 | 警告閾値 |
|---|---|---|
| スイング速度（km/h） | 手首ランドマークの前フレームとの距離÷時間→km/h換算（0〜250km/h にクリップ） | なし（表示のみ） |
| 打点高さ（cm） | 手首 Y 座標の画面比率 × 200cm（平均身長 170cm 換算） | **80cm 未満で警告**、**75cm 未満でアドバイス自動生成** |
| 膝角度（°） | 股関節・膝・足首の 3 点からの角度計算 | **170° 超（膝を曲げていない）で警告** |
| 肩の回転角（°） | 左右肩ランドマークの傾き角度（−180°〜+180°） | なし（表示のみ） |

#### 5.5.2 使用するランドマーク（MediaPipe 33点モデル）

| ランドマーク番号 | 部位 |
|---|---|
| 11 | 左肩 |
| 12 | 右肩 |
| 13 | 左肘 |
| 14 | 右肘 |
| 15 | 左手首 |
| 16 | 右手首 |
| 23 | 左股関節 |
| 24 | 右股関節 |
| 25 | 左膝 |
| 26 | 右膝 |
| 27 | 左足首 |
| 28 | 右足首 |

---

### 5.6 ボール追跡・着弾点マップ

#### 5.6.1 ボール検出方法

1. カメラフレームを 160×高さ相当にリサイズ（CPU 負荷軽減）
2. 全ピクセルをスキャンし、以下の条件でテニスボール候補を抽出：
   - 色相（Hue）：40°〜80°（黄緑）
   - 彩度（Saturation）：0.4 以上
   - 明度（Value）：0.5 以上
3. 候補ピクセルが 10 個以上の時に検出と判定
4. 重心 X/Y を正規化座標（0.0〜1.0）で保持

#### 5.6.2 着弾点の判定

前フレームの速度 Y が正（下降）→ 現フレームの速度 Y が負（上昇）に転じた瞬間を着弾として記録。

#### 5.6.3 着弾点マップ表示

- 直近 **50 点**の着弾点をミニコート俯瞰図上に表示
- 古い点ほど薄く表示（アルファ値 = 点のインデックス ÷ 総点数）
- 色分け：インコート → 緑、ネット → 黄色、アウト → 赤

---

### 5.7 ダブルス陣形チェッカー

#### 5.7.1 判定ロジック

MediaPipe が検知した 2 人の人物の股関節 Y 座標（正規化）で役割を分類：

| 正規化 Y 値 | 判定ポジション |
|---|---|
| 0.00〜0.25 | ネット前（NET） |
| 0.25〜0.40 | サービスライン（SERVICE_LINE） |
| 0.40〜0.60 | ミッドコート（MID_COURT） |
| 0.60〜1.00 | ベースライン（BASELINE） |

#### 5.7.2 警告発動条件

| 警告 | 条件 | 優先度 |
|---|---|---|
| センターが空きすぎ | 2 人の X 座標が共に中央から 0.25 以上外れ、かつ同方向 | HIGH |
| 前衛が下がりすぎ | パートナーがベースラインに位置 | MEDIUM |

#### 5.7.3 推奨陣形の提案

| 状況 | 推奨陣形 |
|---|---|
| プレイヤーがベースライン・パートナーがネット | 雁行陣（通常） |
| 両者がネット前 | 並行陣 |
| センターギャップが開いている | オーストラリアン陣形 |

---

### 5.8 動画分析

#### 5.8.1 動画選択

`ActivityResultContracts.GetContent()` を使用し、端末内の動画ファイル（`video/*`）を選択。

#### 5.8.2 分析フロー

1. ユーザーが動画を選択（または補足説明を入力）
2. 3 つの観点で分析クエリを生成し、順番に Gemini AI へ送信：
   - フォームと打点
   - 戦術と配球パターン
   - フットワークと体力
3. 各クエリの結果を `TacticalAdvice` として蓄積・表示
4. 進捗バー（0%〜100%）でリアルタイム進捗を表示

#### 5.8.3 補足説明の活用

ユーザーが補足説明を入力しない場合、プロフィールのレベル・利き手から自動生成：
```
「テニスの{レベル}プレイヤーの試合映像。{利き手}プレイヤー。」
```

---

### 5.9 試合後レポート

#### 5.9.1 レポートに含まれる情報

| 項目 | 詳細 |
|---|---|
| 試合結果 | 勝利 / 敗北 / 未完了 |
| 最終スコア | 例：`6-3` |
| 試合時間 | 経過分数 |
| AI 3行まとめ | 勝因/敗因・重要ポイント・次回練習メニューの 3 行 |
| スタッツ | 下記「スタッツ仕様」参照 |
| キーモーメント | 最重要ポイントの説明・重要度スコア・ポジティブ/ネガティブ分類 |
| 練習メニュー | 優先順位付きの練習ドリル一覧 |

#### 5.9.2 スタッツ仕様

| スタッツ項目 | 型 | 内容 |
|---|---|---|
| firstServePercent | Int | 1stサーブ成功率（%） |
| secondServePercent | Int | 2ndサーブ成功率（%） |
| winnerCount | Int | ウィナー本数 |
| unforeEdErrorCount | Int | アンフォースドエラー本数 |
| netPointsWonPercent | Int | ネットポイント勝率（%） |
| breakPointsConverted | Int | ブレークポイント成功数 |
| breakPointsFaced | Int | ブレークポイント直面数 |
| averageRallyLength | Float | 平均ラリー球数 |
| dominantZone | CourtZone? | 最も着弾の多いゾーン |

#### 5.9.3 個人化練習メニューの自動生成ロジック

| 条件 | 生成メニュー | ドリル種別 | 推奨時間 |
|---|---|---|---|
| firstServePercent < 60% | 1stサーブの精度向上 | SERVE | 20分 |
| アンフォースドエラー > ウィナー | アンフォースドエラー削減 | GROUNDSTROKE | 30分 |
| netPointsWonPercent < 50% | ネットプレーの精度 | VOLLEY | 15分 |
| いずれも該当なし（デフォルト） | 総合フットワーク | FOOTWORK | 20分 |

---

## 6. データモデル仕様

### 6.1 PlayerProfile（Room Entity）

テーブル名：`player_profiles`

| フィールド | 型 | 説明 |
|---|---|---|
| id | Long（PK、自動採番） | プロフィール ID |
| name | String | プレイヤー名（空文字可） |
| level | PlayerLevel（Enum） | プレイレベル（5段階） |
| gender | Gender（Enum） | 性別 |
| dominantHand | DominantHand（Enum） | 利き手 |
| isActive | Boolean | アクティブフラグ（1件のみ true） |
| createdAt | Long | 作成日時（UNIXミリ秒） |

### 6.2 MatchReport（Room Entity）

テーブル名：`match_reports`

| フィールド | 型 | 説明 |
|---|---|---|
| matchId | String（PK） | UUID 形式の試合 ID |
| playerId | Long | 紐付くプロフィール ID |
| matchType | MatchType（Enum） | シングルス / ダブルス |
| durationMinutes | Int | 試合時間（分） |
| result | MatchResult（Enum） | 勝利 / 敗北 / 未完了 |
| finalScore | String | 最終スコア文字列（例：`6-3`） |
| keyMomentsJson | String | KeyMoment リストの JSON |
| summaryThreeLines | String | AI 生成の 3 行サマリー |
| weaknessesJson | String | 弱点リスト JSON（予約） |
| practiceMenuJson | String | PracticeMenuItem リスト JSON |
| statsJson | String | MatchStats の JSON |
| createdAt | Long | 保存日時（UNIXミリ秒） |

### 6.3 主要 Enum 一覧

#### PlayerLevel（プレイレベル）
| 値 | 日本語表示 |
|---|---|
| BEGINNER | 初級 |
| INTERMEDIATE | 中級 |
| ADVANCED_INTERMEDIATE | 中上級 |
| ADVANCED | 上級 |
| COMPETITIVE | 競技 |

#### TennisPoint（ポイント表示）
`ZERO(0)` → `FIFTEEN(15)` → `THIRTY(30)` → `FORTY(40)` → `ADVANTAGE(AD)`

---

## 7. AI・ML エンジン仕様

### 7.1 GeminiNanoManager

| 項目 | 仕様 |
|---|---|
| モデル | MediaPipe LLM Inference API（Gemini Nano）|
| モデルファイルパス | `/data/data/com.tennis.ai.coach/files/gemini_nano_tennis.bin` |
| 最大トークン数 | 512 |
| 推論スレッド | Dispatchers.Default（バックグラウンド） |
| フォールバック | モデルファイル未存在時はルールベース処理に自動切替 |
| プロンプト言語 | 日本語 |
| 出力上限 | 200 文字（trim 後） |

#### Gemini Nano プロンプト構造（戦術アドバイス）
```
あなたはプロのテニスコーチです。以下の試合状況を分析し、日本語で簡潔なアドバイスを1つ生成してください。

【プレイヤー情報】
レベル: {level}
性別: {gender}
利き手: {dominantHand}

【試合状況】
種目: {matchType}
フェーズ: {phase}
スコア: {playerGames}-{opponentGames}
サーブ: 自分/相手

【相手の癖】
- {habit1}（確信度 XX%）
- {habit2}...

【現在のフォーム】（データあり時のみ）
スイング速度: XXkm/h
打点高さ: XXcm

アドバイス（50文字以内）:
```

### 7.2 PoseAnalyzer

| 項目 | 仕様 |
|---|---|
| モデル | MediaPipe PoseLandmarker Full（pose_landmarker_full.task）|
| 動作モード | LIVE_STREAM（非同期） |
| 最大検出人数 | 2人（プレイヤー + 対戦相手） |
| 最小検出信頼度 | 0.5 |
| 最小トラッキング信頼度 | 0.5 |
| 結果 Flow | `metricsFlow: SharedFlow<PoseMetrics>` |
| モデル未配置時 | デモ用ランダムメトリクスを生成して動作継続 |

### 7.3 BallTracker

| 項目 | 仕様 |
|---|---|
| 処理解像度 | 160px 幅にリサイズ（縦横比維持） |
| ボール色範囲 | H: 40°〜80°、S: ≥0.4、V: ≥0.5 |
| 最小検出ピクセル数 | 10px（ノイズ除去） |
| 着弾点判定 | 速度 Y の符号反転（下降→上昇） |
| 履歴保持数 | 最大 50 着弾点 |
| 結果 Flow | `ballFlow`, `landingFlow` |

### 7.4 OpponentHabitDetector

| 項目 | 仕様 |
|---|---|
| アラート発動閾値 | 観測数 ≥ 5 かつ確信度 ≥ 65% |
| 表示アラート閾値 | 確信度 ≥ 50% |
| イベントバッファ | 200件（FIFO） |
| アラート持続時間 | 3秒後に自動消去 |

---

## 8. 画面仕様

### 8.1 ナビゲーション構造

```
Home（起動画面）
  ├─ ProfileSetup（プロフィール設定）
  ├─ Match（試合画面）── [試合終了] ──→ MatchReport（レポート）
  └─ VideoAnalysis（動画分析）
```

### 8.2 Home 画面

| UI要素 | 機能 |
|---|---|
| TopAppBar | タイトル「Tennis AI Coach」＋プロフィールアイコン |
| PlayerCard | アクティブプロフィールの名前・レベル・性別・利き手表示 |
| シングルスボタン | 試合画面へ遷移（matchType=SINGLES） |
| ダブルスボタン | 試合画面へ遷移（matchType=DOUBLES） |
| 動画分析カード | VideoAnalysis 画面へ遷移 |
| 最近の試合リスト | 直近 5 件のレポート一覧 |

### 8.3 ProfileSetup 画面

| UI要素 | 機能 |
|---|---|
| 名前テキストフィールド | 任意入力 |
| レベル選択（FilterChip×3列） | 5 段階から選択 |
| 性別選択（FilterChip×3列） | 3 択から選択 |
| 利き手選択（FilterChip×3列） | 右利き / 左利きから選択 |
| 保存ボタン | Room DB に保存後、前画面に戻る |

### 8.4 Match 画面（リアルタイム解析）

| UI要素 | 更新頻度 | データソース |
|---|---|---|
| TopAppBar（経過時間） | 1秒 | MatchViewModel タイマー |
| スコアボード | ポイント更新時 | MatchUiState |
| チェンジオーバーパネル | チェンジオーバー中のみ表示、1秒 | changeoverSecondsLeft |
| 相手の癖アラート（赤バナー） | 癖検知時（3秒表示） | OpponentHabitDetector |
| フォームメトリクスカード | フレーム毎 | PoseAnalyzer |
| 着弾点マップ（Canvas） | 着弾検知毎 | BallTracker |
| ダブルス陣形カード | フレーム毎（ダブルスのみ） | DoublesPositionAnalyzer |
| AI アドバイスカード | トリガー時 | GeminiNanoManager |

### 8.5 VideoAnalysis 画面

| UI要素 | 機能 |
|---|---|
| 動画選択カード | 端末内動画ファイルを選択 |
| 補足説明テキストフィールド | 2〜4 行のフリーテキスト |
| 分析開始ボタン | Gemini AI に 3 クエリ順次送信 |
| 進捗バー（LinearProgressIndicator） | 0%〜100% アニメーション |
| 結果アドバイスカード × 最大 3 件 | カテゴリ・タイトル・本文・確信度 |

### 8.6 MatchReport 画面

| UI要素 | 内容 |
|---|---|
| 結果ヘッダー | 勝利/敗北（色分け）・スコア・試合種別・時間 |
| AI 3行まとめカード | Gemini 生成サマリー |
| スタッツカード | 7 項目の数値（色分け評価） |
| キーモーメントリスト | 最重要ポイントの説明・重要度 |
| 練習メニューリスト | 優先順位・ドリル名・説明・推奨時間 |

---

## 9. Wear OS 仕様

### 9.1 通信方式

Google Wearable Data Layer API（`MessageClient`）を使用。

### 9.2 通信パス一覧

| パス | 送信内容 | 発動タイミング |
|---|---|---|
| `/tennis/advice` | WearAdvicePayload（JSON） | アドバイス生成時 |
| `/tennis/score` | スコア文字列（例：`4-3`） | ゲーム獲得時 |
| `/tennis/alert` | WearAdvicePayload（JSON） | 緊急アラート検知時 |
| `/tennis/heartbeat` | ハートビート（予約） | — |

### 9.3 WearAdvicePayload フィールド

| フィールド | 型 | 内容 |
|---|---|---|
| title | String | アドバイスタイトル |
| body | String | 本文（最大 80 文字に切り詰め） |
| urgency | String | `IMMEDIATE` / `NORMAL` / `CHANGEOVER` |
| emoji | String | カテゴリ絵文字 |
| score | String | 現在スコア（任意） |

### 9.4 バイブレーションパターン

| 種別 | パターン（ms） |
|---|---|
| 通常アドバイス | 0, 100 |
| 緊急アドバイス（IMMEDIATE） | 0, 200, 100, 200 |
| 緊急アラート（癖検知等） | 0, 100, 80, 100, 80, 100 |

### 9.5 Wear OS アプリの UI

`ScalingLazyColumn`（Wear Compose）で縦スクロール：
1. **スコア表示**（大きな白い文字）
2. **緊急アラートチップ**（赤背景、表示中のみ）
3. **アドバイスカード**（緑グラデーション背景）

---

## 10. パーミッション仕様

| パーミッション | 用途 | 必須/任意 |
|---|---|---|
| CAMERA | CameraX でのカメラ映像取得 | 必須 |
| RECORD_AUDIO | 試合動画録音 | 任意 |
| READ_MEDIA_VIDEO | 動画分析での動画読み込み | 動画分析機能使用時に必須 |
| READ_MEDIA_IMAGES | 画像リソース読み込み | 任意 |
| WRITE_EXTERNAL_STORAGE | 録画ファイル保存（API 28 以下） | API 28 以下で必須 |
| INTERNET | Gemini クラウド API（フォールバック） | オンデバイスモード時は不要 |
| VIBRATE | バイブレーション通知 | 任意 |
| FOREGROUND_SERVICE | バックグラウンド解析継続 | 必須 |
| FOREGROUND_SERVICE_CAMERA | カメラ使用フォアグラウンドサービス | 必須 |
| WAKE_LOCK | 試合中の画面維持 | 任意 |

---

## 11. 非機能要件

### 11.1 パフォーマンス

| 指標 | 目標値 | 実装上の対策 |
|---|---|---|
| カメラフレーム解析 | 最大 30fps | `STRATEGY_KEEP_ONLY_LATEST`（古フレームを捨てる） |
| ボール検出処理時間 | < 33ms/frame | 160px リサイズ + 単純色判定 |
| アドバイス生成（ルールベース） | < 5ms | 同期処理（DB 非依存） |
| アドバイス生成（Gemini Nano） | 1〜3秒 | Dispatchers.Default でバックグラウンド処理 |
| UI 更新レート | 60fps | StateFlow → Compose recomposition |

### 11.2 オフライン対応

| 機能 | オフライン動作 |
|---|---|
| スコア管理 | 完全対応 |
| ルールベースアドバイス | 完全対応 |
| Gemini Nano アドバイス | モデルファイル配置済みなら完全対応 |
| 着弾点マップ | 完全対応 |
| フォームメトリクス | 完全対応 |
| 試合後レポート | ルールベース生成で対応 |
| 動画分析 | Gemini Nano 使用時のみ対応 |

### 11.3 データ保持

- Room DB は端末ローカルに保存（クラウド同期なし）
- レポートの削除：現バージョンでは手動削除のみ（自動削除 API は実装済み・未呼び出し）

### 11.4 テーマ

ダークモード固定（コートサイドでの屋外使用を考慮し、コントラストを高く設定）。  
主要カラーパレット：

| 色 | 用途 | Hex |
|---|---|---|
| CourtGreenLight | プライマリ・ボタン | `#4CAF50` |
| BallYellow | セカンダリ・アドバイスタイトル | `#F9A825` |
| AlertRed | エラー・警告 | `#EF5350` |
| SurfaceDark | 背景 | `#121212` |

---

## 12. ライブラリ一覧

| ライブラリ | バージョン | 用途 |
|---|---|---|
| Kotlin | 2.1.0 | 開発言語 |
| Jetpack Compose BOM | 2024.12.01 | UI フレームワーク |
| Compose Navigation | 2.8.5 | 画面遷移 |
| Material 3 | BOM 準拠 | UI コンポーネント |
| Hilt | 2.53.1 | 依存性注入（DI） |
| Room | 2.6.1 | ローカルデータベース |
| CameraX | 1.4.1 | カメラ制御・録画 |
| MediaPipe Tasks Vision | 0.10.20 | PoseLandmarker（骨格検知） |
| MediaPipe Tasks GenAI | 0.10.20 | Gemini Nano（LLM 推論） |
| Google AI Generative AI | 0.9.0 | Gemini クラウド（フォールバック） |
| DataStore Preferences | 1.1.1 | 軽量設定保存 |
| WorkManager | 2.10.0 | バックグラウンドタスク（予備） |
| Accompanist Permissions | 0.36.0 | Compose パーミッション処理 |
| Coil Compose | 2.7.0 | 画像・動画サムネイル表示 |
| kotlinx.coroutines | 1.9.0 | 非同期処理 |
| kotlinx.serialization | 1.7.3 | JSON シリアライズ |
| Wear Compose | 1.4.0 | Wear OS UI |
| Play Services Wearable | 18.2.0 | Wearable Data Layer API |

---

## 13. ファイル構成一覧

```
tennis/
├── README.md
├── settings.gradle.kts               # モジュール設定（:app, :wear）
├── build.gradle.kts                  # ルートビルド設定
├── gradle/
│   └── libs.versions.toml            # バージョンカタログ（TOML）
├── app/
│   ├── build.gradle.kts
│   ├── proguard-rules.pro
│   └── src/main/
│       ├── AndroidManifest.xml
│       ├── kotlin/com/tennis/ai/coach/
│       │   ├── TennisApplication.kt
│       │   ├── MainActivity.kt
│       │   ├── camera/CameraManager.kt
│       │   ├── data/
│       │   │   ├── local/
│       │   │   │   ├── TennisDatabase.kt
│       │   │   │   └── dao/PlayerProfileDao.kt, MatchReportDao.kt
│       │   │   ├── model/
│       │   │   │   ├── PlayerProfile.kt
│       │   │   │   ├── MatchState.kt
│       │   │   │   ├── TacticalAdvice.kt
│       │   │   │   └── MatchReport.kt
│       │   │   └── repository/
│       │   │       ├── ProfileRepository.kt
│       │   │       └── MatchRepository.kt
│       │   ├── di/AppModule.kt, DatabaseModule.kt
│       │   ├── ml/
│       │   │   ├── GeminiNanoManager.kt
│       │   │   ├── PoseAnalyzer.kt
│       │   │   ├── BallTracker.kt
│       │   │   ├── OpponentHabitDetector.kt
│       │   │   └── DoublesPositionAnalyzer.kt
│       │   ├── service/
│       │   │   ├── MatchAnalysisService.kt
│       │   │   └── WearDataLayerService.kt
│       │   └── ui/
│       │       ├── theme/Theme.kt
│       │       ├── navigation/Navigation.kt
│       │       ├── home/HomeScreen.kt, HomeViewModel.kt
│       │       ├── profile/ProfileSetupScreen.kt, ProfileViewModel.kt
│       │       ├── match/MatchScreen.kt, MatchViewModel.kt
│       │       ├── analysis/VideoAnalysisScreen.kt, VideoAnalysisViewModel.kt
│       │       └── report/MatchReportScreen.kt, MatchReportViewModel.kt
│       └── res/
│           ├── drawable/ic_launcher.xml
│           ├── values/strings.xml, themes.xml
│           └── xml/file_paths.xml
└── wear/
    ├── build.gradle.kts
    └── src/main/
        ├── AndroidManifest.xml
        ├── kotlin/com/tennis/ai/coach/wear/
        │   ├── WearApplication.kt
        │   ├── MainActivity.kt
        │   ├── WearAdviceListenerService.kt
        │   ├── WearAdviceState.kt
        │   └── di/WearModule.kt
        └── res/
            ├── drawable/ic_launcher.xml
            └── values/strings.xml
```

---

*以上が Tennis AI Coach バージョン 1.0.0 のシステム仕様書です。*
