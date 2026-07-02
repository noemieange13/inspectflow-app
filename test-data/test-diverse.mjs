/**
 * Test 2: photo-classify with DIVERSE sample (not just biggest files)
 * Takes every 15th photo to get variety across the set
 */
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import sharp from 'sharp';

const API_URL = 'http://localhost:3000/api/smart-inspect/photo-classify';
const PHOTOS_DIR = join(import.meta.dirname, 'inspection-demo');
const SECTIONS = ['Toiture', 'Fondation', 'Extérieur', 'Intérieur', 'Plomberie', 'Électricité', 'Chauffage et Ventilation', 'Isolation'];

async function compressPhoto(filePath) {
  const buffer = await sharp(filePath)
    .resize({ width: 800, withoutEnlargement: true })
    .jpeg({ quality: 70 })
    .toBuffer();
  return `data:image/jpeg;base64,${buffer.toString('base64')}`;
}

async function main() {
  console.log('=== TEST 2: DIVERSE SAMPLE ===\n');

  const files = readdirSync(PHOTOS_DIR)
    .filter(f => f.endsWith('.JPG') || f.endsWith('.jpg'))
    .sort()
    .map(f => ({ name: f, path: join(PHOTOS_DIR, f) }));

  // Take every 15th photo for diversity (146/15 ≈ 10)
  const sample = files.filter((_, i) => i % 15 === 0).slice(0, 10);
  console.log(`Sample (every 15th): ${sample.map(f => f.name).join(', ')}\n`);

  const thumbs = [];
  for (const file of sample) {
    const dataUrl = await compressPhoto(file.path);
    thumbs.push({ name: file.name, dataUrl });
  }

  console.log(`Calling API with ${thumbs.length} diverse photos...`);
  const start = Date.now();
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ photos: thumbs, sections: SECTIONS, language: 'fr' }),
  });
  const data = await res.json();
  console.log(`Status: ${res.status} (${Date.now() - start}ms)\n`);

  if (!data.ok) { console.error('FAILED:', data); return; }

  const sectionCounts = {};
  for (const r of data.results || []) {
    if (r.confidence >= 0.5 && r.section !== 'none' && r.section !== 'unknown') {
      sectionCounts[r.section] = (sectionCounts[r.section] || 0) + 1;
      console.log(`  ✓ ${r.photoName} → ${r.section} (${r.confidence})`);
    } else {
      console.log(`  · ${r.photoName} → ${r.section} (${r.confidence}) [filtered]`);
    }
  }

  console.log('\n--- Distribution ---');
  for (const s of SECTIONS) console.log(`  ${s}: ${sectionCounts[s] || 0}`);
  const covered = SECTIONS.filter(s => (sectionCounts[s] || 0) > 0).length;
  console.log(`\nCoverage: ${covered}/8 sections`);
}

main().catch(console.error);
