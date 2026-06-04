# Tennis AI Coach — Web 版

Android アプリの中核機能を **React + TypeScript + Tailwind + Vite** で Web/PWA に移植した版です。
スマホブラウザでもデスクトップでも動作し、PWA としてホーム画面に追加すれば**オフラインでも使えます**。

## 含まれる機能

| 機能 | Web 版で動作するか |
|------|-------------------|
| ✅ スコア管理（デュース／ノーアド／セミアド対応） | はい |
| ✅ チェンジオーバー（自動検知・スキップ可） | はい |
| ✅ 直前ポイントのアンドゥ | はい |
| ✅ 詳細スタッツ記録モード（ポイント分類） | はい |
| ✅ プロ中継レベルのスタッツ画面 | はい |
| ✅ 着弾点マップ（コートをタップして手動入力） | はい |
| ✅ 戦術アドバイザー（30+ プロ戦術） | はい |
| ✅ ダブルス対応（パートナー＆相手 2 名の情報入力） | はい |
| ✅ 試合履歴・削除（IndexedDB） | はい |
| ✅ PWA 対応（オフライン動作・ホーム追加） | はい |
| ✅ **個人レッスン（AI 骨格診断）** | はい（MediaPipe Tasks Vision Web） |
| ✅ **関節角度の自動測定**（肘・膝・捻転） | はい |
| ✅ **キネティックチェーン分析**（骨盤→肩の時間差） | はい |
| ✅ **打点ばらつき可視化**（散布図） | はい |
| ✅ **片手バック専用診断**（前足相対の打点位置・胸ブロック） | はい |
| ✅ **理想フォーム骨格オーバーレイ** | はい（ライブ＋スロー再生） |
| ✅ **AI コーチング自動言語化＋ドリル推奨** | はい（ルールベース＋数値根拠付き） |
| ❌ 試合録画（映像保存） | Phase 3（MediaRecorder API で実装可能） |
| ❌ 2 台連携モード | Web では制約。WebRTC で代替予定 |

## セットアップ

```bash
cd web
npm install
npm run dev      # 開発サーバ起動（http://localhost:5173）
npm run build    # 本番ビルド → dist/
npm run preview  # ビルド結果のプレビュー
```

## デプロイ

### Vercel（推奨・最も簡単）

リポジトリ直下に `vercel.json` を同梱しているので、**追加設定なしで Import するだけ**で動作します。

1. https://vercel.com/new でリポジトリを Import
2. **Root Directory はそのまま**（変更不要、`vercel.json` が `web/` を build 対象に指定済み）
3. **Framework Preset は「Other」** のまま（`vercel.json` が build/output を上書き）
4. Deploy をクリック → 数分で完了
5. 発行された URL を友達と共有

ローカルから Vercel CLI でデプロイする場合：
```bash
npm i -g vercel
cd /path/to/tennis      # リポジトリ root
vercel                  # 初回は対話的に link
vercel --prod           # 本番デプロイ
```

### その他のホスティング

ビルド成果物は `web/dist/` の静的ファイル一式：

- **GitHub Pages**: `dist/` を `gh-pages` ブランチへ push（`vite.config.ts` の `base` をリポジトリ名に変更必要）
- **Netlify**: `web/` を Base directory、`npm run build` を Build command、`dist` を Publish directory に
- **Cloudflare Pages**: 同上
- **任意の静的ホスティング**: `dist/` を S3 / Firebase Hosting / nginx 等に

> 📝 SPA のため `/match-setup` などのパスを開いたときに 404 にならないよう、
> **「すべてのリクエストを `index.html` にフォールバック」** する設定が必要です。
> Vercel は同梱の `vercel.json` の `rewrites` でこれを処理しています。

URL を友達に渡すだけで使ってもらえます。インストール不要。

## PWA 化されている

- HTTPS 配信時、ブラウザの「ホーム画面に追加」で**アプリのように起動**できます
- Service Worker が自動でキャッシュ → **オフラインでもスコア管理可能**
- データは端末の IndexedDB に保存（クラウド送信なし）

## アーキテクチャ

```
web/
├── index.html
├── package.json
├── vite.config.ts          # Vite + PWA プラグイン
├── tailwind.config.js
└── src/
    ├── main.tsx            # エントリ
    ├── App.tsx             # ルート（HashRouter）
    ├── types/match.ts      # 型定義（Android Kotlin から移植）
    ├── lib/
    │   ├── scoring.ts      # スコア進行ロジック（advanceScore）
    │   ├── statsAggregator.ts # スタッツ集計
    │   └── db.ts           # IndexedDB（idb）
    ├── data/
    │   └── tactics.ts      # 戦術データベース
    ├── store/
    │   └── matchStore.ts   # Zustand 状態管理
    ├── components/
    │   ├── ScoreBoard.tsx
    │   ├── PointCategorySheet.tsx
    │   └── CourtMap.tsx
    └── pages/
        ├── Home.tsx
        ├── MatchSetup.tsx
        ├── Match.tsx
        ├── MatchReport.tsx
        └── TacticalAdvisor.tsx
```

## 個人レッスンの仕組み（要点）

### 使用技術

- **MediaPipe Tasks Vision Web** (`@mediapipe/tasks-vision`) で 33 関節のポーズランドマーク検出
- **GPU デリゲート** で WebGL/WASM-SIMD ハイブリッド実行（モバイル Chrome / Safari どちらも数フレーム/秒以上）
- **lite モデル**（6 MB）を Google Cloud Storage CDN から初回ロード → Service Worker がキャッシュしてオフライン化

### 解析パイプライン

1. `getUserMedia` でリアカメラ起動
2. `requestAnimationFrame` で 1 フレームずつ `detectForVideo` 実行
3. 録画中はランドマーク列を蓄積
4. 録画停止後、`SwingAnalyzer` がスイングピーク検出
5. 各スイングのインパクトフレームから：
   - 肘・膝の関節角度
   - 肩・骨盤の傾き → **捻転差**
   - 骨盤と肩の回転ピーク時間差 → **キネティックチェーン**
   - 手首位置 vs 前足 → **打点の前後位置**
   - 全スイングの打点を体中心相対座標で **散布図化**
6. 結果を `idealForms.ts` の理想レンジと比較 → 0〜100 採点
7. 弱点に応じた **ドリル**を自動推奨
8. すべて IndexedDB に保存。**過去の自分との差分** も同じ画面で比較

### 何が「正直」か

- すべての**絶対値（° / 秒）は単一カメラ 2D 推定**なので参考値です
- ただし**同じ撮影位置での相対変化**は十分意味があり、トレンド分析・差分比較に使えます
- インパクト検出は**手首速度のピーク**を使うシンプル実装。打球音や IMU との連動はしません

## ブラウザ要件

- Chrome / Safari / Edge / Firefox 最新版
- iOS Safari 16.4+ / Android Chrome 100+
- IndexedDB 対応必須（ほぼ全ブラウザで動作）
- **MediaPipe 解析を使う場合**：WebGL2 対応（ほぼ全ブラウザで対応済み）
- 初回 MediaPipe ロード時のみネット接続必須（モデル 6MB の取得）
