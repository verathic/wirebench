import { readdirSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const v3FixtureDir = resolve(here, '../../../../../../fixtures/postman-v3');

/** Every file under `fixtures/postman-v3/<folder>`, keyed by POSIX path relative to it, as a host hands them over. */
export function fixtureFiles(folder: string): Map<string, string> {
  const root = resolve(v3FixtureDir, folder);
  const files = new Map<string, string>();
  const walk = (dir: string): void => {
    for (const dirent of readdirSync(dir, { withFileTypes: true })) {
      const path = resolve(dir, dirent.name);
      if (dirent.isDirectory()) walk(path);
      else if (/\.(ya?ml|js)$/i.test(dirent.name)) {
        files.set(relative(root, path).split(sep).join('/'), readFileSync(path, 'utf8'));
      }
    }
  };
  walk(root);
  return files;
}
