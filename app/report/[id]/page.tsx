import { createServerClient } from '@/lib/supabaseServer';

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const { id } = await params;
  const sp = await searchParams;

  const token = Array.isArray(sp.token) ? sp.token[0] : sp.token;
  const cleanId = id?.trim();

  if (!cleanId || !token) {
    return <div>Accès invalide</div>;
  }

  const supabase = await createServerClient();

  const { data, error } = await supabase
    .from('reports')
    .select(
      'id, pdf_url, access_token, token_expires_at'
    )
    .eq('id', cleanId)
    .maybeSingle();

  if (error) {
    console.error(error);
    return <div>Erreur serveur</div>;
  }

  if (!data || data.access_token !== token) {
    return <div>Accès refusé</div>;
  }

  if (!data.pdf_url) {
    return <div>PDF indisponible</div>;
  }

  let finalUrl = data.pdf_url;

  if (!data.pdf_url.startsWith('http')) {
    const { data: signed } = await supabase
      .storage
      .from('rapports-pdf')
      .createSignedUrl(data.pdf_url, 3600);

    finalUrl = signed?.signedUrl || '';
  }

  return (
    <div className="w-full h-screen">
      <iframe src={finalUrl} className="w-full h-full" />
    </div>
  );
}