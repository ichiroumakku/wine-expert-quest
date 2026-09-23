-- wine-expert-quest : Supabase スキーマ定義
-- 新しい Supabase プロジェクト(wine-expert-quest / Tokyo)の SQL Editor で一度だけ実行する。
-- aws-saa-quest と同一構造(トリガー・関数なし)。差分は categories の中身と questions.needs_review のみ。

-- ========== categories (出題分野マスタ: 11分類) ==========
create table if not exists public.categories (
  id         text primary key,   -- intro / france / italy / spain_portugal / germany_austria / new_world /
                                  -- japan / other_drinks / tasting / service_cheese / law
  name_ja    text not null,
  name_en    text not null,
  sort_order integer not null
);

insert into public.categories (id, name_ja, name_en, sort_order) values
  ('intro',           'ワイン概論',                 'Viticulture & Winemaking',     1),
  ('france',          'フランス',                   'France',                       2),
  ('italy',           'イタリア',                   'Italy',                        3),
  ('spain_portugal',  'スペイン・ポルトガル',       'Spain & Portugal',             4),
  ('germany_austria', 'ドイツ・オーストリア・他欧州', 'Germany, Austria & Europe',  5),
  ('new_world',       'ニューワールド',             'New World',                    6),
  ('japan',           '日本',                       'Japan',                        7),
  ('other_drinks',    '酒類飲料概論',               'Beer, Spirits & Sake',         8),
  ('tasting',         'テイスティング',             'Tasting',                      9),
  ('service_cheese',  'サービス・チーズ・料理',     'Service, Cheese & Pairing',   10),
  ('law',             '酒類の法規・表示',           'Liquor Law & Labeling',       11)
on conflict (id) do update set
  name_ja = excluded.name_ja, name_en = excluded.name_en, sort_order = excluded.sort_order;

-- ========== questions ==========
create table if not exists public.questions (
  id              uuid primary key default gen_random_uuid(),
  exam_type       text,                       -- 固定値 'JSA-WE'(J.S.A. ワインエキスパート一次)
  year            text,                       -- 生成バッチ識別子 (例: gen-batch-001)
  question_no     integer,
  field_tags      text[],                     -- 予備(未使用)
  category_id     text not null references public.categories(id),
  difficulty      integer default 2,          -- 1=基礎用語 / 2=産地・品種 / 3=数値・法規
  body            text,
  choices         jsonb,                      -- {"ア":"...","イ":"...","ウ":"...","エ":"..."}
  official_answer text,                       -- "ア" | "イ" | "ウ" | "エ"
  explanation     text,
  needs_review    boolean default false,      -- 年度で変わりうる数値・法規を含む → 最新教本で人手確認
  created_at      timestamptz default now(),
  source          text                        -- sample | generated
);

-- ========== profiles ==========
create table if not exists public.profiles (
  user_id      uuid primary key references auth.users(id),
  display_name text,
  created_at   timestamptz default now()
);

-- ========== field_status ==========
create table if not exists public.field_status (
  user_id      uuid references auth.users(id),
  field_id     text,
  level        integer default 1,
  exp          integer default 0,
  mastery_rate numeric default 0,
  updated_at   timestamptz default now(),
  primary key (user_id, field_id)
);

-- ========== answer_logs ==========
create table if not exists public.answer_logs (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users(id),
  question_id   uuid references public.questions(id),
  user_answer   text,
  is_correct    boolean,
  partial_score numeric,
  exp_gained    integer default 0,
  created_at    timestamptz default now()
);

-- ========== chat_messages ==========
create table if not exists public.chat_messages (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id),
  question_id uuid references public.questions(id),
  role        text,        -- 'user' | 'assistant'
  content     text,
  created_at  timestamptz default now()
);

-- ========== RLS ==========
alter table public.categories    enable row level security;
alter table public.questions     enable row level security;
alter table public.profiles      enable row level security;
alter table public.field_status  enable row level security;
alter table public.answer_logs   enable row level security;
alter table public.chat_messages enable row level security;

-- categories: 認証済みは全件閲覧。書き込みはサービスロール(SQL Editor)のみ。
create policy categories_select_all on public.categories
  for select using (auth.role() = 'authenticated');

-- questions: 認証済みは全件閲覧。書き込みはサービスロール(SQL Editor)のみ。
create policy questions_select_all on public.questions
  for select using (auth.role() = 'authenticated');

-- profiles: 認証済みは全件閲覧(ランキング用)、本人のみ作成・更新
create policy profiles_select_all on public.profiles
  for select using (auth.role() = 'authenticated');
create policy profiles_insert_own on public.profiles
  for insert with check (auth.uid() = user_id);
create policy profiles_update_own on public.profiles
  for update using (auth.uid() = user_id);

-- field_status: 認証済みは全件閲覧(ランキング用)、本人のみ作成・更新・削除
create policy field_status_select_all on public.field_status
  for select using (auth.role() = 'authenticated');
create policy field_status_insert_own on public.field_status
  for insert with check (auth.uid() = user_id);
create policy field_status_update_own on public.field_status
  for update using (auth.uid() = user_id);
create policy field_status_delete_own on public.field_status
  for delete using (auth.uid() = user_id);

-- answer_logs: 本人のみ
create policy answer_logs_select_own on public.answer_logs
  for select using (auth.uid() = user_id);
create policy answer_logs_insert_own on public.answer_logs
  for insert with check (auth.uid() = user_id);
create policy answer_logs_delete_own on public.answer_logs
  for delete using (auth.uid() = user_id);

-- chat_messages: 本人のみ
create policy chat_messages_select_own on public.chat_messages
  for select using (auth.uid() = user_id);
create policy chat_messages_insert_own on public.chat_messages
  for insert with check (auth.uid() = user_id);

-- ========== leaderboard (view) ==========
create or replace view public.leaderboard
  with (security_invoker = true) as
  select p.user_id,
         p.display_name,
         sum(fs.exp)              as total_exp,
         round(avg(fs.level), 1)  as avg_level,
         max(fs.level)            as top_field_level
    from public.profiles p
    join public.field_status fs on fs.user_id = p.user_id
   group by p.user_id, p.display_name
   order by sum(fs.exp) desc;
