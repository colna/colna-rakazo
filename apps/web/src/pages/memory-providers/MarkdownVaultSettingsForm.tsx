import { Trans } from "@lingui/react/macro";
import { Button, Field, FieldLabel, Input, Toggle } from "@rakazo/ui-web";
import { useId, useState } from "react";
import type { MemoryProviderSettingsFormProps } from "./registry";

/** A colna-memo, Obsidian, or any Markdown folder the API process can read. */
export function MarkdownVaultSettingsForm({ busy, onConnect }: MemoryProviderSettingsFormProps) {
  const rootId = useId();
  const writesLabelId = useId();
  const [root, setRoot] = useState("");
  const [allowWrites, setAllowWrites] = useState(false);

  async function connect() {
    if (!root.trim()) return;
    const connected = await onConnect({
      settings: {
        root: root.trim(),
        allowWrites: allowWrites ? "true" : "false",
      },
      credentials: {},
    });
    if (connected) setRoot("");
  }

  return (
    <>
      <Field className="mt-4">
        <FieldLabel htmlFor={rootId}>
          <Trans>Vault folder</Trans>
        </FieldLabel>
        <Input
          id={rootId}
          value={root}
          disabled={busy}
          onChange={(event) => setRoot(event.target.value)}
          placeholder="/Users/you/colna-memo"
          autoComplete="off"
          spellCheck={false}
        />
        <p className="mt-2 text-[13px] text-muted-foreground">
          <Trans>A folder on the server. Self-hosted only.</Trans>
        </p>
      </Field>

      <Field className="mt-4" aria-labelledby={writesLabelId}>
        <FieldLabel id={writesLabelId}>
          <Trans>Allow writing</Trans>
        </FieldLabel>
        <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
          <Toggle
            pressed={!allowWrites}
            disabled={busy}
            onPressedChange={() => setAllowWrites(false)}
            className="text-[13px] aria-pressed:bg-background aria-pressed:shadow-sm"
          >
            <Trans>Recall only</Trans>
          </Toggle>
          <Toggle
            pressed={allowWrites}
            disabled={busy}
            onPressedChange={() => setAllowWrites(true)}
            className="text-[13px] aria-pressed:bg-background aria-pressed:shadow-sm"
          >
            <Trans>Recall and write</Trans>
          </Toggle>
        </div>
      </Field>

      <Button
        type="button"
        variant="secondary"
        className="mt-5"
        disabled={busy || !root.trim()}
        onClick={() => void connect()}
      >
        {busy ? <Trans>Connecting…</Trans> : <Trans>Connect</Trans>}
      </Button>
    </>
  );
}
