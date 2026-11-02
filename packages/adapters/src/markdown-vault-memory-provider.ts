import type { Dirent } from "node:fs";
import { statSync } from "node:fs";
import { appendFile, lstat, mkdir, readdir, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import type {
  AdapterContext,
  SemanticMemoryProvider,
  SemanticMemoryRecallRequest,
  SemanticMemoryResponse,
  SemanticMemoryResult,
  SemanticMemorySaveRequest,
} from "@rakazo/adapter-kit";

/**
 * A personal Markdown knowledge base, such as a colna-memo vault, Obsidian vault, or any
 * folder of notes. Recall reads the vault directly; writes are opt-in and land in
 * `00-Inbox/rakazo-memory.md` so the owner's own tools keep indexing them.
 *
 * No colna binary or index is required: the vault stays portable Markdown.
 */
export const MARKDOWN_VAULT_PROVIDER_ID = "markdown-vault";

const NOTES_DIRECTORY = "memory";
const INBOX_PATH = "00-Inbox/rakazo-memory.md";
const MAX_NOTE_FILES = 5_000;
const MAX_NOTE_BYTES = 1_000_000;
const MAX_TOTAL_BYTES = 24_000_000;
const MAX_SAVED_CHARS = 8_000;
const SNIPPET_CHARS = 320;
const SKIPPED_DIRECTORIES = new Set([
  ".colna",
  ".git",
  ".obsidian",
  ".trash",
  "_attachments",
  "_templates",
  "build",
  "coverage",
  "dist",
  "node_modules",
]);

interface VaultConnection {
  root: string;
  notesRoot: string;
  allowWrites: boolean;
}

interface Note {
  relativePath: string;
  title: string;
  body: string;
  updatedAt: Date;
}

function requiredRoot(value: string | undefined): string {
  const root = value?.trim();
  if (!root) throw new Error("root is required");
  if (!path.isAbsolute(root)) throw new Error("root must be an absolute path");
  return path.resolve(root);
}

function parseBooleanSetting(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined || value === "") return defaultValue;
  if (value === "true" || value === "1") return true;
  if (value === "false" || value === "0") return false;
  throw new Error(`expected boolean setting, got "${value}"`);
}

async function isDirectory(target: string): Promise<boolean> {
  try {
    const info = await lstat(target);
    return info.isDirectory();
  } catch {
    return false;
  }
}

async function parseConnection(settings: Record<string, string>): Promise<VaultConnection> {
  const requested = requiredRoot(settings.root);
  if (!(await isDirectory(requested))) throw new Error("root must be an existing directory");
  const root = await realpath(requested);
  const memory = path.join(root, NOTES_DIRECTORY);
  return {
    root,
    notesRoot: (await isDirectory(memory)) ? memory : root,
    allowWrites: parseBooleanSetting(settings.allowWrites, false),
  };
}

export async function prepareMarkdownVaultConnection(
  settings: Record<string, string>,
): Promise<{ settings: Record<string, string>; credentials: Record<string, string> }> {
  const connection = await parseConnection(settings);
  return {
    settings: {
      root: connection.root,
      allowWrites: connection.allowWrites ? "true" : "false",
    },
    credentials: {},
  };
}

export function createMarkdownVaultProvider(
  settings: Record<string, string>,
): SemanticMemoryProvider {
  const root = requiredRoot(settings.root);
  // `prepare` canonicalises the root; a provider created directly still finds `memory/`.
  let notesRoot = root;
  try {
    const memory = path.join(root, NOTES_DIRECTORY);
    if (statSync(memory).isDirectory()) notesRoot = memory;
  } catch {
    // A plain Markdown folder without the colna-memo `memory/` child.
  }
  return new MarkdownVaultMemoryProvider({
    root,
    notesRoot,
    allowWrites: parseBooleanSetting(settings.allowWrites, false),
  });
}

function fromText(text: string): { title: string; body: string } {
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  const head = frontmatter?.[1] ?? "";
  const body = text.slice(frontmatter?.[0].length ?? 0);
  const title = /^title:\s*(.+?)\s*$/m.exec(head)?.[1]?.replace(/^["']|["']$/g, "");
  const heading = /^#\s+(.+?)\s*$/m.exec(body)?.[1];
  return { title: title || heading || "", body };
}

function wordTokens(text: string): string[] {
  const lower = text.toLocaleLowerCase("en-US");
  const words = lower.match(/[\p{L}\p{N}_]+/gu) ?? [];
  const tokens: string[] = [];
  for (const word of words) {
    const characters = [...word];
    // CJK text has no spaces, so bigrams stand in for words.
    if (characters.length > 1 && /^[\u3400-\u9fff\uf900-\ufaff]+$/.test(word)) {
      for (let index = 0; index < characters.length - 1; index += 1) {
        tokens.push(`${characters[index]}${characters[index + 1]}`);
      }
    }
    if (characters.length > 1 || /^[\u3400-\u9fff\uf900-\ufaff]$/.test(word)) tokens.push(word);
  }
  return tokens;
}

function occurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let index = haystack.indexOf(needle);
  while (index >= 0) {
    count += 1;
    index = haystack.indexOf(needle, index + needle.length);
  }
  return count;
}

function scoreNote(note: Note, query: string, terms: readonly string[]): number {
  const title = note.title.toLocaleLowerCase("en-US");
  const relative = note.relativePath.toLocaleLowerCase("en-US");
  const body = note.body.toLocaleLowerCase("en-US");
  let matched = 0;
  let score = 0;
  for (const term of terms) {
    const titleHits = occurrences(title, term);
    const pathHits = occurrences(relative, term);
    const bodyHits = occurrences(body, term);
    if (titleHits + pathHits + bodyHits === 0) continue;
    matched += 1;
    score += titleHits * 5 + pathHits * 3 + Math.min(bodyHits, 6);
  }
  if (matched === 0) return 0;
  const phrase = query.trim().toLocaleLowerCase("en-US");
  if (phrase && (title.includes(phrase) || body.includes(phrase))) score += 8;
  const coverage = matched / terms.length;
  const lengthPenalty = Math.sqrt(Math.max(1, note.body.length / 400));
  return (score / lengthPenalty) * (0.5 + 0.5 * coverage);
}

function snippet(note: Note, query: string, terms: readonly string[]): string {
  const body = note.body.replace(/\s+/g, " ").trim();
  const lower = body.toLocaleLowerCase("en-US");
  const phrase = query.trim().toLocaleLowerCase("en-US");
  let index = phrase ? lower.indexOf(phrase) : -1;
  if (index < 0) {
    for (const term of terms) {
      index = lower.indexOf(term);
      if (index >= 0) break;
    }
  }
  if (index < 0) return body.slice(0, SNIPPET_CHARS);
  const start = Math.max(0, index - 80);
  return `${start > 0 ? "…" : ""}${body.slice(start, start + SNIPPET_CHARS)}`;
}

async function listNotes(
  notesRoot: string,
  signal: AbortSignal,
): Promise<{ notes: string[]; truncated: boolean }> {
  const notes: string[] = [];
  let totalBytes = 0;
  let truncated = false;
  const pending = [notesRoot];
  while (pending.length > 0 && !truncated) {
    if (signal.aborted) throw new Error("cancelled");
    const directory = pending.pop();
    if (!directory) break;
    let entries: Dirent[];
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!SKIPPED_DIRECTORIES.has(entry.name)) pending.push(absolutePath);
        continue;
      }
      if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".md")) continue;
      if (notes.length >= MAX_NOTE_FILES) {
        truncated = true;
        break;
      }
      let size = 0;
      try {
        size = (await lstat(absolutePath)).size;
      } catch {
        continue;
      }
      if (size > MAX_NOTE_BYTES) continue;
      if (totalBytes + size > MAX_TOTAL_BYTES) {
        truncated = true;
        break;
      }
      totalBytes += size;
      notes.push(absolutePath);
    }
  }
  return { notes, truncated };
}

export class MarkdownVaultMemoryProvider implements SemanticMemoryProvider {
  private readonly connection: VaultConnection;

  constructor(connection: VaultConnection) {
    this.connection = connection;
  }

  describe() {
    return {
      id: MARKDOWN_VAULT_PROVIDER_ID,
      contractVersion: "1",
      adapterVersion: "0.1.0",
      capabilities: {
        recall: true,
        save: true,
        purgeHistory: true,
        sharedScope: true,
      } as const,
    };
  }

  async recall(
    request: SemanticMemoryRecallRequest,
    context: AdapterContext,
  ): Promise<SemanticMemoryResponse<SemanticMemoryResult[]>> {
    const query = request.query.trim();
    const terms = [...new Set(wordTokens(query))];
    if (!query || terms.length === 0) return { ok: true, value: [] };
    try {
      const { notes } = await listNotes(this.connection.notesRoot, context.signal);
      const limit = Math.min(Math.max(request.limit, 1), 20);
      const ranked: Array<{ note: Note; score: number }> = [];
      for (const absolutePath of notes) {
        if (context.signal.aborted) throw new Error("cancelled");
        try {
          const text = await readFile(absolutePath, "utf8");
          const { title, body } = fromText(text);
          const relativePath = path
            .relative(this.connection.notesRoot, absolutePath)
            .split(path.sep)
            .join("/");
          const note: Note = {
            relativePath,
            title: title || path.basename(absolutePath, path.extname(absolutePath)),
            body,
            updatedAt: (await lstat(absolutePath)).mtime,
          };
          const score = scoreNote(note, query, terms);
          if (score > 0) ranked.push({ note, score });
        } catch {
          // A note deleted or unreadable during the scan does not fail the whole recall.
        }
      }
      ranked.sort(
        (left, right) =>
          right.score - left.score || left.note.relativePath.localeCompare(right.note.relativePath),
      );
      return {
        ok: true,
        value: ranked.slice(0, limit).map(({ note, score }) => ({
          memory: `${note.title}\n${snippet(note, query, terms)}`,
          score,
          updatedAt: note.updatedAt.toISOString(),
          id: note.relativePath,
          provenance: `vault: ${note.relativePath}`,
          entity: "vault",
        })),
      };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : "Could not search the Markdown vault.",
      };
    }
  }

  async read(
    request: { path: string },
    context: AdapterContext,
  ): Promise<SemanticMemoryResponse<{ path: string; content: string }>> {
    if (context.signal.aborted) return { ok: false, error: "cancelled" };
    const relative = request.path.trim().replaceAll("\\", "/");
    if (
      !relative ||
      path.isAbsolute(relative) ||
      relative.split("/").some((segment) => segment === "..") ||
      !relative.toLowerCase().endsWith(".md")
    ) {
      return { ok: false, error: "Note path must be a relative Markdown path." };
    }
    const file = path.resolve(this.connection.notesRoot, relative);
    if (!file.startsWith(`${this.connection.notesRoot}${path.sep}`)) {
      return { ok: false, error: "Note path must stay inside the vault." };
    }
    try {
      const info = await lstat(file);
      if (!info.isFile() || info.isSymbolicLink()) {
        return { ok: false, error: "Note not found." };
      }
      if (info.size > MAX_NOTE_BYTES) return { ok: false, error: "Note is too large to read." };
      return { ok: true, value: { path: relative, content: await readFile(file, "utf8") } };
    } catch {
      return { ok: false, error: "Note not found." };
    }
  }

  async save(
    request: SemanticMemorySaveRequest,
    context: AdapterContext,
  ): Promise<SemanticMemoryResponse> {
    if (context.signal.aborted) return { ok: false, error: "cancelled" };
    if (request.source.kind === "history") return { ok: true, value: undefined };
    if (!this.connection.allowWrites) {
      return {
        ok: false,
        error:
          "Markdown vault writes are disabled for this Space. Enable writing in Memory settings to save durable facts.",
      };
    }
    const content = request.content.trim().slice(0, MAX_SAVED_CHARS);
    if (!content) return { ok: true, value: undefined };
    const file = path.join(this.connection.notesRoot, INBOX_PATH);
    try {
      await mkdir(path.dirname(file), { recursive: true });
      let existing = "";
      try {
        existing = await readFile(file, "utf8");
      } catch {
        // The first saved fact creates the note.
      }
      const date = new Date().toISOString().slice(0, 10);
      const fact = content.replace(/\r?\n/g, " ").replace(/\s+/g, " ").trim();
      const line = `- ${date}: ${fact}\n`;
      if (!existing.trim()) {
        const frontmatter = `---\ntitle: Rakazo memory\ntags: inbox, rakazo\n---\n\n# Rakazo memory\n\n`;
        await appendFile(file, `${frontmatter}${line}`, "utf8");
      } else {
        await appendFile(file, `${existing.endsWith("\n") ? "" : "\n"}${line}`, "utf8");
      }
      return { ok: true, value: undefined };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : "Could not save to the Markdown vault.",
      };
    }
  }

  async purgeHistory(): Promise<SemanticMemoryResponse> {
    // Rakazo owns conversation history; the vault is only the durable note store.
    return { ok: true, value: undefined };
  }
}
