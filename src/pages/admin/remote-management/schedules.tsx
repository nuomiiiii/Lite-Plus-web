import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router-dom";
import MuiButton from "@mui/material/Button";
import ChevronLeft from "@mui/icons-material/ChevronLeft";
import ChevronRight from "@mui/icons-material/ChevronRight";
import MuiTextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import { toast } from "sonner";
import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { AdminPagination, useAdminPagination } from "@/components/admin/AdminPagination";
import { AdminListSearch } from "@/components/admin/AdminListShell";
import AdminPageTitle from "@/components/admin/AdminPageTitle";
import { ADMIN_LIST_ACTION_SX } from "@/components/admin/adminListLayout";
import { RequireAllowRemoteManagement } from "@/components/admin/RemoteManagementGate";
import RemoteExecNodeSelector from "@/components/remote/RemoteExecNodeSelector";
import Loading from "@/components/loading";
import { AdminNodeLiveDataProvider } from "@/hooks/use-admin-node-live-data";
import { startVisibleInterval } from "@/hooks/useVisibleInterval";
import { NodeDetailsProvider, useNodeDetails, type NodeDetail } from "@/contexts/NodeDetailsContext";
import { CommandClipboardProvider } from "@/contexts/CommandClipboardContext";
import { useAccount } from "@/contexts/AccountContext";
import {
  AppDialogContent,
  Badge,
  Button,
  Card,
  Dialog,
  Flex,
  Select,
  Switch,
  Text,
  TextArea,
  TextField,
} from "@/components/admin/ui";
import { Clock, GripVertical } from "@/components/admin/muiIcons";
import { SavedExecCommands } from "@/pages/admin/execSavedCommands";
import { confirmAdminPasskey, passkeyUnavailableMessage } from "@/utils/webauthn";
import { localizeExecResult } from "@/utils/execResult";
import {
  clearStoredRemoteGrant,
  isRemoteGrantLive,
  loadStoredRemoteGrant,
  localizeRemoteError,
  saveStoredRemoteGrant,
} from "@/utils/remoteSession";
import { createRandomId } from "@/utils/randomId";

type ScheduleKind = "interval" | "daily" | "weekly" | "monthly";
type IntervalUnit = "minute" | "day";

type ScheduleRun = {
  id: string;
  task_id?: string;
  status: string;
  note?: string;
  sent: number;
  queued: number;
  offline: number;
  failed: number;
  started_at: string;
};

type Schedule = {
  id: string;
  name: string;
  command: string;
  clients: string[];
  enabled: boolean;
  disabled_reason?: string;
  kind: ScheduleKind;
  interval_minutes: number;
  time_of_day: string;
  weekday: number;
  weekdays?: number[];
  month_day?: number;
  last_run_at?: string | null;
  next_run_at?: string | null;
  last_run?: ScheduleRun | null;
};

type TaskResult = {
  client: string;
  result: string;
  exit_code: number | null;
  finished_at: string | null;
};

type FormState = {
  name: string;
  command: string;
  clients: string[];
  enabled: boolean;
  kind: ScheduleKind;
  intervalMinutes: string;
  intervalUnit: IntervalUnit;
  timeOfDay: string;
  weekdays: string[];
  monthDay: string;
};

const GRANT_SCOPE = "scheduled-exec";
const EMPTY_FORM: FormState = {
  name: "",
  command: "",
  clients: [],
  enabled: true,
  kind: "daily",
  intervalMinutes: "60",
  intervalUnit: "minute",
  timeOfDay: "03:00",
  weekdays: ["1"],
  monthDay: "1",
};

const scheduleErrorKeys: Record<string, string> = {
  "scheduled task name is required": "scheduled_exec.errors.name",
  "scheduled task name is too long": "scheduled_exec.errors.name_long",
  "invalid scheduled task": "scheduled_exec.errors.schedule",
  "scheduled task interval is invalid": "scheduled_exec.errors.interval",
  "scheduled task time is invalid": "scheduled_exec.errors.time",
  "scheduled task weekday is invalid": "scheduled_exec.errors.weekday",
  "scheduled task month day is invalid": "scheduled_exec.errors.month_day",
  "too many scheduled tasks": "scheduled_exec.errors.too_many",
  "too many scheduled task clients": "scheduled_exec.errors.too_many_clients",
  "unknown scheduled task client": "scheduled_exec.errors.unknown_client",
  "scheduled task not found": "scheduled_exec.errors.not_found",
  "scheduled task order is invalid": "scheduled_exec.errors.order",
};

const SCHEDULE_PREVIOUS_PAGE_DROP_ID = "scheduled-exec-previous-page";
const SCHEDULE_NEXT_PAGE_DROP_ID = "scheduled-exec-next-page";

function localizeScheduleError(message: string, t: (key: string) => string) {
  const remote = localizeRemoteError(message, t);
  if (remote && remote !== message) return remote;
  const key = scheduleErrorKeys[message];
  if (!key) return message;
  const translated = t(key);
  return translated && translated !== key ? translated : message;
}

async function readPayload(response: Response) {
  return response.json().catch(() => ({}));
}

function shanghaiClock(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

const SchedulesPage = () => (
  <RequireAllowRemoteManagement>
    <CommandClipboardProvider>
      <NodeDetailsProvider>
        <AdminNodeLiveDataProvider>
          <SchedulesContent />
        </AdminNodeLiveDataProvider>
      </NodeDetailsProvider>
    </CommandClipboardProvider>
  </RequireAllowRemoteManagement>
);

function SchedulesContent() {
  const { t } = useTranslation();
  const { scheduleId } = useParams();
  const navigate = useNavigate();
  const { account } = useAccount();
  const { nodeDetail, isLoading, error } = useNodeDetails();
  const [schedules, setSchedules] = useState<Schedule[] | null>(null);
  const [editing, setEditing] = useState<Schedule | "new" | null>(null);
  const [deleting, setDeleting] = useState<Schedule | null>(null);
  const [taskQuery, setTaskQuery] = useState("");
  const [busyId, setBusyId] = useState("");
  const [passkeyAvailable, setPasskeyAvailable] = useState(false);
  const [hasGrant, setHasGrant] = useState(() => Boolean(loadStoredRemoteGrant(GRANT_SCOPE)));
  const grantRef = useRef("");
  const grantExpiresAtRef = useRef(0);
  const pageIDRef = useRef(loadStoredRemoteGrant(GRANT_SCOPE)?.pageID || createRandomId());
  const twoFaEnabled = Boolean(account?.["2fa_enabled"]);

  const clearGrant = useCallback(() => {
    grantRef.current = "";
    grantExpiresAtRef.current = 0;
    clearStoredRemoteGrant(GRANT_SCOPE);
    setHasGrant(false);
  }, []);

  const rememberGrant = useCallback((grant?: string, expiresAt?: string) => {
    if (!grant) {
      clearGrant();
      return;
    }
    const expires = Date.parse(String(expiresAt ?? ""));
    grantRef.current = grant;
    grantExpiresAtRef.current = Number.isFinite(expires) ? expires : 0;
    saveStoredRemoteGrant(GRANT_SCOPE, grant, grantExpiresAtRef.current, pageIDRef.current);
    setHasGrant(true);
  }, [clearGrant]);

  useEffect(() => {
    const stored = loadStoredRemoteGrant(GRANT_SCOPE);
    if (!stored) return;
    grantRef.current = stored.grant;
    grantExpiresAtRef.current = stored.expiresAt;
    if (stored.pageID) pageIDRef.current = stored.pageID;
    setHasGrant(true);
  }, []);

  useEffect(() => {
    if (!hasGrant || !grantExpiresAtRef.current) return;
    return startVisibleInterval(() => {
      if (isRemoteGrantLive(grantRef.current, grantExpiresAtRef.current)) return;
      clearGrant();
    }, 1000);
  }, [clearGrant, hasGrant]);

  useEffect(() => {
    fetch("/api/admin/account/passkeys")
      .then((response) => response.json())
      .then((body) => {
        const items = Array.isArray(body?.data) ? body.data : Array.isArray(body) ? body : [];
        setPasskeyAvailable(items.length > 0);
      })
      .catch(() => setPasskeyAvailable(false));
  }, []);

  const reload = useCallback(async () => {
    const response = await fetch("/api/admin/scheduled-exec");
    const payload = await readPayload(response);
    if (!response.ok) {
      throw new Error(payload?.message || `HTTP ${response.status}`);
    }
    const rows = payload?.data?.schedules;
    setSchedules(Array.isArray(rows) ? rows : []);
  }, []);

  useEffect(() => {
    void reload().catch((err) => {
      const message = err instanceof Error ? err.message : t("common.error");
      toast.error(localizeScheduleError(message, t));
      setSchedules([]);
    });
  }, [reload, t]);

  const names = useMemo(() => {
    const map = new Map<string, string>();
    for (const node of nodeDetail) map.set(node.uuid, node.name || node.uuid);
    return map;
  }, [nodeDetail]);

  const filteredSchedules = useMemo(() => {
    const query = taskQuery.trim().toLowerCase();
    const rows = schedules ?? [];
    if (!query) return rows;
    return rows.filter((item) => item.name.toLowerCase().includes(query));
  }, [schedules, taskQuery]);
  const taskPager = useAdminPagination(filteredSchedules);
  const reorderEnabled = taskQuery.trim() === "";
  const [orderDragging, setOrderDragging] = useState(false);
  const orderSensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor, {}),
  );
  useEffect(() => {
    taskPager.setPage(1);
  }, [taskQuery, taskPager.setPage]);

  const reorderSchedules = async (event: DragEndEvent) => {
    setOrderDragging(false);
    if (!schedules || !reorderEnabled) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = schedules.findIndex((item) => item.id === active.id);
    let newIndex = schedules.findIndex((item) => item.id === over.id);
    let destinationPage = taskPager.page;
    const pageCount = Math.max(1, Math.ceil(schedules.length / taskPager.pageSize));
    if (over.id === SCHEDULE_PREVIOUS_PAGE_DROP_ID && taskPager.page > 1) {
      destinationPage = taskPager.page - 1;
      newIndex = destinationPage * taskPager.pageSize - 1;
    } else if (over.id === SCHEDULE_NEXT_PAGE_DROP_ID && taskPager.page < pageCount) {
      destinationPage = taskPager.page + 1;
      newIndex = (destinationPage - 1) * taskPager.pageSize;
    }
    if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return;
    newIndex = Math.max(0, Math.min(newIndex, schedules.length - 1));
    const next = arrayMove(schedules, oldIndex, newIndex);
    const previous = schedules;
    setSchedules(next);
    taskPager.setPage(destinationPage);
    try {
      const response = await fetch("/api/admin/scheduled-exec/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ ids: next.map((item) => item.id) }),
      });
      const payload = await readPayload(response);
      if (!response.ok) {
        throw new Error(payload?.message || `HTTP ${response.status}`);
      }
    } catch (error) {
      setSchedules(previous);
      toast.error(localizeScheduleError(error instanceof Error ? error.message : "", t) || t("scheduled_exec.reorder_failed"));
      void reload();
    }
  };

  const authorize = async (password: string, otp: string, usePasskey: boolean) => {
    if (isRemoteGrantLive(grantRef.current, grantExpiresAtRef.current)) {
      const grant = grantRef.current;
      grantRef.current = "";
      setHasGrant(false);
      return grant;
    }
    let ceremony_id: string | undefined;
    let credential: unknown;
    if (usePasskey) {
      const assertion = await confirmAdminPasskey();
      ceremony_id = assertion.ceremony_id;
      credential = assertion.credential;
    }
    const response = await fetch("/api/admin/client/remote/authorize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({
        scope: "exec",
        page_id: pageIDRef.current,
        password: usePasskey || twoFaEnabled ? undefined : password || undefined,
        otp: usePasskey || !twoFaEnabled ? undefined : otp,
        ceremony_id,
        credential,
      }),
    });
    const payload = await readPayload(response);
    if (!response.ok) {
      throw new Error(payload?.message || `HTTP ${response.status}`);
    }
    const grant = payload?.data?.grant;
    if (typeof grant !== "string" || !grant) {
      throw new Error(t("terminal.session.auth_failed"));
    }
    return grant;
  };

  const postJSON = async (path: string, method: string, body: Record<string, unknown>) => {
    const response = await fetch(path, {
      method,
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(body),
    });
    const payload = await readPayload(response);
    if (!response.ok) {
      clearGrant();
      throw new Error(payload?.message || `HTTP ${response.status}`);
    }
    rememberGrant(payload?.data?.next_grant, payload?.data?.expires_at);
    return payload?.data ?? {};
  };

  const save = async (form: FormState, password: string, otp: string, usePasskey: boolean) => {
    const grant = await authorize(password, otp, usePasskey);
    const body = {
      name: form.name,
      command: form.command,
      clients: form.clients,
      enabled: form.enabled,
      kind: form.kind,
      interval_minutes: form.intervalUnit === "day" ? Number(form.intervalMinutes) * 1440 : Number(form.intervalMinutes),
      time_of_day: form.timeOfDay,
      weekday: Number(form.weekdays[0] ?? 1),
      weekdays: form.weekdays.map((day) => Number(day)),
      month_day: Number(form.monthDay),
      grant,
      page_id: pageIDRef.current,
    };
    if (editing && editing !== "new") {
      await postJSON(`/api/admin/scheduled-exec/${editing.id}`, "PUT", body);
    } else {
      await postJSON("/api/admin/scheduled-exec", "POST", body);
    }
    toast.success(t("scheduled_exec.saved"));
    setEditing(null);
    await reload();
  };

  const runNow = async (schedule: Schedule, password = "", otp = "", usePasskey = false) => {
    setBusyId(schedule.id);
    try {
      const grant = await authorize(password, otp, usePasskey);
      await postJSON(`/api/admin/scheduled-exec/${schedule.id}/run`, "POST", {
        grant,
        page_id: pageIDRef.current,
      });
      toast.success(t("scheduled_exec.started"));
      await reload();
    } catch (err) {
      toast.error(actionError(err, t));
    } finally {
      setBusyId("");
    }
  };

  const setEnabled = async (schedule: Schedule, enabled: boolean, password = "", otp = "", usePasskey = false) => {
    setBusyId(schedule.id);
    try {
      const body: Record<string, unknown> = { enabled };
      if (enabled) {
        body.grant = await authorize(password, otp, usePasskey);
        body.page_id = pageIDRef.current;
      }
      await postJSON(`/api/admin/scheduled-exec/${schedule.id}/enabled`, "POST", body);
      toast.success(t(enabled ? "scheduled_exec.enabled_toast" : "scheduled_exec.disabled_toast"));
      await reload();
    } catch (err) {
      toast.error(actionError(err, t));
    } finally {
      setBusyId("");
    }
  };

  const remove = async (schedule: Schedule) => {
    setBusyId(schedule.id);
    try {
      const response = await fetch(`/api/admin/scheduled-exec/${schedule.id}`, { method: "DELETE" });
      const payload = await readPayload(response);
      if (!response.ok) throw new Error(payload?.message || `HTTP ${response.status}`);
      toast.success(t("scheduled_exec.deleted"));
      setDeleting(null);
      if (scheduleId === schedule.id) navigate("/admin/remote-management/schedules");
      await reload();
    } catch (err) {
      toast.error(actionError(err, t));
    } finally {
      setBusyId("");
    }
  };

  if (isLoading || schedules === null) return <Loading />;
  if (error) return <div className="text-red-500">{error}</div>;

  const opened = scheduleId ? schedules.find((item) => item.id === scheduleId) ?? null : null;
  const cardProps = (schedule: Schedule) => ({
    schedule,
    names,
    busy: busyId === schedule.id,
    hasGrant,
    twoFaEnabled,
    passkeyAvailable,
    onEdit: () => setEditing(schedule),
    onDelete: () => setDeleting(schedule),
    onRun: (password: string, otp: string, usePasskey: boolean) => void runNow(schedule, password, otp, usePasskey),
    onEnabled: (enabled: boolean, password: string, otp: string, usePasskey: boolean) => void setEnabled(schedule, enabled, password, otp, usePasskey),
  });

  return (
    <div className="flex flex-col gap-4 p-0 md:p-4" data-testid="admin-scheduled-exec-page">
      {scheduleId ? (
        <>
          <MuiButton
            component={Link}
            to="/admin/remote-management/schedules"
            className="km-admin-back-button"
            startIcon={<ChevronLeft sx={{ fontSize: 18 }} />}
            sx={{
              alignSelf: "flex-start",
              px: 0,
              minWidth: 0,
              minHeight: 22,
              color: "text.secondary",
              textTransform: "none",
              fontWeight: 400,
              fontSize: 16,
              "&:hover": { bgcolor: "transparent", color: "text.primary" },
            }}
          >
            {t("scheduled_exec.back_to_list")}
          </MuiButton>
          {opened ? (
            <>
              <ScheduleCard {...cardProps(opened)} />
              <ScheduleRuns schedule={opened} names={names} />
            </>
          ) : (
            <Text color="gray">{t("scheduled_exec.errors.not_found")}</Text>
          )}
        </>
      ) : (
        <>
          <Flex justify="between" align="start" gap="3" wrap="wrap">
            <AdminPageTitle description={t("scheduled_exec.description")}>
              {t("scheduled_exec.title")}
            </AdminPageTitle>
            <MuiButton
              variant="contained"
              data-testid="scheduled-exec-create"
              sx={ADMIN_LIST_ACTION_SX}
              onClick={() => setEditing("new")}
            >
              {t("scheduled_exec.create")}
            </MuiButton>
          </Flex>

          {schedules.length > 0 ? (
            <div className="flex max-w-xl">
              <AdminListSearch
                value={taskQuery}
                onChange={setTaskQuery}
                placeholder={t("scheduled_exec.search")}
              />
            </div>
          ) : null}

          {schedules.length === 0 ? (
            <Card className="p-6">
              <Text as="div" weight="medium">{t("scheduled_exec.empty")}</Text>
              <Text as="div" size="2" color="gray" className="mt-1">{t("scheduled_exec.empty_hint")}</Text>
            </Card>
          ) : filteredSchedules.length === 0 ? (
            <Text color="gray">{t("scheduled_exec.search_empty")}</Text>
          ) : (
            <DndContext
              sensors={orderSensors}
              collisionDetection={closestCenter}
              onDragStart={() => setOrderDragging(true)}
              onDragCancel={() => setOrderDragging(false)}
              onDragEnd={(event) => void reorderSchedules(event)}
            >
              <SortableContext
                items={taskPager.pageItems.map((schedule) => schedule.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-3">
                  {taskPager.pageItems.map((schedule) => (
                    <DraggableScheduleCard
                      key={schedule.id}
                      reorderEnabled={reorderEnabled}
                      {...cardProps(schedule)}
                      onOpen={() => navigate(`/admin/remote-management/schedules/${schedule.id}`)}
                    />
                  ))}
                </div>
              </SortableContext>
              <AdminPagination
                hideDivider
                showSummary={false}
                dragging={orderDragging}
                previousDropId={reorderEnabled ? SCHEDULE_PREVIOUS_PAGE_DROP_ID : undefined}
                nextDropId={reorderEnabled ? SCHEDULE_NEXT_PAGE_DROP_ID : undefined}
                page={taskPager.page}
                total={filteredSchedules.length}
                pageSize={taskPager.pageSize}
                onPageChange={taskPager.setPage}
                onPageSizeChange={taskPager.setPageSize}
              />
            </DndContext>
          )}
        </>
      )}

      <ScheduleDialog
        open={editing !== null}
        schedule={editing && editing !== "new" ? editing : null}
        nodes={nodeDetail}
        hasGrant={hasGrant}
        twoFaEnabled={twoFaEnabled}
        passkeyAvailable={passkeyAvailable}
        onClose={() => setEditing(null)}
        onSave={save}
      />
      <AppDialogContentHolder
        open={deleting !== null}
        title={t("scheduled_exec.delete_title")}
        description={t("scheduled_exec.delete_body")}
        onClose={() => setDeleting(null)}
      >
        <Flex justify="end" gap="2" className="mt-4">
          <Button variant="soft" onClick={() => setDeleting(null)}>{t("scheduled_exec.cancel")}</Button>
          <MuiButton
            color="error"
            variant="contained"
            disableElevation
            disabled={!deleting || busyId === deleting.id}
            onClick={() => deleting && void remove(deleting)}
            sx={{ textTransform: "none", borderRadius: "8px", fontWeight: 600 }}
          >
            {t("scheduled_exec.delete")}
          </MuiButton>
        </Flex>
      </AppDialogContentHolder>
    </div>
  );
}

function actionError(err: unknown, t: (key: string) => string) {
  const code = passkeyUnavailableMessage(err, "");
  if (code === "cancelled") return t("account.passkey_cancelled");
  const message = err instanceof Error ? err.message : t("common.error");
  return localizeScheduleError(message, t);
}

function FittingServerNames({ items }: { items: { id: string; name: string }[] }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [visibleCount, setVisibleCount] = useState(items.length);
  const itemKey = items.map((item) => `${item.id}\0${item.name}`).join("\n");

  useLayoutEffect(() => {
    const box = boxRef.current;
    const measure = measureRef.current;
    if (!box || !measure) return;
    const fit = () => {
      const max = box.clientWidth;
      const nameNodes = Array.from(measure.querySelectorAll<HTMLElement>("[data-name-badge]"));
      if (max <= 0 || nameNodes.length === 0) {
        setVisibleCount(nameNodes.length);
        return;
      }
      const gap = Number.parseFloat(getComputedStyle(measure).columnGap) || 4;
      const widths = nameNodes.map((node) => node.offsetWidth);
      const plusWidth = (hidden: number) => measure.querySelector<HTMLElement>(`[data-plus-badge="${hidden}"]`)?.offsetWidth ?? 0;
      let count = 0;
      let used = 0;
      for (let index = 0; index < widths.length; index += 1) {
        const hidden = widths.length - (index + 1);
        const reserve = hidden > 0 ? gap + plusWidth(hidden) : 0;
        const next = used + (count > 0 ? gap : 0) + widths[index] + reserve;
        if (next > max + 1 && count > 0) break;
        used += (count > 0 ? gap : 0) + widths[index];
        count += 1;
      }
      const nextCount = Math.max(1, count);
      setVisibleCount((current) => (current === nextCount ? current : nextCount));
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(box);
    return () => observer.disconnect();
  }, [itemKey]);

  if (items.length === 0) return null;
  const visible = items.slice(0, visibleCount);
  const hidden = items.length - visible.length;
  const row = (
    <div className="flex min-w-0 flex-nowrap items-center gap-1 overflow-hidden">
      {visible.map((item, index) => (
        <span key={item.id} className={hidden > 0 && index === visible.length - 1 ? "inline-flex min-w-0 shrink overflow-hidden" : "inline-flex shrink-0"}>
          <Badge variant="soft" className="min-w-0 max-w-full">{item.name}</Badge>
        </span>
      ))}
      {hidden > 0 ? (
        <span className="inline-flex shrink-0">
          <Badge color="gray" variant="soft">+{hidden}</Badge>
        </span>
      ) : null}
    </div>
  );
  return (
    <div ref={boxRef} className="relative min-w-0 overflow-hidden">
      <div ref={measureRef} className="pointer-events-none absolute top-0 left-0 flex w-max flex-nowrap gap-1 opacity-0" aria-hidden>
        {items.map((item) => (
          <span key={item.id} data-name-badge className="inline-flex w-max shrink-0">
            <Badge variant="soft">{item.name}</Badge>
          </span>
        ))}
        {items.slice(1).map((_, index) => {
          const hiddenCount = items.length - (index + 1);
          return (
            <span key={`plus-${hiddenCount}`} data-plus-badge={hiddenCount} className="inline-flex w-max shrink-0">
              <Badge color="gray" variant="soft">+{hiddenCount}</Badge>
            </span>
          );
        })}
      </div>
      {hidden > 0 ? (
        <Tooltip
          title={(
            <div className="flex max-h-64 flex-wrap gap-x-3 gap-y-1 overflow-auto py-0.5">
              {items.map((item) => <span key={item.id} className="whitespace-nowrap">{item.name}</span>)}
            </div>
          )}
          slotProps={{ tooltip: { sx: { maxWidth: 480 } } }}
        >
          {row}
        </Tooltip>
      ) : row}
    </div>
  );
}

function DraggableScheduleCard({
  reorderEnabled,
  ...cardProps
}: {
  reorderEnabled: boolean;
} & Parameters<typeof ScheduleCard>[0]) {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: cardProps.schedule.id,
    disabled: !reorderEnabled,
  });
  const handle = reorderEnabled ? (
    <button
      type="button"
      className="mt-0.5 inline-flex size-8 shrink-0 cursor-grab items-center justify-center rounded-md text-[var(--gray-9)] hover:bg-[var(--accent-a3)] hover:text-[var(--accent-11)] active:cursor-grabbing"
      style={{ touchAction: "none" }}
      title={t("admin.nodeTable.dragToReorder", "长按拖拽重新排序")}
      aria-label={t("admin.nodeTable.dragToReorder", "长按拖拽重新排序")}
      {...attributes}
      {...listeners}
    >
      <GripVertical size={18} />
    </button>
  ) : null;
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.65 : 1,
      }}
    >
      <ScheduleCard {...cardProps} dragHandle={handle} />
    </div>
  );
}

function ScheduleCard({
  schedule,
  names,
  busy,
  hasGrant,
  twoFaEnabled,
  passkeyAvailable,
  onEdit,
  onDelete,
  onRun,
  onEnabled,
  onOpen,
  dragHandle,
}: {
  schedule: Schedule;
  names: Map<string, string>;
  busy: boolean;
  hasGrant: boolean;
  twoFaEnabled: boolean;
  passkeyAvailable: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onRun: (password: string, otp: string, usePasskey: boolean) => void;
  onEnabled: (enabled: boolean, password: string, otp: string, usePasskey: boolean) => void;
  onOpen?: () => void;
  dragHandle?: ReactNode;
}) {
  const { t } = useTranslation();
  const [confirming, setConfirming] = useState<"run" | "enable" | null>(null);
  const serverNames = useMemo(
    () => schedule.clients.map((id) => ({ id, name: names.get(id) || id })),
    [names, schedule.clients],
  );
  const reason = schedule.disabled_reason === "security"
    ? t("scheduled_exec.reason_security")
    : schedule.disabled_reason === "remote_off"
      ? t("scheduled_exec.reason_remote_off")
      : "";

  const ask = (action: "run" | "enable") => {
    if (hasGrant) {
      if (action === "run") onRun("", "", false);
      else onEnabled(true, "", "", false);
      return;
    }
    setConfirming(action);
  };

  const nameRow = (
    <Flex align="center" gap="2" wrap="wrap">
      <span className="text-base font-semibold leading-6">{schedule.name}</span>
      <Badge color={schedule.enabled ? "green" : "gray"} variant="soft">
        {schedule.enabled ? t("scheduled_exec.enabled") : t("scheduled_exec.disabled")}
      </Badge>
      {onOpen ? <ChevronRight sx={{ fontSize: 18, color: "text.secondary" }} /> : null}
    </Flex>
  );

  return (
    <Card className="p-4">
      <Flex direction="column" gap="3">
        <Flex justify="between" align="start" gap="3" wrap="wrap">
          <div className="flex min-w-0 items-start gap-2">
            {dragHandle}
            <div className="min-w-0">
              {onOpen ? (
                <button type="button" className="cursor-pointer bg-transparent p-0 text-left" onClick={onOpen}>
                  {nameRow}
                </button>
              ) : nameRow}
              <Text as="div" size="2" color="gray" className="mt-1">
                {scheduleSummary(schedule, t)}
              </Text>
            </div>
          </div>
          <Flex align="center" gap="2" onClick={(event) => event.stopPropagation()}>
            <Text size="2" color="gray">{t("scheduled_exec.enabled_label")}</Text>
            <Switch
              checked={schedule.enabled}
              disabled={busy}
              onCheckedChange={(checked) => {
                if (!checked) onEnabled(false, "", "", false);
                else ask("enable");
              }}
            />
          </Flex>
        </Flex>
        <div className="truncate rounded-md bg-[var(--gray-2)] px-3 py-2 font-mono text-sm">
          {schedule.command}
        </div>
        <FittingServerNames items={serverNames} />
        <Flex justify="between" align="center" gap="2" wrap="wrap">
          <div className="min-w-0">
            <Text size="2" color="gray">
              {schedule.enabled && schedule.next_run_at
                ? t("scheduled_exec.next_run", { time: shanghaiClock(schedule.next_run_at) })
                : t("scheduled_exec.no_next")}
              {" · "}
              {schedule.last_run_at
                ? t("scheduled_exec.last_run", { time: shanghaiClock(schedule.last_run_at) })
                : t("scheduled_exec.never_run")}
            </Text>
          </div>
          <Flex gap="2" wrap="wrap" onClick={(event) => event.stopPropagation()}>
            <Button variant="soft" size="1" disabled={busy} onClick={() => ask("run")}>{t("scheduled_exec.run")}</Button>
            <Button variant="soft" size="1" onClick={onEdit}>{t("scheduled_exec.edit")}</Button>
            <Button variant="soft" size="1" color="red" onClick={onDelete}>{t("scheduled_exec.delete")}</Button>
          </Flex>
        </Flex>
        {reason ? <Text size="2" color="gray">{reason}</Text> : null}
        {schedule.last_run ? <Text size="2" color="gray">{runSummary(schedule.last_run, t)}</Text> : null}
      </Flex>
      <ReauthDialog
        open={confirming !== null}
        twoFaEnabled={twoFaEnabled}
        passkeyAvailable={passkeyAvailable}
        busy={busy}
        onClose={() => setConfirming(null)}
        onConfirm={(password, otp, usePasskey) => {
          const action = confirming;
          setConfirming(null);
          if (action === "run") onRun(password, otp, usePasskey);
          if (action === "enable") onEnabled(true, password, otp, usePasskey);
        }}
      />
    </Card>
  );
}

function ScheduleDialog({
  open,
  schedule,
  nodes,
  hasGrant,
  twoFaEnabled,
  passkeyAvailable,
  onClose,
  onSave,
}: {
  open: boolean;
  schedule: Schedule | null;
  nodes: NodeDetail[];
  hasGrant: boolean;
  twoFaEnabled: boolean;
  passkeyAvailable: boolean;
  onClose: () => void;
  onSave: (form: FormState, password: string, otp: string, usePasskey: boolean) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPassword("");
    setOtp("");
    if (!schedule) {
      setForm(EMPTY_FORM);
      return;
    }
    const minutes = schedule.interval_minutes || 60;
    const wholeDays = minutes >= 1440 && minutes % 1440 === 0;
    const storedDays = schedule.weekdays?.length ? schedule.weekdays : [schedule.weekday ?? 1];
    setForm({
      name: schedule.name,
      command: schedule.command,
      clients: schedule.clients,
      enabled: schedule.enabled,
      kind: schedule.kind,
      intervalMinutes: String(wholeDays ? minutes / 1440 : minutes),
      intervalUnit: wholeDays ? "day" : "minute",
      timeOfDay: schedule.time_of_day || "03:00",
      weekdays: storedDays.map((day) => String(day)),
      monthDay: String(schedule.month_day || 1),
    });
  }, [open, schedule]);

  const submit = async (usePasskey = false) => {
    if (!form.name.trim() || !form.command.trim() || form.clients.length === 0) {
      toast.error(t("scheduled_exec.errors.required"));
      return;
    }
    if (!usePasskey && !hasGrant && (twoFaEnabled ? !otp.trim() : !password.trim())) {
      toast.error(twoFaEnabled ? t("account.otp_empty_error") : t("terminal.session.reauth_password_prompt"));
      return;
    }
    setSaving(true);
    try {
      await onSave(form, password, otp, usePasskey);
      setPassword("");
      setOtp("");
    } catch (err) {
      toast.error(actionError(err, t));
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppDialogContentHolder
      open={open}
      title={schedule ? t("scheduled_exec.edit_title") : t("scheduled_exec.create")}
      description={t("scheduled_exec.dialog_hint")}
      maxWidth="1280px"
      onClose={onClose}
    >
      <div className="mt-4 space-y-4">
        <Field label={t("scheduled_exec.name")}>
          <TextField.Root value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
        </Field>
        <Field label={t("scheduled_exec.command")}>
          <SavedExecCommands onApply={(command) => setForm({ ...form, command })} />
          <TextArea
            className="mt-2 font-mono"
            rows={4}
            value={form.command}
            placeholder={t("exec.commandPlaceholder")}
            onChange={(event) => setForm({ ...form, command: event.target.value })}
          />
        </Field>
        <Field label={t("scheduled_exec.kind")}>
          <ChoiceButtons
            value={form.kind}
            options={[
              { value: "interval", label: t("scheduled_exec.kind_interval") },
              { value: "daily", label: t("scheduled_exec.kind_daily") },
              { value: "weekly", label: t("scheduled_exec.kind_weekly") },
              { value: "monthly", label: t("scheduled_exec.kind_monthly") },
            ]}
            onChange={(kind) => {
              if (typeof kind === "string") setForm({ ...form, kind: kind as ScheduleKind });
            }}
          />
        </Field>
        {form.kind === "interval" ? (
          <Field label={t("scheduled_exec.interval")}>
            <div className="scheduled-exec-interval flex items-center gap-3">
              <TextField.Root
                className="scheduled-exec-interval-input"
                style={{ width: "7rem", flex: "0 0 7rem" }}
                type="number"
                min={1}
                max={form.intervalUnit === "day" ? 30 : 30 * 1440}
                value={form.intervalMinutes}
                onChange={(event) => setForm({ ...form, intervalMinutes: event.target.value })}
              />
              <ChoiceButtons
                value={form.intervalUnit}
                options={[
                  { value: "minute", label: t("scheduled_exec.unit_minute") },
                  { value: "day", label: t("scheduled_exec.unit_day") },
                ]}
                onChange={(unit) => {
                  if (typeof unit === "string") setForm({ ...form, intervalUnit: unit as IntervalUnit });
                }}
              />
            </div>
          </Field>
        ) : (
          <div className="flex flex-wrap items-end gap-6">
            {form.kind === "weekly" ? (
              <Field label={t("scheduled_exec.weekday")} className="min-w-0 flex-1">
                <ChoiceButtons
                  multiple
                  value={form.weekdays}
                  options={["1", "2", "3", "4", "5", "6", "0"].map((day) => ({
                    value: day,
                    label: t(`scheduled_exec.weekday_${day}`),
                  }))}
                  onChange={(weekdays) => {
                    if (Array.isArray(weekdays)) setForm({ ...form, weekdays });
                  }}
                />
              </Field>
            ) : null}
            {form.kind === "monthly" ? (
              <Field label={t("scheduled_exec.month_day")} className="w-44">
                <Select.Root value={form.monthDay} onValueChange={(monthDay) => setForm({ ...form, monthDay })}>
                  <Select.Trigger className="w-full" />
                  <Select.Content>
                    {Array.from({ length: 31 }, (_, index) => String(index + 1)).map((day) => (
                      <Select.Item key={day} value={day}>{t("scheduled_exec.month_day_value", { day })}</Select.Item>
                    ))}
                  </Select.Content>
                </Select.Root>
              </Field>
            ) : null}
            <Field label={t("scheduled_exec.time")} className="scheduled-exec-time w-44">
              <div className="scheduled-exec-time-field">
                <TextField.Root
                  className="w-full"
                  type="time"
                  step={60}
                  value={form.timeOfDay}
                  onChange={(event) => setForm({ ...form, timeOfDay: event.target.value.slice(0, 5) })}
                />
                <button
                  type="button"
                  className="scheduled-exec-time-icon"
                  aria-label={t("scheduled_exec.time")}
                  onClick={(event) => {
                    const input = event.currentTarget.parentElement?.querySelector("input");
                    if (!(input instanceof HTMLInputElement)) return;
                    input.focus();
                    input.showPicker?.();
                  }}
                >
                  <Clock size={16} />
                </button>
              </div>
            </Field>
          </div>
        )}
        <div className="flex items-center justify-between gap-4">
          <Text size="1" color="gray" className="min-w-0">
            {form.kind === "monthly" ? t("scheduled_exec.month_day_hint") : form.kind === "interval" ? t("scheduled_exec.interval_hint") : t("scheduled_exec.timezone_hint")}
          </Text>
          <Flex align="center" gap="2" className="shrink-0">
            <Switch checked={form.enabled} onCheckedChange={(enabled) => setForm({ ...form, enabled })} />
            <Text size="2">{t("scheduled_exec.enabled_label")}</Text>
          </Flex>
        </div>
        <Field label={t("exec.selectNodes")}>
          <div className="scheduled-exec-node-picker min-w-0">
            <RemoteExecNodeSelector nodes={nodes} value={form.clients} onChange={(clients) => setForm({ ...form, clients })} />
          </div>
        </Field>
        <div className="flex flex-col justify-end gap-2 rounded-md border border-[var(--gray-a5)] bg-[var(--gray-a2)] p-3 sm:flex-row sm:items-center">
          <MuiTextField
            size="small"
            className="w-full sm:w-64"
            type={twoFaEnabled ? "text" : "password"}
            inputMode={twoFaEnabled ? "numeric" : undefined}
            autoComplete={twoFaEnabled ? "one-time-code" : "current-password"}
            placeholder={hasGrant ? t("scheduled_exec.grant_ready") : twoFaEnabled ? t("admin.nodeTable.twoFactorCode") : t("login.password")}
            value={twoFaEnabled ? otp : password}
            onChange={(event) => {
              const value = event.target.value;
              if (twoFaEnabled) setOtp(value.replace(/\D/g, "").slice(0, 6));
              else setPassword(value);
            }}
            sx={{ "& .MuiOutlinedInput-root": { height: 40, borderRadius: "8px", bgcolor: "background.paper" } }}
          />
          <MuiButton
            variant="contained"
            disableElevation
            disabled={saving}
            onClick={() => void submit(false)}
            sx={{ minWidth: 120, height: 40, borderRadius: "8px", textTransform: "none", fontWeight: 600 }}
          >
            {saving ? t("scheduled_exec.saving") : t("scheduled_exec.save")}
          </MuiButton>
          {passkeyAvailable && !hasGrant ? (
            <MuiButton variant="outlined" disabled={saving} onClick={() => void submit(true)} sx={{ height: 40, borderRadius: "8px", textTransform: "none", fontWeight: 600 }}>
              {t("login.passkey")}
            </MuiButton>
          ) : null}
        </div>
      </div>
    </AppDialogContentHolder>
  );
}

function ScheduleRuns({
  schedule,
  names,
}: {
  schedule: Schedule;
  names: Map<string, string>;
}) {
  const { t } = useTranslation();
  const [runs, setRuns] = useState<ScheduleRun[]>([]);
  const [selected, setSelected] = useState("");
  const [results, setResults] = useState<TaskResult[]>([]);
  const scheduleID = schedule.id;
  const lastRunAt = schedule.last_run_at;

  useEffect(() => {
    if (!scheduleID) {
      setRuns([]);
      setSelected("");
      setResults([]);
      return;
    }
    setRuns([]);
    setSelected("");
    setResults([]);
    let stop = false;
    const load = async () => {
      const response = await fetch(`/api/admin/scheduled-exec/${scheduleID}/runs`);
      const payload = await readPayload(response);
      if (!response.ok || stop) return;
      const rows = Array.isArray(payload?.data?.runs) ? payload.data.runs as ScheduleRun[] : [];
      setRuns(rows);
      setSelected(rows[0]?.id || "");
    };
    void load();
    return () => {
      stop = true;
    };
  }, [scheduleID, lastRunAt]);

  const current = runs.find((run) => run.id === selected) ?? runs[0] ?? null;
  const runPager = useAdminPagination(runs);
  const resultPager = useAdminPagination(results);

  useEffect(() => {
    resultPager.setPage(1);
  }, [current?.id, resultPager.setPage]);

  useEffect(() => {
    if (!current?.task_id) {
      setResults([]);
      return;
    }
    let stop = false;
    let stopPolling = () => {};
    const load = async () => {
      const response = await fetch(`/api/admin/task/${current.task_id}/result`);
      const payload = await readPayload(response);
      if (stop) return;
      const rows = Array.isArray(payload?.data) ? payload.data as TaskResult[] : [];
      setResults(rows);
      if (rows.length > 0 && rows.every((row) => row.finished_at)) {
        stopPolling();
      }
    };
    void load();
    stopPolling = startVisibleInterval(() => void load(), 2000);
    const timeout = window.setTimeout(() => stopPolling(), 60000);
    return () => {
      stop = true;
      stopPolling();
      window.clearTimeout(timeout);
    };
  }, [current?.task_id]);

  return (
    <section className="flex flex-col gap-3">
      <Text as="h2" size="4" weight="medium">{t("scheduled_exec.logs_title")}</Text>
      {runs.length === 0 ? <Text color="gray">{t("scheduled_exec.logs_empty")}</Text> : (
        <div className="grid items-start gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
          <Card className="p-0" style={{ overflow: "clip" }}>
            <div>
              {runPager.pageItems.map((run) => {
                const on = run.id === current?.id;
                return (
                  <button
                    key={run.id}
                    type="button"
                    aria-pressed={on}
                    className={`flex w-full cursor-pointer flex-col gap-0.5 border-b border-[var(--gray-a4)] px-4 py-3 text-left last:border-b-0 ${on ? "bg-[rgba(7,141,238,0.08)]" : "bg-transparent hover:bg-[var(--gray-a2)]"}`}
                    onClick={() => setSelected(run.id)}
                  >
                    <Text as="div" size="2" weight="medium">{shanghaiClock(run.started_at)}</Text>
                    <Text as="div" size="2" color="gray">{runSummary(run, t)}</Text>
                  </button>
                );
              })}
            </div>
            <AdminPagination
              showSummary={false}
              page={runPager.page}
              total={runs.length}
              pageSize={runPager.pageSize}
              onPageChange={runPager.setPage}
              onPageSizeChange={runPager.setPageSize}
            />
          </Card>
          <div className="flex min-w-0 flex-col gap-3">
            {current && results.length === 0 ? <Text color="gray">{runSummary(current, t)}</Text> : null}
            {resultPager.pageItems.map((result) => (
              <Card key={result.client} className="p-4">
                <Flex justify="between" align="center" gap="2">
                  <Text weight="medium">{names.get(result.client) || result.client}</Text>
                  <Text size="1" color="gray">
                    {result.finished_at ? t("exec.exit_code", { code: result.exit_code ?? "-" }) : t("exec.status.running")}
                  </Text>
                </Flex>
                {result.result ? (
                  <pre className="mt-3 overflow-x-auto whitespace-pre-wrap rounded-md bg-[var(--gray-2)] p-3 font-mono text-sm">
                    {localizeExecResult(result.result, t)}
                  </pre>
                ) : null}
              </Card>
            ))}
            <AdminPagination
              hideDivider
              showSummary={false}
              page={resultPager.page}
              total={results.length}
              pageSize={resultPager.pageSize}
              onPageChange={resultPager.setPage}
              onPageSizeChange={resultPager.setPageSize}
            />
          </div>
        </div>
      )}
    </section>
  );
}

function ReauthDialog({
  open,
  twoFaEnabled,
  passkeyAvailable,
  busy,
  onClose,
  onConfirm,
}: {
  open: boolean;
  twoFaEnabled: boolean;
  passkeyAvailable: boolean;
  busy: boolean;
  onClose: () => void;
  onConfirm: (password: string, otp: string, usePasskey: boolean) => void;
}) {
  const { t } = useTranslation();
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  useEffect(() => {
    if (!open) return;
    setPassword("");
    setOtp("");
  }, [open]);
  return (
    <AppDialogContentHolder
      open={open}
      title={t("scheduled_exec.confirm_title")}
      onClose={onClose}
    >
      <div className="mt-4 flex flex-col gap-2">
        <MuiTextField
          size="small"
          type={twoFaEnabled ? "text" : "password"}
          autoComplete={twoFaEnabled ? "one-time-code" : "current-password"}
          placeholder={twoFaEnabled ? t("admin.nodeTable.twoFactorCode") : t("login.password")}
          value={twoFaEnabled ? otp : password}
          onChange={(event) => {
            const value = event.target.value;
            if (twoFaEnabled) setOtp(value.replace(/\D/g, "").slice(0, 6));
            else setPassword(value);
          }}
        />
        <Flex gap="2" justify="end">
          {passkeyAvailable ? (
            <MuiButton variant="outlined" disabled={busy} onClick={() => onConfirm("", "", true)} sx={{ textTransform: "none", borderRadius: "8px" }}>
              {t("login.passkey")}
            </MuiButton>
          ) : null}
          <MuiButton
            variant="contained"
            disableElevation
            disabled={busy || (twoFaEnabled ? !otp.trim() : !password.trim())}
            onClick={() => onConfirm(password, otp, false)}
            sx={{ textTransform: "none", borderRadius: "8px", fontWeight: 600 }}
          >
            {t("scheduled_exec.confirm")}
          </MuiButton>
        </Flex>
      </div>
    </AppDialogContentHolder>
  );
}

function AppDialogContentHolder({
  open,
  title,
  description,
  maxWidth,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  description?: string;
  maxWidth?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={(next: boolean) => { if (!next) onClose(); }}>
      <AppDialogContent title={title} description={description} maxWidth={maxWidth || "480px"}>
        {children}
      </AppDialogContent>
    </Dialog.Root>
  );
}

function Field({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={["flex flex-col gap-2", className].filter(Boolean).join(" ")}>
      <span className="text-sm font-semibold leading-5">{label}</span>
      {children}
    </div>
  );
}

function scheduleSummary(schedule: Schedule, t: (key: string, options?: Record<string, unknown>) => string) {
  if (schedule.kind === "interval") {
    const minutes = schedule.interval_minutes;
    if (minutes >= 1440 && minutes % 1440 === 0) {
      return t("scheduled_exec.schedule_interval_days", { count: minutes / 1440 });
    }
    return t("scheduled_exec.schedule_interval", { count: minutes });
  }
  if (schedule.kind === "weekly") {
    const days = schedule.weekdays?.length ? schedule.weekdays : [schedule.weekday];
    const ordered = ["1", "2", "3", "4", "5", "6", "0"].filter((day) => days.map(String).includes(day));
    return t("scheduled_exec.schedule_weekly", {
      weekday: ordered.map((day) => t(`scheduled_exec.weekday_${day}`)).join(t("scheduled_exec.weekday_join")),
      time: schedule.time_of_day,
    });
  }
  if (schedule.kind === "monthly") {
    return t("scheduled_exec.schedule_monthly", {
      day: schedule.month_day || 1,
      time: schedule.time_of_day || "--:--",
    });
  }
  return t("scheduled_exec.schedule_daily", { time: schedule.time_of_day || "--:--" });
}

function ChoiceButtons({
  value,
  options,
  multiple = false,
  onChange,
}: {
  value: string | string[];
  options: { value: string; label: string }[];
  multiple?: boolean;
  onChange: (value: string | string[]) => void;
}) {
  const selected = Array.isArray(value) ? value : [value];
  return (
    <div className="scheduled-exec-choices" role={multiple ? "group" : "radiogroup"}>
      {options.map((option) => {
        const on = selected.includes(option.value);
        return (
          <button
            key={option.value}
            type="button"
            role={multiple ? "checkbox" : "radio"}
            aria-checked={on}
            className={on ? "is-selected" : ""}
            onClick={() => {
              if (!multiple) {
                onChange(option.value);
                return;
              }
              const next = on ? selected.filter((item) => item !== option.value) : [...selected, option.value];
              onChange(next);
            }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function runSummary(run: ScheduleRun, t: (key: string, options?: Record<string, unknown>) => string) {
  if (run.note && run.note !== "persist_error") {
    const key = `scheduled_exec.note_${run.note}`;
    const text = t(key);
    if (text && text !== key) return text;
  }
  return t("scheduled_exec.run_dispatched", {
    sent: run.sent,
    queued: run.queued,
    offline: run.offline,
    failed: run.failed,
  });
}

export default SchedulesPage;
