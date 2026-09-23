# wine-expert-quest

J.S.A. ワインエキスパート一次試験(筆記)対策の学習アプリ。
[aws-saa-quest](https://github.com/ichiroumakku/aws-saa-quest) の UI・構成をそのまま流用し、出題データ・分野・レベル基準をワイン用に差し替えたもの。

- フロント: GitHub Pages(単一 `index.html`、ビルドなし)
- 公開 URL: https://ichiroumakku.github.io/wine-expert-quest/
- バックエンド: Supabase 無料枠(Auth + Postgres)
- Lv100 ＝ 筆記試験の合格ライン(解いた数だけでは到達せず、推定得点率で上限がかかる)

## セットアップ

1. Supabase で新規プロジェクト `wine-expert-quest`(Tokyo / Confirm email OFF)を作成
2. SQL Editor で [`schema.sql`](schema.sql) を実行
3. [`tools/out/seed-all.sql`](tools/out/seed-all.sql) を実行して問題(255問)を投入
4. `index.html` の `__SUPABASE_URL__` / `__SUPABASE_ANON_KEY__` を新プロジェクトの値に置換
5. `main` へ push すると GitHub Pages に反映

## 開発

```sh
node tools/test-level.js        # レベル計算のテスト
node tools/build-batch.js all   # 問題 JSON → SQL
```
