-- À exécuter UNE FOIS dans Supabase → SQL Editor (remplace l’UUID si besoin).
-- Ensuite : SELECT access_token et construis l’URL /report/<id>?token=<token>

update public.reports
set
  access_token = encode(gen_random_bytes(32), 'hex'),
  token_expires_at = now() + interval '15 minutes'
where id = 'f5cbc318-0b26-434b-afc4-f566b570a595';

-- Vérification
select id, access_token, token_expires_at
from public.reports
where id = 'f5cbc318-0b26-434b-afc4-f566b570a595';
