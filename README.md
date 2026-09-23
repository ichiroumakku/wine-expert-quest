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
3. [`tools/out/seed-all.sql`](tools/out/seed-all.sql) を実行して問題(464問)を投入
   - 255問を投入済みの環境では、代わりに [`tools/out/seed-from-batch-013.sql`](tools/out/seed-from-batch-013.sql)(追加209問)と [`tools/out/fix-001-zasshu.sql`](tools/out/fix-001-zasshu.sql)(解説の修正)を実行
4. `index.html` の `__SUPABASE_URL__` / `__SUPABASE_ANON_KEY__` を新プロジェクトの値に置換
5. `main` へ push すると GitHub Pages に反映

## 開発

```sh
node tools/test-level.js        # レベル計算のテスト
node tools/build-batch.js all   # 問題 JSON → SQL
```
