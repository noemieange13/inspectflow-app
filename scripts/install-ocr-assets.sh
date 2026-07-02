#!/usr/bin/env sh
# Pre-fetch Tesseract OCR language data (fra + eng) for InspectFlow.
#
# These files are gitignored (*.traineddata) and normally downloaded on demand
# by tesseract.js. Run this only for offline/air-gapped setups or to warm the
# cache during provisioning. See docs/OCR_SETUP.md.
set -eu

# tesseract.js default model CDN. Override with TESSDATA_BASE if needed.
TESSDATA_BASE="${TESSDATA_BASE:-https://tessdata.projectnaptha.com/4.0.0}"
DEST_DIR="${1:-$(pwd)}"

download() {
  lang="$1"
  gz="${DEST_DIR}/${lang}.traineddata.gz"
  out="${DEST_DIR}/${lang}.traineddata"

  if [ -f "$out" ]; then
    echo "✓ ${lang}.traineddata already present, skipping."
    return 0
  fi

  echo "↓ Downloading ${lang}.traineddata …"
  curl -fsSL "${TESSDATA_BASE}/${lang}.traineddata.gz" -o "$gz"
  gunzip -f "$gz"
  echo "✓ ${lang}.traineddata ready."
}

download eng
download fra

echo "Done. OCR language data installed in: ${DEST_DIR}"
