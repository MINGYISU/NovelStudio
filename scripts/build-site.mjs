// Assembles the GitHub Pages site into ./_site: the static files in site/,
// plus the user-guide screenshots and app icons, so they are not duplicated in the repo.
import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, '_site');

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

await cp(path.join(root, 'site'), out, { recursive: true });
await cp(path.join(root, 'docs/images/user-guide'), path.join(out, 'shots'), { recursive: true });
await cp(path.join(root, 'public/icons'), path.join(out, 'icons'), { recursive: true });
await writeFile(path.join(out, '.nojekyll'), '');

console.log(`Site written to ${path.relative(process.cwd(), out) || '.'}`);
