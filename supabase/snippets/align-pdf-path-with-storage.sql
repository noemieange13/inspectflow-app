-- Après upload dans Storage → bucket rapports-pdf → chemin ci-dessous.
-- Vérifie user_id avec : select user_id from public.reports where id = '...';

update public.reports
set pdf_path = user_id::text || '/' || id::text || '.pdf'
where id = 'f5cbc318-0b26-434b-afc4-f566b570a595';
