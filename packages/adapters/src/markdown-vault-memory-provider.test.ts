import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { AdapterContext } from "@rakazo/adapter-kit";
import { afterEach, describe, expect, it } from "vitest";
import {
  createMarkdownVaultProvider,
  prepareMarkdownVaultConnection,
} from "./markdown-vault-memory-provider.js";

const context: AdapterContext = {
  operationId: "op-1",
  traceId: "trace-1",
  spaceId: "workspace-1",
  userId: "user-1",
  botId: "bot-1",
  signal: new AbortController().signal,
};

const roots: string[] = [];

async function vault(files: Record<string, string> = {}): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "rakazo-vault-"));
  roots.push(root);
  await mkdir(path.join(root, "memory"), { recursive: true });
  for (const [relative, content] of Object.entries(files)) {
    const target = path.join(root, "memory", relative);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content, "utf8");
  }
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("MarkdownVaultMemoryProvider", () => {
  it("requires an absolute root that exists", async () => {
    await expect(prepareMarkdownVaultConnection({ root: "relative" })).rejects.toThrow(
      "absolute path",
    );
    await expect(
      prepareMarkdownVaultConnection({ root: path.join(tmpdir(), "rakazo-missing-vault") }),
    ).rejects.toThrow("existing directory");
  });

  it("canonicalises the configured root", async () => {
    const root = await vault();
    const prepared = await prepareMarkdownVaultConnection({ root, allowWrites: "true" });
    expect(prepared.settings).toEqual({ root: await realpath(root), allowWrites: "true" });
    expect(prepared.credentials).toEqual({});
  });

  it("ranks notes by title, path and body matches", async () => {
    const root = await vault({
      "10-Projects/rakazo.md": "---\ntitle: Rakazo integration\n---\nRakazo uses colna memo.",
      "20-Areas/cooking.md": "---\ntitle: Cooking\n---\nA recipe for congee.",
      "30-Resources/notes.md": "Colna memory is a Markdown vault.",
    });
    const provider = createMarkdownVaultProvider({ root });

    const result = await provider.recall(
      { query: "colna memory", scope: "shared", botId: "bot-1", limit: 5 },
      context,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.map((hit) => hit.id)).toEqual([
      "30-Resources/notes.md",
      "10-Projects/rakazo.md",
    ]);
    expect(result.value[0]?.provenance).toContain("30-Resources/notes.md");
    expect(result.value[0]?.entity).toBe("vault");
  });

  it("matches Chinese queries with CJK bigrams", async () => {
    const root = await vault({
      "00-Inbox/ce.md": "联系人交换完成后自动关注。",
      "00-Inbox/other.md": "今天天气不错。",
    });
    const provider = createMarkdownVaultProvider({ root });

    const result = await provider.recall(
      { query: "联系人交换", scope: "isolated", botId: "bot-1", limit: 5 },
      context,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value[0]?.id).toBe("00-Inbox/ce.md");
  });

  it("skips symlinks that leave the vault", async () => {
    const root = await vault();
    const outside = await mkdtemp(path.join(tmpdir(), "rakazo-outside-"));
    roots.push(outside);
    await writeFile(path.join(outside, "secret.md"), "colna secret", "utf8");
    await symlink(path.join(outside, "secret.md"), path.join(root, "memory", "linked.md"));

    const provider = createMarkdownVaultProvider({ root });
    const result = await provider.recall(
      { query: "colna secret", scope: "shared", botId: "bot-1", limit: 5 },
      context,
    );

    expect(result).toEqual({ ok: true, value: [] });
  });

  it("reads one note by path and refuses escapes", async () => {
    const root = await vault({ "notes/plan.md": "# Plan\n\nShip it." });
    const provider = createMarkdownVaultProvider({ root });

    await expect(provider.read?.({ path: "notes/plan.md" }, context)).resolves.toEqual({
      ok: true,
      value: { path: "notes/plan.md", content: "# Plan\n\nShip it." },
    });
    await expect(provider.read?.({ path: "../outside.md" }, context)).resolves.toMatchObject({
      ok: false,
    });
    await expect(provider.read?.({ path: "/etc/passwd" }, context)).resolves.toMatchObject({
      ok: false,
    });
    await expect(provider.read?.({ path: "notes/plan.txt" }, context)).resolves.toMatchObject({
      ok: false,
    });
  });

  it("writes durable facts only when writes are enabled", async () => {
    const root = await vault();
    const readOnly = createMarkdownVaultProvider({ root });
    await expect(
      readOnly.save(
        {
          content: "Invoices go to finance.",
          scope: "shared",
          botId: "bot-1",
          source: { kind: "durable" },
        },
        context,
      ),
    ).resolves.toMatchObject({ ok: false });

    const writable = createMarkdownVaultProvider({ root, allowWrites: "true" });
    await expect(
      writable.save(
        {
          content: "Invoices go to finance.",
          scope: "shared",
          botId: "bot-1",
          source: { kind: "durable" },
        },
        context,
      ),
    ).resolves.toEqual({ ok: true, value: undefined });

    const saved = await readFile(path.join(root, "memory", "00-Inbox", "rakazo-memory.md"), "utf8");
    expect(saved).toContain("Invoices go to finance.");
  });

  it("leaves conversation summaries out of the vault", async () => {
    const root = await vault();
    const provider = createMarkdownVaultProvider({ root, allowWrites: "true" });

    await expect(
      provider.save(
        {
          content: "summary",
          scope: "shared",
          botId: "bot-1",
          source: { kind: "history", generation: 1 },
        },
        context,
      ),
    ).resolves.toEqual({ ok: true, value: undefined });
    await expect(
      readFile(path.join(root, "memory", "00-Inbox", "rakazo-memory.md"), "utf8"),
    ).rejects.toThrow();
  });

  it("recalls facts saved by an earlier run", async () => {
    const root = await vault();
    const provider = createMarkdownVaultProvider({ root, allowWrites: "true" });
    await provider.save(
      {
        content: "The team prefers conventional commits.",
        scope: "shared",
        botId: "bot-1",
        source: { kind: "durable" },
      },
      context,
    );

    const result = await provider.recall(
      { query: "conventional commits", scope: "shared", botId: "bot-1", limit: 5 },
      context,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value[0]?.id).toBe("00-Inbox/rakazo-memory.md");
  });
});
