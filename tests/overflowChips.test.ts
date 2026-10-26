import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { visibleChipCount, visibleChipCountFromRects } from "../src/pages/admin/nodemgt/overflowChips.ts";

test("visibleChipCount keeps every chip when they fit", () => {
  assert.equal(visibleChipCount([40, 40, 40], 4, 36, 200), 3);
});

test("visibleChipCount uses leftover space before adding +N", () => {
  assert.equal(visibleChipCount([48, 48, 48, 48, 48, 48, 48, 48], 4, 36, 200), 3);
});

test("visibleChipCount always keeps the first chip", () => {
  assert.equal(visibleChipCount([180, 80, 80], 4, 36, 100), 1);
});

test("visibleChipCountFromRects floors host width at fractional DPR", () => {
  assert.equal(visibleChipCountFromRects([64.4, 64.4, 64.4], 4, 36, 200.7), 2);
});

test("searchable nodemgt selects type to filter instead of editing the current label", () => {
  const source = readFileSync(new URL("../src/pages/admin/nodemgt/index.tsx", import.meta.url), "utf8");
  assert.match(source, /function SearchableSelect/);
  assert.match(source, /function SearchableMultiSelect/);
  assert.match(source, /if \(!open \|\| reason === "reset"\) return/);
  assert.match(source, /setQuery\(""\)/);
  assert.match(source, /onOpen=\{\(\) => \{/);
  assert.match(source, /inputValue=\{open \? query : \(selected\?\.label \?\? ""\)\}/);
  assert.match(source, /renderValue=\{\(tagValue\) => \{/);
  assert.match(source, /label=\{`\+\$\{extra\}`\}/);
});

test("nodemgt record table fills the page without a min-width scrollbar", () => {
  const source = readFileSync(new URL("../src/pages/admin/nodemgt/index.tsx", import.meta.url), "utf8");
  assert.match(source, /admin-responsive-table-wrap overflow-x-hidden/);
  assert.match(source, /admin-nodemgt-record-table w-full/);
  assert.doesNotMatch(source, /min-w-\[1560px\]/);
  assert.match(source, /flexWrap: "nowrap"/);
  assert.match(source, /maxWidth: "100%"/);
  assert.match(source, /visibleChipCountFromRects/);
});
