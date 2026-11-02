import type { SpaceMemoryConfig } from "@rakazo/contracts";

export function markdownVaultConnectedLabel(config: SpaceMemoryConfig): string {
  const root = config.settings.root?.trim() || "Markdown vault";
  return config.settings.allowWrites === "true" ? `${root}, read/write` : `${root}, recall only`;
}
