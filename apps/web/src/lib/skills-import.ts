import { parseSkillMd } from "@rakazo/core";

const SKILL_FILE = /(?:^|\/)SKILL\.md$/i;
const SKIPPED_SEGMENTS = new Set([".git", "node_modules"]);
const MAX_SKILL_CHARS = 100_000;

export interface SkillFolderFile {
  path: string;
  text(): Promise<string>;
}

export interface SkillFolderImport {
  content: string;
  name: string;
  path: string;
}

export interface SkillFolderResult {
  skills: SkillFolderImport[];
  skipped: Array<{ path: string; reason: "duplicate" | "invalid" | "too_large" }>;
}

export function isSkillMarkdownPath(path: string): boolean {
  if (!SKILL_FILE.test(path)) return false;
  return !path.split("/").some((segment) => SKIPPED_SEGMENTS.has(segment));
}

/**
 * Reads every SKILL.md in a chosen folder. Sibling scripts are not included: Rakazo installs
 * skills as instructions only. Names are de-duplicated case-insensitively within the folder.
 */
export async function readSkillsFromFolder(
  files: readonly SkillFolderFile[],
): Promise<SkillFolderResult> {
  const skills: SkillFolderImport[] = [];
  const skipped: SkillFolderResult["skipped"] = [];
  const names = new Set<string>();
  for (const file of [...files]
    .filter((entry) => isSkillMarkdownPath(entry.path))
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))) {
    const content = await file.text();
    if (content.length > MAX_SKILL_CHARS) {
      skipped.push({ path: file.path, reason: "too_large" });
      continue;
    }
    const parsed = parseSkillMd(content);
    if ("error" in parsed) {
      skipped.push({ path: file.path, reason: "invalid" });
      continue;
    }
    const name = parsed.name.trim().toLocaleLowerCase("en-US");
    if (names.has(name)) {
      skipped.push({ path: file.path, reason: "duplicate" });
      continue;
    }
    names.add(name);
    skills.push({ content, name: parsed.name, path: file.path });
  }
  return { skills, skipped };
}
