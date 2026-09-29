-- =========================================================
-- 1. Таблица для хранения токена Т-Инвестиций
-- =========================================================
-- Токен хранится ЗАШИФРОВАННЫМ (AES-GCM, ключ шифрования знает
-- только Edge Function через секрет BROKER_TOKEN_ENC_KEY).
--
-- Важно: ниже НЕТ политики SELECT для роли authenticated.
-- Это значит, что прочитать строку из этой таблицы обычным
-- запросом (anon/authenticated key, в т.ч. из DevTools) не может
-- НИКТО, включая самого владельца токена. Прочитать содержимое
-- может только сервис (service_role key), который используется
-- исключительно внутри Edge Function на сервере Supabase и
-- никогда не попадает в браузер.

create table if not exists public.broker_tokens (
    user_id           uuid primary key references auth.users(id) on delete cascade,
    provider          text not null default 'tinkoff',
    account_id        text,
    token_ciphertext  text not null,   -- зашифрованный токен (base64)
    token_iv          text not null,   -- вектор инициализации AES-GCM (base64)
    created_at        timestamptz not null default now(),
    updated_at        timestamptz not null default now()
);

alter table public.broker_tokens enable row level security;

-- Владелец может ЗАПИСАТЬ (вставить/обновить) свой токен,
-- но не может его прочитать обратно через обычный клиент.
create policy "broker_tokens_insert_own"
    on public.broker_tokens
    for insert
    to authenticated
    with check (auth.uid() = user_id);

create policy "broker_tokens_update_own"
    on public.broker_tokens
    for update
    to authenticated
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

-- Владелец может удалить связку (отключить синхронизацию)
create policy "broker_tokens_delete_own"
    on public.broker_tokens
    for delete
    to authenticated
    using (auth.uid() = user_id);

-- Политики SELECT сознательно нет: обычным ключом (anon/authenticated)
-- эта таблица нечитаема никем. Читает только service_role в Edge Function.


-- =========================================================
-- 2. RLS для таблицы trades (чтобы данные не были видны чужим,
--    даже если кто-то узнает публичный Supabase-ключ проекта)
-- =========================================================

alter table public.trades enable row level security;

drop policy if exists "trades_select_own" on public.trades;
create policy "trades_select_own"
    on public.trades
    for select
    to authenticated
    using (auth.uid() = user_id);

drop policy if exists "trades_insert_own" on public.trades;
create policy "trades_insert_own"
    on public.trades
    for insert
    to authenticated
    with check (auth.uid() = user_id);

drop policy if exists "trades_update_own" on public.trades;
create policy "trades_update_own"
    on public.trades
    for update
    to authenticated
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

drop policy if exists "trades_delete_own" on public.trades;
create policy "trades_delete_own"
    on public.trades
    for delete
    to authenticated
    using (auth.uid() = user_id);


-- =========================================================
-- 3. Поле для дедупликации при импорте из Т-Инвестиций
-- =========================================================
-- external_id хранит id операции(й) Т-Инвестиций, чтобы повторная
-- синхронизация не создавала дубликаты сделок.

alter table public.trades add column if not exists external_id text;
alter table public.trades add column if not exists source text not null default 'manual';

create unique index if not exists trades_external_id_unique
    on public.trades (user_id, external_id)
    where external_id is not null;