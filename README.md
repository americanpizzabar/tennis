# Tennis AI Coach

リアルタイムAI搭載のテニス戦術コーチングアプリ。シングルス・ダブルス両対応。

## アーキテクチャ

```
app/
├── data/               # Room DB・Repository
│   ├── local/          # DAO・TennisDatabase
│   ├── model/          # PlayerProfile・MatchState・TacticalAdvice・MatchReport
│   └── repository/     # ProfileRepository・MatchRepository
├── di/                 # Hilt モジュール（DB・AI・App）
├── ml/                 # AI/ML エンジン
│   ├── GeminiNanoManager.kt      # Gemini Nano（オンデバイス）+ クラウドフォールバック
│   ├── PoseAnalyzer.kt           # MediaPipe PoseLandmarker（骨格検知）
│   ├── BallTracker.kt            # リアルタイムボール追跡・着弾点推定
│   ├── OpponentHabitDetector.kt  # 相手の癖自動検知
│   └── DoublesPositionAnalyzer.kt # ダブルス陣形チェッカー
├── camera/             # CameraX（プレビュー・解析・録画）
├── service/            # フォアグラウンドサービス・Wear OS データレイヤー
└── ui/
    ├── home/           # ホーム画面
    ├── profile/        # プロフィール設定（レベル・性別・利き手）
    ├── match/          # 試合画面（リアルタイム解析・スコア管理）
    ├── analysis/       # 動画分析画面
    └── report/         # 試合後レポート（3行まとめ・練習メニュー）

wear/                   # Wear OS コンパニオンアプリ
```

## 主要機能

### 1. リアルタイム戦術支援
- **配球リコメンド**: レベル・性別・利き手を踏まえデュース等の局面で最適配球を提示
- **相手の癖アラート**: バックハンドスライス傾向・サーブトス位置などを統計検知
- **ダブルス陣形チェッカー**: センターギャップ・前衛位置をリアルタイム監視

### 2. インスタントビジュアルフィードバック
- **着弾点マップ**: コート俯瞰図に打球の着弾点を色分けリアルタイム表示
- **バイオメトリクス**: MediaPipeでスイング速度・打点高さ・膝角度を計測
- **打点低下アラート**: 疲労による打点降下を即時検知して警告

### 3. Android/Google エコシステム活用
- **Gemini Nano（オンデバイス）**: 通信不要の完全オフライン戦術アドバイス生成
- **CameraX**: 高速フレーム解析パイプライン（毎秒30フレーム対応）
- **Wear OS 連携**: 戦術アドバイスをスマートウォッチに即時送信、バイブ通知

### 4. 動画分析
- 録画した試合動画を選択してGemini AIが複数の観点から分析
- フォーム・戦術・フットワーク3つの角度からアドバイスを生成

### 5. 試合後レポート
- AI生成の「3行まとめ」（勝因/敗因・キーポイント・次回練習メニュー）
- スタッツ（1stサーブ率・ウィナー・エラー・ネットポイント勝率）
- 個人化された練習メニューの自動作成

## セットアップ

### 必要環境
- Android Studio Ladybug 以降
- Android 8.0 (API 26) 以上
- Wear OS 3.0 以上（ウォッチ連携機能を使う場合）

### Gemini API キー設定（クラウドフォールバック用）
`local.properties` に追加：
```
GEMINI_API_KEY=your_api_key_here
```

### Gemini Nano オンデバイスモデル
モデルファイル（`gemini_nano_tennis.bin`）を `/data/data/com.tennis.ai.coach/files/` に配置すると
完全オフラインモードで動作します。未配置の場合はルールベースのフォールバックが動作します。

### MediaPipe モデル
`app/src/main/assets/` に以下を配置：
- `pose_landmarker_full.task`（MediaPipe公式サイトからダウンロード）

## 技術スタック
- **言語**: Kotlin
- **UI**: Jetpack Compose + Material 3
- **DI**: Hilt
- **DB**: Room
- **カメラ**: CameraX
- **AI（オンデバイス）**: MediaPipe Tasks GenAI（Gemini Nano）
- **AI（クラウド）**: Google AI Generative AI SDK
- **骨格検知**: MediaPipe PoseLandmarker
- **状態管理**: StateFlow / SharedFlow
- **直列化**: kotlinx.serialization
- **Wear OS**: Wear Compose + Wearable Data Layer API
