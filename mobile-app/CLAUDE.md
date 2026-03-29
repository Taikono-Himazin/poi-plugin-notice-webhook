# mobile-app/ — Expo React Native アプリ

## Build & Test

```bash
npm ci --legacy-peer-deps   # --legacy-peer-deps 必須
npm test                     # Jest
npx expo start               # 開発サーバー
```

## Conventions

- TypeScript/TSX, ESM
- React 19, React Native 0.81, Expo 54
- 状態管理やナビゲーションは既存パターンに従うこと

## Key Files

- `src/lib/api.ts` — API クライアント (Cognito JWT 認証)
- `src/lib/auth.ts` — OAuth / トークンリフレッシュ
- `src/lib/backgroundSync.ts` — バックグラウンド同期
- `src/lib/syncLog.ts` — 同期ログ
- `src/screens/DebugScreen.tsx` — デバッグ画面
- `targets/widget/PoiNoticeWidget.swift` — iOS ウィジェット (Swift)

## Notes

- `npm ci` は必ず `--legacy-peer-deps` 付きで実行すること（peer dependency 競合あり）
- EAS Build を使用。`eas-build-pre-install.sh` でビルド前処理を実行
