# Cherche un insert/upsert sur la table reports dans ce dépôt (PowerShell).
# Usage : à la racine du repo :  pwsh -File scripts/find-reports-writer.ps1
# Attendu ici : aucune correspondance (le writer est hors inspectflow-web).

$ErrorActionPreference = "Stop"
# Racine du repo = parent du dossier scripts/
$root = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path (Join-Path $root "package.json"))) {
  Write-Error "Lance ce script depuis le repo inspectflow-web (package.json introuvable)."
  exit 1
}

$patterns = @(
  '\.from\([''"]reports[''"]\)\.(insert|upsert)',
  'insert\s+into\s+public\.?reports',
  "from\('reports'\)\.insert",
  'from\("reports"\)\.insert'
)

$dirs = @("app", "lib", "components", "supabase", "scripts", "middleware.ts")
$files = foreach ($d in $dirs) {
  $p = Join-Path $root $d
  if (Test-Path $p -PathType Container) {
    Get-ChildItem -Path $p -Recurse -Include *.ts,*.tsx,*.js,*.mjs,*.cjs -File -ErrorAction SilentlyContinue
  } elseif (Test-Path $p -PathType Leaf) {
    Get-Item -LiteralPath $p
  }
}

$found = $false
foreach ($f in $files) {
  $text = Get-Content -LiteralPath $f.FullName -Raw -ErrorAction SilentlyContinue
  if (-not $text) { continue }
  foreach ($re in $patterns) {
    if ($text -match $re) {
      Write-Host "MATCH $re -> $($f.FullName)"
      $found = $true
    }
  }
}

if (-not $found) {
  Write-Host "OK - aucun insert/upsert sur reports dans ce depot."
  Write-Host "Writer hors repo: voir docs/ARCHITECTURE.md et supabase/snippets/find-reports-writers.sql"
}
