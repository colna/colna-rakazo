import { describe, expect, it } from "vitest";
import { localNoAuthEnabled } from "./local-no-auth.js";

describe("localNoAuthEnabled", () => {
  it("is off unless explicitly enabled", () => {
    expect(localNoAuthEnabled({})).toBe(false);
    expect(localNoAuthEnabled({ NODE_ENV: "development" })).toBe(false);
    expect(localNoAuthEnabled({ RAKAZO_LOCAL_NO_AUTH: "1" })).toBe(false);
  });

  it("is on only outside production", () => {
    expect(localNoAuthEnabled({ RAKAZO_LOCAL_NO_AUTH: "true" })).toBe(true);
    expect(localNoAuthEnabled({ RAKAZO_LOCAL_NO_AUTH: "true", NODE_ENV: "development" })).toBe(
      true,
    );
    expect(localNoAuthEnabled({ RAKAZO_LOCAL_NO_AUTH: "true", NODE_ENV: "production" })).toBe(
      false,
    );
  });
});
