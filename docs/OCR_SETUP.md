# OCR Language Data Setup

InspectFlow's server-side OCR uses [tesseract.js](https://github.com/naptha/tesseract.js)
with the French + English models (`createWorker("fra+eng")` in
`lib/tesseractServerOcr.ts`).

## Why the `.traineddata` files are not in Git

The language models `eng.traineddata` and `fra.traineddata` are:

- **large binaries** that change rarely, and
- **automatically downloaded and cached at runtime** by tesseract.js on the
  first OCR call (tesseract.js writes them to the process working directory
  when no custom `langPath` is configured).

Committing them would bloat the repository and the history for no benefit, so
they are excluded via `.gitignore` (`*.traineddata`).

## How to obtain them

You normally do **nothing** — the first document/OCR request downloads and
caches the models automatically.

For **offline or air-gapped setups** (or to warm the cache during
provisioning), pre-fetch them with:

```bash
npm run setup:ocr
# or directly:
sh scripts/install-ocr-assets.sh
```

This downloads `eng.traineddata` and `fra.traineddata` into the project root
(the default tesseract.js cache location for this app).

## Notes

- If you prefer to version these assets deliberately (e.g. for reproducible
  offline builds), track them with **Git LFS** rather than committing raw
  binaries.
- The models come from the official tesseract.js CDN
  (`https://tessdata.projectnaptha.com`). Pin a specific version there if you
  need byte-for-byte reproducibility.
