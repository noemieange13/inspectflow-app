import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Répertoire du projet (évite l’avertissement multi lockfiles si un parent a aussi un package-lock). */
const projectRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  /** Puppeteer = dev local uniquement ; évite bundling / install Chromium sur Vercel. */
  serverExternalPackages: [
    "puppeteer",
    "puppeteer-core",
    "@puppeteer/browsers",
    "pdfjs-dist",
    "@napi-rs/canvas",
    "tesseract.js",
    "tesseract.js-core",
  ],
  turbopack: {
    root: projectRoot,
  },
  allowedDevOrigins: ['127.0.0.1'],
  // Désactiver le proxy pour éviter les erreurs 503
  async rewrites() {
    return [];
  },
};

export default nextConfig;
