// Solmar Heat — the entrypoint make.fun runs (Node 22, standard library only).
// The game is plain static files under game/ plus the screenshots/ the maker
// took of it. This program hands both in: it copies them into the output
// directory and writes dossier.json, the summary the judge reads, using the
// kit's vendored library. Run it locally with:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

// The scorer's own caps, from the gate: at most 4 screenshots of 256 KiB,
// game/ at most 993 entries and 48 MiB, paths at most 1000 bytes, and the
// dossier's text at most 160 KiB. The program refuses nothing itself — it
// just hands the dossier builder the same numbers the scorer uses.
const DOSSIER_LIMITS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

function copyEntry(src, dest) {
  mkdirSync(dest, { recursive: true });
  cpSync(src, dest, { recursive: true });
}

function main() {
  const repoRoot = fileURLToPath(new URL('.', import.meta.url));
  const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
  const gameDir = join(repoRoot, 'game');
  const shotsDir = join(repoRoot, 'screenshots');

  mkdirSync(outDir, { recursive: true });
  copyEntry(gameDir, join(outDir, 'game'));

  const shotNames = existsSync(shotsDir) ? readdirSync(shotsDir).sort() : [];
  copyEntry(shotsDir, join(outDir, 'screenshots'));

  const dossier = buildDossier(outDir, DOSSIER_LIMITS);
  writeFileSync(join(outDir, 'dossier.json'), dossier);
  return { shots: shotNames.length };
}

const result = main();
console.log(`Solmar Heat handed in: ${result.shots} screenshot(s), game/ and dossier.json written.`);
