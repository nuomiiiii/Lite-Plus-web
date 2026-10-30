import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  displayRemoteAddress,
  filterRemoteNodes,
  nextRemotePickerPageSize,
  orderRemoteNodes,
  pageForSelectedRemoteNode,
  paginateRemoteNodes,
  remoteNodeSearchText,
  type RemoteNodePickerItem,
} from "../src/utils/remoteNodePicker.ts";

const nodes: RemoteNodePickerItem[] = [
  {
    uuid: "hk",
    name: "HK-Gateway",
    ipv4: "203.0.113.18",
    ipv6: "2001:db8:10::18",
    group: "Asia",
    region: "HK",
  },
  {
    uuid: "de",
    name: "Frankfurt-Storage",
    ipv4: "198.51.100.64",
    group: "Europe",
    region: "DE",
  },
];

const online = new Set(["hk"]);

test("searches remote nodes by name, IPv4, IPv6, group and tags", () => {
  assert.deepEqual(filterRemoteNodes(nodes, "gateway", "all", online).map((node) => node.uuid), ["hk"]);
  assert.deepEqual(filterRemoteNodes(nodes, "203.0.113", "all", online).map((node) => node.uuid), ["hk"]);
  assert.deepEqual(filterRemoteNodes(nodes, "db8:10", "all", online).map((node) => node.uuid), ["hk"]);
  assert.deepEqual(filterRemoteNodes(nodes, "euro", "all", online).map((node) => node.uuid), ["de"]);
  const tagged = { ...nodes[1], tags: "hetzner;cn2" };
  assert.deepEqual(filterRemoteNodes([tagged], "hetzner", "all", online).map((node) => node.uuid), ["de"]);
  const colored = { ...nodes[1], tags: "落地机<green>" };
  assert.deepEqual(filterRemoteNodes([colored], "落地机", "all", online).map((node) => node.uuid), ["de"]);
});

test("does not include the region field in remote node search", () => {
  assert.equal(remoteNodeSearchText(nodes[0]).includes("hk"), true);
  const renamed = { ...nodes[0], name: "Gateway", region: "JP" };
  assert.deepEqual(filterRemoteNodes([renamed], "jp", "all", online), []);
});

test("shows all servers by default and applies explicit status filters", () => {
  assert.deepEqual(filterRemoteNodes(nodes, "", "all", online).map((node) => node.uuid), ["hk", "de"]);
  assert.deepEqual(filterRemoteNodes(nodes, "", "online", online).map((node) => node.uuid), ["hk"]);
  assert.deepEqual(filterRemoteNodes(nodes, "", "offline", online).map((node) => node.uuid), ["de"]);
});

test("matches the server management order before filtering and pagination", () => {
  const unorderedNodes: RemoteNodePickerItem[] = [
    { uuid: "node-c", name: "Node C", weight: 20, created_at: "2026-08-01T00:00:00Z" },
    { uuid: "node-b", name: "Node B", weight: 10, created_at: "2026-08-01T00:01:00Z" },
    { uuid: "node-a", name: "Node A", weight: 10, created_at: "2026-08-01T00:00:00Z" },
  ];

  assert.deepEqual(
    orderRemoteNodes(unorderedNodes).map((node) => node.uuid),
    ["node-a", "node-b", "node-c"],
  );
});

test("normalizes missing addresses before rendering their empty state", () => {
  assert.equal(displayRemoteAddress(" 2001:db8::1 "), "2001:db8::1");
  assert.equal(displayRemoteAddress(""), "");
  assert.equal(displayRemoteAddress(undefined), "");
});

test("opens the picker on the page that still holds the last selected server", () => {
  const manyNodes = Array.from({ length: 14 }, (_, index) => ({
    uuid: `node-${index + 1}`,
    name: `Node ${index + 1}`,
  }));

  assert.equal(pageForSelectedRemoteNode(manyNodes, "node-7", 6), 2);
  assert.equal(pageForSelectedRemoteNode(manyNodes, "node-1", 6), 1);
  assert.equal(pageForSelectedRemoteNode(manyNodes, "missing", 6), 1);
  assert.equal(pageForSelectedRemoteNode(manyNodes, "", 6), 1);

  const pickerSource = readFileSync(new URL("../src/components/remote/RemoteNodePicker.tsx", import.meta.url), "utf8");
  const terminalSource = readFileSync(new URL("../src/pages/terminal/index.tsx", import.meta.url), "utf8");
  assert.match(pickerSource, /pageForSelectedRemoteNode\(filteredNodes, selectedUUID, effectivePageSize\)/);
  assert.match(terminalSource, /if \(current && orderedNodes\.some\(\(node\) => node\.uuid === current\)\) return current;/);
  assert.doesNotMatch(terminalSource, /nodes\.find\(\(node\) => online\.has\(node\.uuid\)\)\?\.uuid \|\s*nodes\[0\]\?\.uuid/);
});

test("uses independent page sizes and clamps stale page numbers", () => {
  const manyNodes = Array.from({ length: 35 }, (_, index) => ({
    uuid: `node-${index + 1}`,
    name: `Node ${index + 1}`,
  }));

  const portalPage = paginateRemoteNodes(manyNodes, 2, 16);
  assert.equal(portalPage.currentPage, 2);
  assert.equal(portalPage.totalPages, 3);
  assert.equal(portalPage.nodes.length, 16);

  const terminalPage = paginateRemoteNodes(manyNodes, 99, 6);
  assert.equal(terminalPage.currentPage, 6);
  assert.equal(terminalPage.totalPages, 6);
  assert.equal(terminalPage.nodes.length, 5);
});

test("keeps the full page size after a short last page is measured", () => {
  assert.equal(nextRemotePickerPageSize(2, 6, 1), 6);
  assert.equal(nextRemotePickerPageSize(2, 6, 2), 6);
  assert.equal(nextRemotePickerPageSize(6, 6, 6), 6);
  assert.equal(nextRemotePickerPageSize(4, 6, 6), 4);
});

test("keeps the terminal portal aligned with the dashboard visual language", () => {
  const terminalSource = readFileSync(new URL("../src/pages/terminal/index.tsx", import.meta.url), "utf8");
  const pickerSource = readFileSync(new URL("../src/components/remote/RemoteNodePicker.tsx", import.meta.url), "utf8");
  const terminalStyles = readFileSync(new URL("../src/pages/terminal/Terminal.css", import.meta.url), "utf8");

  assert.equal(pickerSource.includes('t("terminal.server_count"'), false);
  assert.match(pickerSource, /from "@mui\/material\/Paper"/);
  assert.match(pickerSource, /from "@mui\/material\/TextField"/);
  assert.equal(pickerSource.includes('t("terminal.ip_address")'), true);
  assert.equal(pickerSource.includes('t("terminal.address_unreported")'), true);
  assert.match(pickerSource, /color: value \? undefined : "text.secondary"/);
  assert.match(pickerSource, /\["IPv4", ipv4\][\s\S]*\["IPv6", ipv6\]/);
  assert.equal(pickerSource.includes('t("terminal.copy_address"'), false);
  assert.equal(pickerSource.includes('role="button"'), true);
  assert.equal(pickerSource.includes("allowOffline"), true);
  assert.equal(pickerSource.includes("if (selectable) onSelect(node)"), true);
  assert.equal(pickerSource.includes("if (knownOnline) onSelect(node)"), false);
  assert.equal(pickerSource.includes('event.key !== "Enter" && event.key !== " "'), true);
  assert.equal(terminalStyles.includes("width: min(864px, calc(100vw - 48px))"), true);
  assert.equal(terminalStyles.includes("width: min(94vw, 1040px)"), false);
  assert.equal(terminalStyles.includes("height: min(calc(100vh - 24px), 820px)"), false);
  assert.equal(terminalStyles.includes("grid-template-columns: repeat(2, minmax(0, 1fr))"), true);
  assert.equal(terminalStyles.includes("grid-template-columns: repeat(3, minmax(0, 1fr))"), false);
  assert.equal(terminalSource.includes('maxWidth="1040px"'), false);
  assert.equal(terminalSource.includes("pageSize={6}"), true);
  assert.equal(terminalSource.includes("columns={2}"), true);
  assert.match(terminalSource, /from "@mui\/material\/Drawer"/);
  assert.doesNotMatch(terminalSource, /ThemeProvider theme=\{terminalMuiTheme\}/);
  assert.doesNotMatch(pickerSource, /minHeight: \{ xs: 0, sm: 204 \}/);
  assert.match(pickerSource, /bgcolor: "background.paper"/);
  assert.doesNotMatch(pickerSource, /bgcolor: selected \? "action.hover"/);
  assert.match(pickerSource, /NODE_ONLINE/);
  assert.match(pickerSource, /NODE_OFFLINE/);
  assert.doesNotMatch(pickerSource, /RemoteNodePicker\.css/);
  assert.match(pickerSource, /common\.tags/);
  assert.match(pickerSource, /<CustomTags tags=\{tag \|\| node\.tags/);
  assert.doesNotMatch(pickerSource, /SquareTerminal/);
  assert.match(pickerSource, /openedUUIDs/);
  assert.match(pickerSource, /remote-node-picker-results/);
  assert.match(pickerSource, /remote-node-picker-controls/);
  assert.match(pickerSource, /flex: \{ xs: "0 0 auto", sm: "1 1 280px" \}/);
  assert.doesNotMatch(pickerSource, /flex: "1 1 280px"/);
  assert.doesNotMatch(terminalSource, /rowsPerPage=\{compact \? 6 : 3\}/);
  assert.match(pickerSource, /resultsAreaRef/);
  assert.match(terminalStyles, /overflow: hidden/);
  assert.match(terminalStyles, /\.remote-dialog-actions \{[\s\S]*flex: 0 0 auto/);
  assert.match(terminalStyles, /\.remote-picker-paper\.is-compact \.remote-node-picker-meta \{[\s\S]*border-top: 0/);
  assert.match(pickerSource, /justifyContent: compact \? "flex-start"/);
  assert.match(pickerSource, /clipOverflow === "top" \? "end" : "start"/);
  assert.match(terminalSource, /openPicker\("right"\)/);
  assert.match(terminalSource, /openPicker\("left"\)/);
  assert.match(terminalSource, /openPicker\("center"\)/);
  assert.match(terminalSource, /from "@mui\/material\/Fade"/);
  assert.match(terminalSource, /slots=\{\{ transition: Fade \}\}/);
  assert.match(terminalSource, /transitionDuration=\{\{ enter: 360, exit: 200 \}\}/);
  assert.match(terminalSource, /pickerCentered/);
  assert.match(terminalSource, /anchor=\{compact \? "bottom" : pickerSide === "left" \? "left" : "right"\}/);
  assert.match(terminalStyles, /\.remote-picker-paper\.is-center/);
  assert.match(terminalStyles, /@keyframes remote-picker-center-in/);
  assert.match(terminalStyles, /animation: remote-picker-center-in 360ms/);
  assert.match(terminalStyles, /\.remote-picker-paper \{[\s\S]*?\n  height: auto;/);
  assert.match(pickerSource, /overflow: compact \? "auto" : "hidden"/);
});

test("remote workspace chrome uses MUI instead of Radix Themes", () => {
  const files = [
    "src/pages/terminal/index.tsx",
    "src/pages/terminal/RemoteSession.tsx",
    "src/pages/terminal/FileManager.tsx",
    "src/pages/terminal/CommandClipboard.tsx",
    "src/components/remote/RemoteNodePicker.tsx",
  ];
  for (const file of files) {
    const source = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
    assert.doesNotMatch(source, /from "@radix-ui\/themes"/, `${file} should not import Radix Themes`);
  }
  const main = readFileSync(new URL("../src/main.tsx", import.meta.url), "utf8");
  assert.match(main, /isRemoteRoute/);
  assert.match(main, /usePlainThemeRoot/);
  assert.match(main, /isAdminRoute \|\| isRemoteRoute/);
});
