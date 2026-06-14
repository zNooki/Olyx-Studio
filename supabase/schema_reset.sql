-- À lancer dans Supabase > SQL Editor > New Query > Run
-- Corrige la table purchases pour le système Olyx Studio + Stripe Webhook.

DROP TABLE IF EXISTS public.purchases;

CREATE TABLE public.purchases (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    product_id text NOT NULL,
    product_name text NOT NULL,
    stripe_session_id text UNIQUE NOT NULL,
    stripe_payment_intent text,
    amount_total integer,
    currency text DEFAULT 'eur',
    status text DEFAULT 'paid',
    download_url text,
    created_at timestamptz DEFAULT now()
);

ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read their purchases" ON public.purchases;
CREATE POLICY "Users can read their purchases"
ON public.purchases FOR SELECT
TO authenticated
USING (auth.uid() = user_id);
