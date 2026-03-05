import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Resolves the absolute path to a skill file.
 *
 * Lookup order:
 * 1. Target project directory: <cwd>/<skillsDir>/<agent>/<filename>
 * 2. clorc package bundled skills: <clorc_install_dir>/skills/<agent>.md
 *
 * Returns the first path that exists, or null if neither is found.
 */
export function resolveSkillFile(
  cwd: string,
  skillsDir: string,
  agent: string,
  filename: string,
): string | null {
  // 1. Check target project's skill directory
  const projectSkill = resolve(cwd, skillsDir, agent, filename);
  if (existsSync(projectSkill)) {
    return projectSkill;
  }

  // 2. Also check with alternate casing (skill.md vs SKILL.md)
  const altFilename = filename === filename.toLowerCase()
    ? filename.toUpperCase()
    : filename.toLowerCase();
  const projectSkillAlt = resolve(cwd, skillsDir, agent, altFilename);
  if (existsSync(projectSkillAlt)) {
    return projectSkillAlt;
  }

  // 3. Check clorc package's bundled skills directory
  //    In built output: dist/utils/resolve-skill.js → dist/ → skills/
  //    __dirname = dist/ (after tsup bundles everything into dist/index.js,
  //    but __dirname at runtime = directory of the entry file = dist/)
  //    So we go up one level from dist/ to reach the package root, then into skills/
  const packageRoot = resolve(__dirname, '..');
  const bundledSkill = resolve(packageRoot, 'skills', `${agent}.md`);
  if (existsSync(bundledSkill)) {
    return bundledSkill;
  }

  return null;
}
