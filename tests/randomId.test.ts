import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { createRandomId } from "../src/utils/randomId.ts";

test("createRandomId works when randomUUID is missing", () => {
  const original = globalThis.crypto;
  Object.defineProperty(globalThis, "crypto", {
    configurable: true,
    value: {
      getRandomValues(bytes: Uint8Array) {
        for (let index = 0; index < bytes.length; index += 1) {
          bytes[index] = index + 1;
        }
        return bytes;
      },
    },
  });
  try {
    const id = createRandomId();
    assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  } finally {
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: original,
    });
  }
});

test("billing and remote tools do not call crypto.randomUUID", () => {
  const sources = [
    readFileSync("src/pages/admin/exec.tsx", "utf8"),
    readFileSync("src/pages/admin/NodeDetailPage.tsx", "utf8"),
    readFileSync("src/pages/admin/nodemgt/index.tsx", "utf8"),
    readFileSync("src/pages/terminal/index.tsx", "utf8"),
    readFileSync("src/pages/terminal/FileManager.tsx", "utf8"),
  ];
  for (const source of sources) {
    assert.match(source, /createRandomId\(/);
    assert.doesNotMatch(source, /crypto\.randomUUID/);
  }
});
