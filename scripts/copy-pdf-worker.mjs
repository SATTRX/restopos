// pdfjs-dist needs its worker file served as a static asset with a version
// that exactly matches the installed package (a mismatch throws at runtime).
// Copying it into public/ on every install is simpler and more reliable
// than trying to get Turbopack/webpack to bundle a worker from node_modules,
// and needs no third-party CDN. Referenced as '/pdf.worker.min.mjs' from
// components/restaurant-workspace.tsx's PDF-menu OCR import.
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const src = join(__dirname, '..', 'node_modules', 'pdfjs-dist', 'build', 'pdf.worker.min.mjs')
const destDir = join(__dirname, '..', 'public')
const dest = join(destDir, 'pdf.worker.min.mjs')

if (!existsSync(src)) {
  console.warn('[copy-pdf-worker] pdfjs-dist worker not found — skipping (is pdfjs-dist installed?)')
  process.exit(0)
}

mkdirSync(destDir, { recursive: true })
copyFileSync(src, dest)
console.log('[copy-pdf-worker] copied pdf.worker.min.mjs to public/')
