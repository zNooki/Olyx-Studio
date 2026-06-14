-- À lancer dans Supabase > SQL Editor > New Query > Run
-- Ajoute le pseudo et l'avatar au profil utilisateur.

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS username text;

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS avatar_url text;
