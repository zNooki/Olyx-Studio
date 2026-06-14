-- À coller dans Supabase > SQL Editor > Run

create table if not exists public.purchases (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    product_id text not null,
    product_name text not null,
    stripe_session_id text unique not null,
    stripe_payment_intent text,
    amount_total integer,
    currency text default 'eur',
    status text default 'paid',
    download_url text,
    created_at timestamptz default now()
);

alter table public.purchases enable row level security;

drop policy if exists "Users can read their purchases" on public.purchases;
create policy "Users can read their purchases"
on public.purchases for select
to authenticated
using (auth.uid() = user_id);

-- IMPORTANT : les insertions sont faites côté serveur avec la SERVICE_ROLE_KEY.
-- Ne crée pas de policy INSERT publique.
