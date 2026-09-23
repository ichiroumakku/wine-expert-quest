# ワインエキスパートクエスト(wine-expert-quest)プロジェクト概要

## アプリの目的
J.S.A. ワインエキスパート一次試験(筆記・CBT 多肢選択)の合格を目指す学習アプリ。
4択問題の出題・採点・解説に加え、RPG風のレベル可視化でモチベーションを維持する。
UI・コード構成は姉妹プロジェクト aws-saa-quest と同一(コピーして取り込み、依存関係はない)。

## 開発上の制約・方針
- **完全無料構成**: GitHub Pages(静的ホスティング) + Supabase(無料枠)のみ
- Claude API は使わない。解説の深掘りはプロンプトをコピーして Claude.ai / ChatGPT に貼る運用
- ビルドツールは使わず、単一の `index.html` に HTML/CSS/JS をすべて記述する(iPhone だけで開発できるように)
- supabase-js は CDN 経由で読み込む
- aws-saa-quest のリポジトリ・Supabase には一切書き込まない

## 技術構成
- バックエンド: Supabase(新規プロジェクト wine-expert-quest / Tokyo)。URL / anon key は `index.html` 冒頭に直書き
- 認証: Supabase Auth(メール/パスワード、Confirm email OFF)
- スキーマ定義は `schema.sql`(aws-saa-quest と同構造 + `questions.needs_review`)

## 出題分野(11分類 / categories マスタ)と比重
france 22 / intro 15 / italy 10 / new_world 9 / japan 8 / other_drinks 8 /
spain_portugal 7 / germany_austria 7 / service_cheese 6 / tasting 4 / law 4(合計100)

## レベル設計(index.html の LEVEL-LOGIC 区間)
- EXP: 基礎 6/1、産地・品種 10/2、数値・法規 16/3(正解/不正解)。Lv N→N+1 = 100 + 2(N-1)、Lv100 まで累計 19,602 EXP
- 推定得点率 = 分野別「直近30問」正答率の比重加重平均(未回答分野は0)
- レベル上限: 60%未満→59、70%未満→79、75%未満→89、78%未満→99
- **Lv100 ＝ 合格ライン**: 推定得点率78%以上 + 全分野30問以上 + フランス・概論それぞれ75%以上
- 閾値は `PASS_RATE` / `LEVEL_CAPS` などの定数で調整。変更したら `node tools/test-level.js` を実行

## 機能
- 分野指定 / 全分野ランダム、復習モード(最後に解いたとき不正解だった問題)、模試モード(比重どおり 120問・70分 / ミニ 30問・18分)
- 5問ごとの継続確認、日別正答率チャート、解説の深掘り(chat_messages に保存)

## 問題データの生成フロー(tools/)
1. `tools/input/batch-XXX.json` に問題を記述(`c` 配列の先頭が正答。`r: true` で needs_review)
2. `node tools/build-batch.js all` で全バッチを連番で SQL 化(`tools/out/seed-all.sql`)
3. 生成された SQL を Supabase の SQL Editor で実行(追加分だけなら `node tools/build-batch.js batch-013 <開始no>`)

## 問題作成ルール
- 教本や過去問の文章をそのまま転載しない(オリジナルの問題文・解説)
- 産地名・品種名はカタカナと原語を併記(例: シャルドネ(Chardonnay))
- 解説は選択肢記号ではなく内容で説明する(並べ替え後も破綻しないように)
- 年度で変わりうる数値・法規を含む問題は `r: true` を付け、解説末尾に「教本で確認」と書く
