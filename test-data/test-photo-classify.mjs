/**
 * Test script: photo-classify pipeline with real inspection photos
 * Simulates what the client does: read photos, compress, call API, validate results
 */
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import sharp from 'sharp';

const API_URL = 'http://localhost:3000/api/smart-inspect/photo-classify';
const PHOTOS_DIR = join(import.meta.dirname, 'inspection-demo');
const SECTIONS = ['Toiture', 'Fondation', 'Extérieur', 'Intérieur', 'Plomberie', 'Électricité', 'Chauffage et Ventilation', 'Isolation'];
const TOP_N = 10;
const CONFIDENCE_THRESHOLD = 0.5;

async function compressPhoto(filePath, maxWidth = 800, quality = 70) {
  const buffer = await sharp(filePath)
    .resize({ width: maxWidth, withoutEnlargement: true })
    .jpeg({ quality })
    .toBuffer();
  return `data:image/jpeg;base64,${buffer.toString('base64')}`;
}

async function main() {
  console.log('=== TEST PHOTO-CLASSIFY PIPELINE ===\n');

  // 1. List photos, sort by size desc (simulates scorePhotoHeuristic)
  const files = readdirSync(PHOTOS_DIR)
    .filter(f => f.endsWith('.JPG') || f.endsWith('.jpg'))
    .map(f => ({
      name: f,
      path: join(PHOTOS_DIR, f),
      size: readFileSync(join(PHOTOS_DIR, f)).length,
    }))
    .sort((a, b) => b.size - a.size);

  console.log(`Total photos: ${files.length}`);
  console.log(`Top ${TOP_N} by size:`);
  const top10 = files.slice(0, TOP_N);
  top10.forEach((f, i) => console.log(`  ${i + 1}. ${f.name} (${(f.size / 1024 / 1024).toFixed(1)}MB)`));

  // 2. Compress top 10
  console.log(`\nCompressing ${TOP_N} photos (800px, quality 70)...`);
  const thumbs = [];
  for (const file of top10) {
    try {
      const dataUrl = await compressPhoto(file.path);
      thumbs.push({ name: file.name, dataUrl });
      console.log(`  ✓ ${file.name}: ${(dataUrl.length / 1024).toFixed(0)}KB compressed`);
    } catch (e) {
      console.log(`  ✗ ${file.name}: ${e.message}`);
    }
  }

  // 3. Call API
  console.log(`\nCalling /api/smart-inspect/photo-classify with ${thumbs.length} photos...`);
  const startTime = Date.now();

  let response;
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ photos: thumbs, sections: SECTIONS, language: 'fr' }),
    });
    response = await res.json();
    console.log(`  Status: ${res.status} (${Date.now() - startTime}ms)`);
  } catch (e) {
    console.error(`  ✗ API call failed: ${e.message}`);
    process.exit(1);
  }

  // 4. Validate response
  console.log('\n=== API RESPONSE ===');
  console.log(`ok: ${response.ok}`);

  if (!response.ok) {
    console.error('API returned error:', response.error || response);
    process.exit(1);
  }

  const results = response.results || [];
  console.log(`Results count: ${results.length}`);
  console.log('\nPer-photo results:');

  const validNames = new Set(thumbs.map(t => t.name));
  const validSections = new Set([...SECTIONS, 'none', 'unknown']);
  let validCount = 0;
  let invalidCount = 0;
  const sectionCounts = {};

  for (const r of results) {
    const nameOk = validNames.has(r.photoName);
    const sectionOk = validSections.has(r.section);
    const confOk = typeof r.confidence === 'number' && r.confidence >= 0 && r.confidence <= 1;
    const aboveThreshold = r.confidence >= CONFIDENCE_THRESHOLD;

    const status = (nameOk && sectionOk && confOk && aboveThreshold) ? '✓' : '✗';
    const issues = [];
    if (!nameOk) issues.push('bad photoName');
    if (!sectionOk) issues.push('bad section');
    if (!confOk) issues.push('bad confidence');
    if (!aboveThreshold && confOk) issues.push(`conf ${r.confidence} < ${CONFIDENCE_THRESHOLD}`);

    console.log(`  ${status} ${r.photoName} → ${r.section} (conf: ${r.confidence}) ${issues.length ? '⚠️ ' + issues.join(', ') : ''}`);

    if (nameOk && sectionOk && confOk && aboveThreshold && r.section !== 'none' && r.section !== 'unknown') {
      validCount++;
      sectionCounts[r.section] = (sectionCounts[r.section] || 0) + 1;
    } else {
      invalidCount++;
    }
  }

  // 5. Summary
  console.log('\n=== DISTRIBUTION SUMMARY ===');
  console.log(`Valid assignments: ${validCount}/${results.length}`);
  console.log(`Filtered out: ${invalidCount}`);
  console.log('\nPhotos per section:');
  for (const section of SECTIONS) {
    const count = sectionCounts[section] || 0;
    console.log(`  ${section}: ${count} photo${count !== 1 ? 's' : ''}`);
  }

  const coveredSections = SECTIONS.filter(s => (sectionCounts[s] || 0) > 0).length;
  console.log(`\nSections with ≥1 photo: ${coveredSections}/${SECTIONS.length}`);

  // 6. Verdict
  console.log('\n=== VERDICT ===');
  if (validCount >= 5 && coveredSections >= 4) {
    console.log('✅ PASS — Good classification coverage');
  } else if (validCount >= 3) {
    console.log('⚠️ PARTIAL — Some classification but poor coverage');
  } else {
    console.log('❌ FAIL — Classification not working');
  }
}

main().catch(e => { console.error(e); process.exit(1); });
