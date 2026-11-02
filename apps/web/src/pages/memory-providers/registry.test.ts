import { describe, expect, it } from "vitest";
import { markdownVaultConnectedLabel } from "./markdown-vault-settings";
import {
  SERENITY_ENDPOINT_PLACEHOLDER,
  serenityConnectionDraft,
  serenityEndpointError,
} from "./serenity-settings";

describe("Markdown vault settings", () => {
  it("labels the folder and write mode", () => {
    expect(
      markdownVaultConnectedLabel({
        provider: "markdown-vault",
        settings: { root: "/srv/notes", allowWrites: "false" },
        defaultMemoryScope: "isolated",
        updatedAt: "",
      }),
    ).toBe("/srv/notes, recall only");
    expect(
      markdownVaultConnectedLabel({
        provider: "markdown-vault",
        settings: { root: "/srv/notes", allowWrites: "true" },
        defaultMemoryScope: "isolated",
        updatedAt: "",
      }),
    ).toBe("/srv/notes, read/write");
  });
});

describe("Serenity memory provider settings", () => {
  it("requires an explicit endpoint and leaves URL validity to the backend", () => {
    expect(serenityEndpointError("")).toBe("required");
    expect(serenityEndpointError("   ")).toBe("required");
    expect(serenityEndpointError("not a url")).toBeNull();
    expect(serenityEndpointError("ftp://serenity.example.test/mcp")).toBeNull();
    expect(serenityEndpointError("https://user:pass@serenity.example.test/mcp")).toBeNull();
    expect(serenityEndpointError("https://serenity.example.test/mcp?x=1")).toBeNull();
    expect(serenityEndpointError(SERENITY_ENDPOINT_PLACEHOLDER)).toBeNull();

    expect(
      serenityConnectionDraft({
        endpoint: "",
        token: "serenity_token",
        brainLabel: "",
        allowWrites: false,
      }),
    ).toEqual({ ok: false, error: "required" });

    expect(
      serenityConnectionDraft({
        endpoint: "not a url",
        token: "serenity_token",
        brainLabel: "",
        allowWrites: false,
      }),
    ).toEqual({
      ok: true,
      draft: {
        settings: { endpoint: "not a url", allowWrites: "false" },
        credentials: { token: "serenity_token" },
      },
    });

    expect(
      serenityConnectionDraft({
        endpoint: SERENITY_ENDPOINT_PLACEHOLDER,
        token: "sk_live_example",
        brainLabel: " personal ",
        allowWrites: true,
      }),
    ).toEqual({
      ok: true,
      draft: {
        settings: {
          endpoint: "https://serenity.sire.run/mcp",
          allowWrites: "true",
          brainLabel: "personal",
        },
        credentials: { token: "sk_live_example" },
      },
    });
  });
});
