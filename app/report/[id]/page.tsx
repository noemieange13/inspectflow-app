import { createClient } 
from
 
"@supabase/supabase-js"
;
export 
default
 
async
 function 
Page
(
{ 
params
 }: { 
params
: { id: 
string
 } }
)
 {
  
const
 supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  
const
 { data, error } = 
await
 supabase
    .
from
(
"rapports"
)
    .
select
(
"file_url"
)
    .eq(
"id"
, 
params
.id)
    .maybeSingle();
  
if
 (error) {
    
return
 <div>Erreur DB: {error.message}</div>;
  }
  
if
 (!data?.file_url) {
    
return
 <div>Report introuvable</div>;
  }
  
return
 (
    <div style={{ padding: 
20
 }}>
      <h2>Rapport prêt</h2>
      <a href={data.file_url} target=
"_blank"
 rel=
"noreferrer"
>
        👉 Ouvrir le PDF
      </a>
    </div>
  );
}