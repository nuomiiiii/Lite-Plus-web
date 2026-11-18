import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import IconButton from "@mui/material/IconButton";
import MenuItem from "@mui/material/MenuItem";
import Skeleton from "@mui/material/Skeleton";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import StarOutline from "@mui/icons-material/StarBorder";
import Star from "@mui/icons-material/Star";
import { toast } from "sonner";
import {
  AdminListFiltersBar,
  AdminListSearch,
  AdminListSelect,
  AdminListShell,
} from "@/components/admin/AdminListShell";
import { AdminMobileCardStack, AdminMobileListCard } from "@/components/admin/AdminMobileListCard";
import SettingsSheetDialog, { SettingsSheetActions } from "@/components/admin/SettingsSheetDialog";
import { SettingsAlert, settingsFieldSx } from "@/components/admin/SettingsChrome";
import { Copy, Download, Eye, LinkIcon, Pencil, Plus, Trash, Upload } from "@/components/admin/muiIcons";
import { useRPC2Call } from "@/contexts/RPC2Context";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { nodemgtErrorMessage, nodemgtWarningMessage } from "./inboundToOutbound";
import { emptyNodemgtTemplates, hasNodemgtTemplates, type NodemgtTemplateList } from "./prefetch";
import { TEMPLATE_CLIENTS } from "./subscriptionClients";

type Template = { id: string; name: string; kind: string; content: string; revision?: number };
type Row = { id: string; name?: string; username?: string; user_id?: string };
type TemplateList = NodemgtTemplateList;
type Preview = { body: string; warnings: string[] };

const kinds = ["clash", "surge", "loon", "sing-box"];
const kindOf = (client: string) => ["mihomo", "clash", "stash"].includes(client) ? "clash" : client === "surge-mac" ? "surge" : client;
const kindLabel = (kind: string) => ({ clash: "Clash", loon: "Loon", surge: "Surge", "sing-box": "sing-box" })[kind] || kind;
const extension = (kind: string) => ({ clash: "yaml", loon: "lcf", surge: "conf", "sing-box": "json" })[kind] || "txt";
const rowLabel = (row: Row) => row.name || row.username || row.user_id || row.id;
const clientLabel = (client: string) => ({ mihomo: "Mihomo / Clash Meta", clash: "Clash", stash: "Stash", loon: "Loon", surge: "Surge iOS", "surge-mac": "Surge macOS", "sing-box": "sing-box" })[client] || client;
const draftKey = (value: Template) => JSON.stringify([value.name, value.kind, value.content]);
const codeSx = {
  m: 0,
  p: 1.5,
  minHeight: 220,
  maxHeight: "40vh",
  overflow: "auto",
  bgcolor: "action.hover",
  borderRadius: "8px",
  fontSize: 12,
  lineHeight: 1.7,
  whiteSpace: "pre-wrap",
  overflowWrap: "anywhere",
} as const;

function filename(template: Template) {
  return /\.(yaml|yml|lcf|conf|json)$/i.test(template.name) ? template.name : `${template.name || "template"}.${extension(template.kind)}`;
}

function download(content: string, name: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "text/plain;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name.replace(/[\\/:*?"<>|]/g, "_");
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function RowActions({ children }: { children: ReactNode }) {
  return (
    <Stack
      direction="row"
      spacing={0.25}
      useFlexGap
      sx={{
        alignItems: "center",
        flexWrap: { xs: "wrap", md: "nowrap" },
        flexShrink: 0,
        whiteSpace: "nowrap",
      }}
      onClick={(event) => event.stopPropagation()}
    >
      {children}
    </Stack>
  );
}

export default function SubscriptionTemplates({
  subs,
  plans,
  initial,
  onChange,
}: {
  subs: Row[];
  plans: Row[];
  initial?: TemplateList;
  onChange?: (next: TemplateList) => void;
}) {
  const { t } = useTranslation();
  const { call } = useRPC2Call();
  const [data, setData] = useState<TemplateList>(() => initial ?? emptyNodemgtTemplates());
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState<Template>({ id: "", name: "", kind: "clash", content: "" });
  const [dialog, setDialog] = useState<"create" | "edit" | "preview" | "bindings" | null>(null);
  const [createKind, setCreateKind] = useState("clash");
  const [draftBaseline, setDraftBaseline] = useState("");
  const [discardAction, setDiscardAction] = useState<(() => void) | null>(null);
  const [defaultTarget, setDefaultTarget] = useState<Template | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Template | null>(null);
  const [loading, setLoading] = useState(() => !hasNodemgtTemplates(initial));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [scope, setScope] = useState("plan");
  const [scopeID, setScopeID] = useState("");
  const [assignmentTemplate, setAssignmentTemplate] = useState<Template | null>(null);
  const [assignmentClients, setAssignmentClients] = useState<string[]>([]);
  const [subscriptionID, setSubscriptionID] = useState("");
  const [previewClient, setPreviewClient] = useState("mihomo");
  const [preview, setPreview] = useState<Preview | null>(null);

  const applyList = useCallback((next: TemplateList) => {
    setData(next);
    onChange?.(next);
    return next;
  }, [onChange]);
  const reload = useCallback(async () => {
    try {
      const next = await call("admin:nodemgt.template.list", {}) as TemplateList;
      return applyList(next);
    } finally {
      setLoading(false);
    }
  }, [applyList, call]);
  useEffect(() => {
    if (hasNodemgtTemplates(initial)) {
      setData(initial!);
      setLoading(false);
      return;
    }
    setLoading(true);
    void reload().catch((err: unknown) => setError(nodemgtErrorMessage(err, t)));
  }, [initial, reload, t]);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (err) {
      setError(nodemgtErrorMessage(err, t));
    } finally {
      setBusy(false);
    }
  };
  const fetchPreview = async (template: Template, subID: string, target: string) => {
    setPreview(null);
    const result = await call("admin:nodemgt.template.preview", { subscription_id: subID, target, template }) as Preview;
    setPreview(result);
  };
  const openTemplate = (value: Template, mode: "edit" | "preview", copy = false) => {
    const next = { ...value, id: copy ? "" : value.id };
    const target = value.kind === "clash" ? "mihomo" : value.kind;
    const subID = subs.some((row) => row.id === subscriptionID) ? subscriptionID : subs[0]?.id || "";
    setDraft(next);
    setDraftBaseline(draftKey(next));
    setPreviewClient(target);
    setSubscriptionID(subID);
    setPreview(null);
    setError("");
    setDialog(mode);
    if (mode === "preview" && subID) void run(() => fetchPreview(next, subID, target));
  };
  const updateDraft = (next: Template) => {
    setDraft(next);
    setPreview(null);
  };
  const importFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > 1024 * 1024) {
      setError(t("nodemgt.tpl_file_limit"));
      return;
    }
    void run(async () => {
      const ext = file.name.split(".").pop()?.toLowerCase();
      const kind = ext === "lcf" ? "loon" : ext === "conf" ? "surge" : ext === "json" ? "sing-box" : "clash";
      openTemplate({ id: "", name: file.name, kind, content: await file.text() }, "edit");
    });
  };
  const bindingsByTemplateId = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const binding of data.bindings) {
      const tid = String(binding.template_id || "");
      if (!tid) continue;
      const list = map.get(tid);
      if (list) list.push(binding);
      else map.set(tid, [binding]);
    }
    return map;
  }, [data.bindings]);
  const planById = useMemo(() => new Map(plans.map((item) => [item.id, item])), [plans]);
  const subById = useMemo(() => new Map(subs.map((item) => [item.id, item])), [subs]);
  const isDefault = useCallback(
    (template: Template) => {
      const bound = bindingsByTemplateId.get(template.id) || [];
      return TEMPLATE_CLIENTS.filter((value) => kindOf(value) === template.kind).every((value) =>
        bound.some((b) => b.scope === "global" && !b.scope_id && b.client === value),
      );
    },
    [bindingsByTemplateId],
  );
  const setDefault = (template: Template) => void run(async () => {
    const templateID = isDefault(template) ? "" : template.id;
    try {
      for (const target of TEMPLATE_CLIENTS.filter((value) => kindOf(value) === template.kind)) {
        await call("admin:nodemgt.template.bind", { scope: "global", scope_id: "", client: target, template_id: templateID });
      }
    } finally {
      await reload();
    }
    toast.success(t("nodemgt.saved"));
    setDefaultTarget(null);
  });
  const currentBinding = (client: string) => data.bindings.find((b) => b.scope === scope && b.scope_id === scopeID && b.client === client)?.template_id || "";
  const scopes = scope === "plan" ? plans : subs;
  const bindingReady = Boolean(scopeID) && assignmentClients.length > 0;
  const rows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return data.templates.filter((row) => {
      if (filter !== "all" && row.kind !== filter) return false;
      if (query && !row.name.toLowerCase().includes(query)) return false;
      return true;
    });
  }, [data.templates, filter, search]);
  const confirmDiscard = (action: () => void) => {
    if (dialog === "edit" && draftKey(draft) !== draftBaseline) setDiscardAction(() => action);
    else action();
  };
  const closeDialog = () => {
    if (!busy) confirmDiscard(() => {
      setDialog(null);
      setError("");
      setPreview(null);
    });
  };
  const openBindings = (template: Template, nextScope = "plan", nextID = "", clients?: string[]) => {
    setAssignmentTemplate(template);
    setScope(nextScope);
    setScopeID(nextID);
    setAssignmentClients(clients || TEMPLATE_CLIENTS.filter((client) => kindOf(client) === template.kind));
    setError("");
    setDialog("bindings");
  };
  const inheritedTemplate = (client: string) => {
    if (scope === "subscription") return t("nodemgt.tpl_follow_plan");
    const global = data.bindings.find((b) => b.scope === "global" && !b.scope_id && b.client === client);
    const name = data.templates.find((row) => row.id === global?.template_id)?.name || t("nodemgt.tpl_base_config");
    return t("nodemgt.tpl_follow_global", { name });
  };
  const applyAssignment = (templateID: string) => void run(async () => {
    try {
      for (const client of assignmentClients) {
        await call("admin:nodemgt.template.bind", { scope, scope_id: scopeID, client, template_id: templateID });
      }
    } finally {
      await reload();
    }
    setDialog(null);
    toast.success(t("nodemgt.saved"));
  });

  const startCreate = (kind: string) => {
    setCreateKind(kind);
    setError("");
    setDialog("create");
  };

  const rowActions = (row: Template) => {
    const bound = (bindingsByTemplateId.get(row.id)?.length ?? 0) > 0;
    const active = isDefault(row);
    return (
      <RowActions>
        <Tooltip title={t(active ? "nodemgt.tpl_unset_default" : "nodemgt.tpl_set_default")}>
          <span>
            <IconButton size="small" aria-label={t(active ? "nodemgt.tpl_unset_default" : "nodemgt.tpl_set_default")} disabled={busy} onClick={() => { setError(""); setDefaultTarget(row); }} color={active ? "primary" : "default"}>
              {active ? <Star fontSize="small" /> : <StarOutline fontSize="small" />}
            </IconButton>
          </span>
        </Tooltip>
        <IconButton size="small" aria-label={t("nodemgt.edit")} disabled={busy} onClick={() => openTemplate(row, "edit")}>
          <Pencil size={16} />
        </IconButton>
        <IconButton size="small" aria-label={t("nodemgt.tpl_preview")} disabled={busy} onClick={() => openTemplate(row, "preview")}>
          <Eye size={16} />
        </IconButton>
        <IconButton size="small" aria-label={t("nodemgt.tpl_apply_to")} disabled={busy} onClick={() => openBindings(row)}>
          <LinkIcon size={16} />
        </IconButton>
        <Tooltip title={t(bound ? "nodemgt.tpl_bound_delete" : "nodemgt.delete")}>
          <span>
            <IconButton size="small" color="error" aria-label={t("nodemgt.delete")} disabled={busy || bound} onClick={() => { setError(""); setDeleteTarget(row); }}>
              <Trash size={16} />
            </IconButton>
          </span>
        </Tooltip>
      </RowActions>
    );
  };

  const previewControls = (
    <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
      <TextField select size="small" label={t("nodemgt.tpl_preview_user")} value={subscriptionID} sx={settingsFieldSx} disabled={busy} onChange={(e) => { setSubscriptionID(e.target.value); setPreview(null); }}>
        <MenuItem value="">{t("nodemgt.tpl_choose")}</MenuItem>
        {subs.map((row) => <MenuItem key={row.id} value={row.id}>{rowLabel(row)}</MenuItem>)}
      </TextField>
      <TextField select size="small" label={t("nodemgt.tpl_client")} value={previewClient} sx={settingsFieldSx} disabled={busy} onChange={(e) => { setPreviewClient(e.target.value); setPreview(null); }}>
        {TEMPLATE_CLIENTS.filter((value) => kindOf(value) === draft.kind).map((value) => <MenuItem key={value} value={value}>{clientLabel(value)}</MenuItem>)}
      </TextField>
    </Stack>
  );
  const previewResult = (
    <Stack spacing={1.5} sx={{ minWidth: 0 }}>
      <Typography sx={{ fontWeight: 600, fontSize: 13.5 }}>{t("nodemgt.tpl_preview_result")}</Typography>
      {previewControls}
      <Box>
        <Button variant="outlined" disabled={busy || !subscriptionID || !draft.content} onClick={() => void run(() => fetchPreview(draft, subscriptionID, previewClient))}>
          {t(preview ? "nodemgt.tpl_refresh_preview" : "nodemgt.tpl_generate_preview")}
        </Button>
      </Box>
      {preview?.warnings?.map((warning, i) => <SettingsAlert key={i} severity="warning">{nodemgtWarningMessage(warning, t)}</SettingsAlert>)}
      {preview ? (
        <Box component="pre" sx={codeSx}>{preview.body}</Box>
      ) : (
        <Box sx={{ ...codeSx, display: "grid", placeItems: "center", color: "text.secondary", textAlign: "center", fontFamily: "inherit" }}>
          {busy ? t("nodemgt.tpl_generating") : t(subs.length ? "nodemgt.tpl_preview_hint" : "nodemgt.tpl_no_subscriptions")}
        </Box>
      )}
    </Stack>
  );

  return (
    <>
      <AdminListShell>
        <AdminListFiltersBar>
          <Stack direction="row" spacing={1.5} useFlexGap sx={{ flexWrap: { xs: "wrap", md: "nowrap" }, alignItems: "center" }}>
            <AdminListSelect label={t("nodemgt.tpl_kind")} value={filter} onChange={setFilter}>
              <MenuItem value="all">{t("nodemgt.tpl_all")}</MenuItem>
              {kinds.map((kind) => <MenuItem key={kind} value={kind}>{kindLabel(kind)}</MenuItem>)}
            </AdminListSelect>
            <AdminListSearch value={search} onChange={setSearch} placeholder={t("nodemgt.search")} />
            <Stack direction="row" spacing={1} sx={{ ml: { md: "auto" } }}>
              <Button component="label" variant="outlined" disabled={busy || loading} startIcon={<Upload size={16} />}>
                {t("nodemgt.tpl_upload")}
                <input hidden type="file" accept=".yaml,.yml,.lcf,.conf,.json" onChange={importFile} />
              </Button>
              <Button variant="contained" disabled={busy || loading || !data.builtins.length} startIcon={<Plus size={16} />} onClick={() => startCreate(filter === "all" ? "clash" : filter)}>
                {t("nodemgt.tpl_new")}
              </Button>
            </Stack>
          </Stack>
        </AdminListFiltersBar>

        {error && !dialog && !deleteTarget && !defaultTarget ? (
          <SettingsAlert severity="error">{error}</SettingsAlert>
        ) : null}

        {loading && !rows.length ? (
          <Stack spacing={1.25} sx={{ p: { xs: 1.25, md: 0 } }}>
            {Array.from({ length: 3 }, (_, index) => <Skeleton key={index} variant="rounded" height={52} />)}
          </Stack>
        ) : !rows.length ? (
          <Box className="km-admin-list-empty">{t("nodemgt.tpl_empty")}</Box>
        ) : (
          <>
            <Box className="admin-responsive-table-wrap overflow-x-auto" sx={{ display: { xs: "none", md: "block" } }}>
              <Table container={false} className="admin-responsive-table w-full">
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("nodemgt.tpl_name")}</TableHead>
                    <TableHead>{t("nodemgt.tpl_kind")}</TableHead>
                    <TableHead>{t("nodemgt.col_actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => {
                    const active = isDefault(row);
                    const templateBindings = bindingsByTemplateId.get(row.id) || [];
                    const defaults = templateBindings.filter((b) => b.scope === "global" && !b.scope_id).map((b) => b.client);
                    const locations = templateBindings.filter((b) => b.scope !== "global")
                      .filter((b, i, all) => all.findIndex((item) => item.scope === b.scope && item.scope_id === b.scope_id) === i);
                    return (
                      <TableRow key={row.id}>
                        <TableCell className="whitespace-normal">
                          <Stack spacing={0.75} sx={{ py: 0.5 }}>
                            <Typography sx={{ fontSize: 13.5, fontWeight: 500, overflowWrap: "anywhere" }}>{row.name}</Typography>
                            {defaults.length ? (
                              <Typography color="text.secondary" sx={{ fontSize: 12 }}>
                                {t(active ? "nodemgt.tpl_is_default" : "nodemgt.tpl_partial_default")} · {defaults.map(clientLabel).join(", ")}
                              </Typography>
                            ) : null}
                            {locations.length ? (
                              <Stack direction="row" useFlexGap sx={{ gap: 0.75, flexWrap: "wrap" }}>
                                {locations.map((binding) => {
                                  const source = (binding.scope === "plan" ? planById : subById).get(binding.scope_id);
                                  const clients = templateBindings.filter((b) => b.scope === binding.scope && b.scope_id === binding.scope_id).map((b) => b.client);
                                  return (
                                    <Button key={`${binding.scope}/${binding.scope_id}`} size="small" onClick={() => openBindings(row, binding.scope, binding.scope_id, clients)}>
                                      {t(binding.scope === "plan" ? "nodemgt.tpl_to_plan" : "nodemgt.tpl_to_user")} · {source ? rowLabel(source) : binding.scope_id}
                                    </Button>
                                  );
                                })}
                              </Stack>
                            ) : null}
                          </Stack>
                        </TableCell>
                        <TableCell>{kindLabel(row.kind)}</TableCell>
                        <TableCell>{rowActions(row)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Box>
            <Box sx={{ display: { xs: "block", md: "none" } }}>
              <AdminMobileCardStack>
                {rows.map((row) => (
                  <AdminMobileListCard
                    key={row.id}
                    dense
                    title={row.name}
                    cells={[[t("nodemgt.tpl_kind"), kindLabel(row.kind)]]}
                    actions={rowActions(row)}
                  />
                ))}
              </AdminMobileCardStack>
            </Box>
          </>
        )}
      </AdminListShell>

      <SettingsSheetDialog
        open={dialog === "create"}
        onClose={closeDialog}
        disableClose={busy}
        maxWidth={560}
        title={t("nodemgt.tpl_new")}
        actions={<SettingsSheetActions onCancel={closeDialog} cancelLabel={t("cancel")} />}
      >
        <Typography color="text.secondary" sx={{ fontSize: 13 }}>{t("nodemgt.tpl_create_help")}</Typography>
        {error ? <SettingsAlert severity="error">{error}</SettingsAlert> : null}
        <TextField select size="small" label={t("nodemgt.tpl_kind")} value={createKind} disabled={busy} onChange={(e) => setCreateKind(e.target.value)} sx={settingsFieldSx}>
          {kinds.map((kind) => <MenuItem key={kind} value={kind}>{kindLabel(kind)}</MenuItem>)}
        </TextField>
        <Stack spacing={1.25} sx={{ pb: 1 }}>
          <Button variant="outlined" disabled={busy} sx={{ justifyContent: "flex-start", px: 1.75, py: 1.5, textAlign: "left" }} onClick={() => {
            const starter = data.builtins.find((row) => row.kind === createKind);
            if (starter) openTemplate({ ...starter, name: "" }, "edit", true);
          }}>
            <Box>
              <Typography sx={{ fontWeight: 600, fontSize: 13.5 }}>{t("nodemgt.tpl_start_base")}</Typography>
              <Typography color="text.secondary" sx={{ fontSize: 12 }}>{t("nodemgt.tpl_start_base_help")}</Typography>
            </Box>
          </Button>
          <Button component="label" variant="outlined" disabled={busy} sx={{ justifyContent: "flex-start", px: 1.75, py: 1.5, textAlign: "left" }}>
            <Box>
              <Typography sx={{ fontWeight: 600, fontSize: 13.5 }}>{t("nodemgt.tpl_upload")}</Typography>
              <Typography color="text.secondary" sx={{ fontSize: 12 }}>{t("nodemgt.tpl_import_help")}</Typography>
            </Box>
            <input hidden type="file" accept=".yaml,.yml,.lcf,.conf,.json" onChange={importFile} />
          </Button>
          <Button variant="outlined" disabled={busy} sx={{ justifyContent: "flex-start", px: 1.75, py: 1.5, textAlign: "left" }} onClick={() => openTemplate({ id: "", kind: createKind, name: "", content: "" }, "edit")}>
            <Box>
              <Typography sx={{ fontWeight: 600, fontSize: 13.5 }}>{t("nodemgt.tpl_paste")}</Typography>
              <Typography color="text.secondary" sx={{ fontSize: 12 }}>{t("nodemgt.tpl_paste_help")}</Typography>
            </Box>
          </Button>
        </Stack>
      </SettingsSheetDialog>

      <SettingsSheetDialog
        open={dialog === "edit" || dialog === "preview"}
        onClose={closeDialog}
        disableClose={busy}
        maxWidth={1240}
        title={dialog === "preview" ? `${t("nodemgt.tpl_preview")} · ${draft.name}` : draft.id ? `${t("nodemgt.edit")} · ${draft.name}` : t("nodemgt.tpl_new")}
        headerAction={dialog === "edit" ? (
          <Stack direction="row" spacing={0.5}>
            <IconButton size="small" aria-label={t("nodemgt.tpl_download")} disabled={!draft.content || busy} onClick={() => download(draft.content, filename(draft))}><Download size={18} /></IconButton>
            <IconButton size="small" aria-label={t("nodemgt.tpl_copy")} disabled={!draft.id || busy} onClick={() => updateDraft({ ...draft, id: "", name: t("nodemgt.tpl_copy_name", { name: draft.name }) })}><Copy size={18} /></IconButton>
          </Stack>
        ) : undefined}
        actions={
          <SettingsSheetActions
            onCancel={closeDialog}
            cancelLabel={t(dialog === "edit" ? "cancel" : "common.close")}
            onConfirm={dialog === "preview"
              ? (preview && !busy ? () => download(preview.body, `preview.${extension(draft.kind)}`) : undefined)
              : () => void run(async () => {
                await call("admin:nodemgt.template.upsert", { ...draft, id: draft.id || undefined });
                await reload();
                if (filter !== "all") setFilter(draft.kind);
                setDialog(null);
                setPreview(null);
                toast.success(t("nodemgt.saved"));
              })}
            confirmLabel={dialog === "preview" ? t("nodemgt.tpl_download_config") : t("nodemgt.tpl_save_template")}
            confirmDisabled={dialog === "preview" ? !preview || busy : busy || !draft.name.trim() || !draft.content.trim()}
          />
        }
      >
        {error ? <SettingsAlert severity="error">{error}</SettingsAlert> : null}
        {dialog === "edit" ? (
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ alignItems: { sm: "center" } }}>
            <TextField size="small" label={t("nodemgt.tpl_name")} placeholder={t("nodemgt.tpl_name_hint")} value={draft.name} disabled={busy} fullWidth sx={settingsFieldSx} onChange={(e) => updateDraft({ ...draft, name: e.target.value })} />
            <Typography color="text.secondary" sx={{ fontSize: 13, flexShrink: 0 }}>{kindLabel(draft.kind)}</Typography>
          </Stack>
        ) : (
          <Typography color="text.secondary" sx={{ fontSize: 13 }}>{t("nodemgt.tpl_compare_help")}</Typography>
        )}
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "minmax(0, 1fr)", md: "repeat(2, minmax(0, 1fr))" }, gap: 2.5, pb: 1 }}>
          <Stack spacing={1.5} sx={{ minWidth: 0 }}>
            <Typography sx={{ fontWeight: 600, fontSize: 13.5 }}>{t("nodemgt.tpl_content")}</Typography>
            {dialog === "edit" ? (
              <TextField
                multiline
                minRows={15}
                maxRows={19}
                fullWidth
                value={draft.content}
                disabled={busy}
                onChange={(e) => updateDraft({ ...draft, content: e.target.value })}
                slotProps={{ htmlInput: { "aria-label": t("nodemgt.tpl_content"), spellCheck: false, style: { fontFamily: "monospace", fontSize: 12, lineHeight: 1.7 } } }}
              />
            ) : (
              <Box component="pre" sx={codeSx}>{draft.content}</Box>
            )}
            {draft.kind === "sing-box" ? <Typography color="text.secondary" sx={{ fontSize: 12 }}>{t("nodemgt.tpl_marker_help")}</Typography> : null}
          </Stack>
          {previewResult}
        </Box>
      </SettingsSheetDialog>

      <SettingsSheetDialog
        open={dialog === "bindings"}
        onClose={closeDialog}
        disableClose={busy}
        maxWidth={720}
        title={t("nodemgt.tpl_apply_title", { name: assignmentTemplate?.name })}
        actions={
          <SettingsSheetActions
            onCancel={closeDialog}
            left={
              <Button disabled={busy || !bindingReady || !assignmentClients.some((client) => Boolean(currentBinding(client)))} onClick={() => applyAssignment("")}>
                {t("nodemgt.tpl_restore_default")}
              </Button>
            }
            onConfirm={() => assignmentTemplate && applyAssignment(assignmentTemplate.id)}
            confirmLabel={t("nodemgt.tpl_apply_template")}
            confirmDisabled={busy || !bindingReady || assignmentClients.every((client) => currentBinding(client) === assignmentTemplate?.id)}
          />
        }
      >
        <Typography color="text.secondary" sx={{ fontSize: 13 }}>{t("nodemgt.tpl_apply_help")}</Typography>
        {error ? <SettingsAlert severity="error">{error}</SettingsAlert> : null}
        <TextField select size="small" label={t("nodemgt.tpl_scope")} value={scope} disabled={busy} onChange={(e) => { setScope(e.target.value); setScopeID(""); setError(""); }} sx={settingsFieldSx}>
          <MenuItem value="plan">{t("nodemgt.tpl_to_plan")}</MenuItem>
          <MenuItem value="subscription">{t("nodemgt.tpl_to_user")}</MenuItem>
        </TextField>
        <TextField select size="small" label={t(scope === "plan" ? "nodemgt.tpl_choose_plan" : "nodemgt.tpl_choose_user")} value={scopeID} disabled={busy} onChange={(e) => { setScopeID(e.target.value); setError(""); }} sx={settingsFieldSx}>
          <MenuItem value="">{t("nodemgt.tpl_choose")}</MenuItem>
          {scopes.map((row) => <MenuItem key={row.id} value={row.id}>{rowLabel(row)}</MenuItem>)}
        </TextField>
        {!scopes.length ? <SettingsAlert>{t(scope === "plan" ? "nodemgt.tpl_no_plans" : "nodemgt.tpl_no_users")}</SettingsAlert> : null}
        <Box>
          <Typography sx={{ fontWeight: 600, fontSize: 13.5, mb: 0.5 }}>{t("nodemgt.tpl_affected_clients")}</Typography>
          <Stack direction="row" useFlexGap sx={{ flexWrap: "wrap", gap: 0.5 }}>
            {TEMPLATE_CLIENTS.filter((client) => kindOf(client) === assignmentTemplate?.kind).map((client) => (
              <FormControlLabel
                key={client}
                label={clientLabel(client)}
                control={<Checkbox size="small" disabled={busy} checked={assignmentClients.includes(client)} onChange={(_, checked) => setAssignmentClients(checked ? [...assignmentClients, client] : assignmentClients.filter((value) => value !== client))} />}
              />
            ))}
          </Stack>
        </Box>
        {scopeID ? (
          <Stack spacing={1} sx={{ pb: 1 }}>
            <Typography sx={{ fontWeight: 600, fontSize: 13.5 }}>{t("nodemgt.tpl_current_settings")}</Typography>
            {assignmentClients.map((client) => {
              const current = data.templates.find((row) => row.id === currentBinding(client));
              return (
                <Stack key={client} direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ p: 1.5, bgcolor: "action.hover", borderRadius: "8px", justifyContent: "space-between" }}>
                  <Typography sx={{ fontSize: 13.5 }}>{clientLabel(client)}</Typography>
                  <Typography color="text.secondary" sx={{ fontSize: 13.5 }}>{current?.name || inheritedTemplate(client)}</Typography>
                </Stack>
              );
            })}
            {bindingReady ? (
              <SettingsAlert severity={assignmentClients.every((client) => currentBinding(client) === assignmentTemplate?.id) ? "success" : undefined}>
                {t(assignmentClients.every((client) => currentBinding(client) === assignmentTemplate?.id) ? "nodemgt.tpl_already_applied" : "nodemgt.tpl_apply_summary", {
                  name: assignmentTemplate?.name,
                  target: rowLabel(scopes.find((row) => row.id === scopeID) || { id: scopeID }),
                  clients: assignmentClients.map(clientLabel).join(", "),
                })}
              </SettingsAlert>
            ) : null}
          </Stack>
        ) : null}
      </SettingsSheetDialog>

      <SettingsSheetDialog
        open={Boolean(defaultTarget)}
        onClose={() => { if (!busy) { setDefaultTarget(null); setError(""); } }}
        disableClose={busy}
        title={t(defaultTarget && isDefault(defaultTarget) ? "nodemgt.tpl_unset_default" : "nodemgt.tpl_set_default")}
        actions={
          <SettingsSheetActions
            onCancel={() => { setDefaultTarget(null); setError(""); }}
            onConfirm={() => defaultTarget && setDefault(defaultTarget)}
            confirmLabel={t(defaultTarget && isDefault(defaultTarget) ? "nodemgt.tpl_confirm_unset" : "nodemgt.tpl_confirm_default")}
            confirmDisabled={busy}
          />
        }
      >
        <Typography>{t(defaultTarget && isDefault(defaultTarget) ? "nodemgt.tpl_unset_summary" : "nodemgt.tpl_default_summary", { name: defaultTarget?.name, clients: TEMPLATE_CLIENTS.filter((client) => kindOf(client) === defaultTarget?.kind).map(clientLabel).join(", ") })}</Typography>
        <Typography color="text.secondary" sx={{ fontSize: 13, pb: 1 }}>{t(defaultTarget && isDefault(defaultTarget) ? "nodemgt.tpl_unset_help" : "nodemgt.tpl_default_help")}</Typography>
        {error ? <SettingsAlert severity="error">{error}</SettingsAlert> : null}
      </SettingsSheetDialog>

      <SettingsSheetDialog
        open={Boolean(discardAction)}
        onClose={() => setDiscardAction(null)}
        title={t("nodemgt.tpl_unsaved_title")}
        actions={
          <SettingsSheetActions
            onCancel={() => setDiscardAction(null)}
            cancelLabel={t("nodemgt.tpl_keep_editing")}
            onConfirm={() => { discardAction?.(); setDiscardAction(null); }}
            confirmLabel={t("nodemgt.tpl_discard")}
            confirmColor="error"
          />
        }
      >
        <Typography sx={{ pb: 1 }}>{t("nodemgt.tpl_unsaved_help")}</Typography>
      </SettingsSheetDialog>

      <SettingsSheetDialog
        open={Boolean(deleteTarget)}
        onClose={() => { if (!busy) { setDeleteTarget(null); setError(""); } }}
        disableClose={busy}
        title={t("nodemgt.delete")}
        actions={
          <SettingsSheetActions
            onCancel={() => { setDeleteTarget(null); setError(""); }}
            onConfirm={() => deleteTarget && void run(async () => {
              await call("admin:nodemgt.template.delete", { id: deleteTarget.id });
              await reload();
              setDeleteTarget(null);
            })}
            confirmLabel={t("nodemgt.delete")}
            confirmColor="error"
            confirmDisabled={busy}
          />
        }
      >
        <Typography sx={{ pb: 1 }}>{t("nodemgt.tpl_delete_confirm", { name: deleteTarget?.name })}</Typography>
        {error ? <SettingsAlert severity="error">{error}</SettingsAlert> : null}
      </SettingsSheetDialog>
    </>
  );
}
