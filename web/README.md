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
| ❌ カメラ＋骨格解析 | Phase 2（MediaPipe Web） |
| ❌ 試合録画 | Phase 2 |
| ❌ 個人レッスン | Phase 2 |
| ❌ 2 台連携モード | Web ではブラウザ制約。WebRTC で代替予定 |

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

## ブラウザ要件

- Chrome / Safari / Edge / Firefox 最新版
- iOS Safari 16+ / Android Chrome 100+
- IndexedDB 対応必須（ほぼ全ブラウザで動作）
