import { describe, expect, it } from "vitest";
import { isSkillMarkdownPath, readSkillsFromFolder } from "./skills-import";

const file = (path: string, content: string) => ({
  path,
  text: async () => content,
});

const skill = (name: string, description = "When to use it.") =>
  `---\nname: ${name}\ndescription: ${description}\n---\n\nDo the thing.\n`;

describe("readSkillsFromFolder", () => {
  it("accepts SKILL.md at any depth and ignores other files", async () => {
    expect(isSkillMarkdownPath("SKILL.md")).toBe(true);
    expect(isSkillMarkdownPath("release/SKILL.md")).toBe(true);
    expect(isSkillMarkdownPath(".agents/skills/release/SKILL.md")).toBe(true);
    expect(isSkillMarkdownPath("release/skill.md")).toBe(true);
    expect(isSkillMarkdownPath("release/SKILL.md.bak")).toBe(false);
    expect(isSkillMarkdownPath("node_modules/pkg/SKILL.md")).toBe(false);

    const result = await readSkillsFromFolder([
      file("release/SKILL.md", skill("release")),
      file("release/scripts/publish.mjs", "console.log('not a skill')"),
      file("notes.md", "not a skill"),
      file("pr-watch/SKILL.md", skill("pr-watch")),
    ]);

    expect(result.skills.map((entry) => entry.name)).toEqual(["pr-watch", "release"]);
    expect(result.skipped).toEqual([]);
  });

  it("skips invalid, oversized and duplicate names", async () => {
    const result = await readSkillsFromFolder([
      file("bad/SKILL.md", "no frontmatter"),
      file("large/SKILL.md", skill("large", "x".repeat(100_000))),
      file("one/SKILL.md", skill("Same")),
      file("two/SKILL.md", skill("same")),
      file("ok/SKILL.md", skill("ok")),
    ]);

    expect(result.skills.map((entry) => entry.name)).toEqual(["ok", "Same"]);
    expect(result.skipped).toEqual([
      { path: "bad/SKILL.md", reason: "invalid" },
      { path: "large/SKILL.md", reason: "too_large" },
      { path: "two/SKILL.md", reason: "duplicate" },
    ]);
  });
});
