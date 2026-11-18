import React from "react";
import {
  Button,
  Callout,
  IconButton,
  Select,
  Tooltip,
} from "@/components/admin/ui";
import MuiCheckbox from "@mui/material/Checkbox";
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
  restrictToFirstScrollableAncestor,
  restrictToVerticalAxis,
} from "@dnd-kit/modifiers";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  GripVertical,
  RefreshCw,
  Save,
} from "@/components/admin/muiIcons";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import AdminPageTitle from "@/components/admin/AdminPageTitle";
import { SelectOrInput } from "@/components/ui/select-or-input";
import { useAccount } from "@/contexts/AccountContext";
import {
  getDashboardSettingsSnapshot,
  saveDashboardSettings,
  useDashboardSettings,
} from "@/hooks/useDashboardSettings";
import {
  DASHBOARD_PRESETS,
  DEFAULT_DASHBOARD_TIMEZONE,
  dashboardModuleSpans,
  dashboardSettingsEqual,
  dashboardSettingsForPreset,
  enabledDashboardModules,
  packDashboardModules,
  type DashboardModuleId,
  type DashboardModuleSpan,
  type DashboardSettings,
} from "@/utils/dashboardSettings";
import {
  listTrafficResetTimezones,
  normalizeTrafficResetTimezone,
} from "@/utils/trafficResetTimezones";

const previewSpan: Record<number, string> = {
  3: "col-span-1 sm:col-span-3",
  4: "col-span-1 sm:col-span-4",
  6: "col-span-1 sm:col-span-6",
  12: "col-span-1 sm:col-span-12",
};

type SortableModuleRowProps = {
  id: DashboardModuleId;
  enabled: boolean;
  span: DashboardModuleSpan;
  onlyEnabled: boolean;
  first: boolean;
  last: boolean;
  label: string;
  description: string;
  dragLabel: string;
  moveUpLabel: string;
  moveDownLabel: string;
  widthLabel: string;
  widthQuarterLabel: string;
  widthThirdLabel: string;
  widthHalfLabel: string;
  widthFullLabel: string;
  onToggle: (enabled: boolean) => void;
  onSpanChange: (span: DashboardModuleSpan) => void;
  onMove: (direction: -1 | 1) => void;
};

function SortableModuleRow({
  id,
  enabled,
  span,
  onlyEnabled,
  first,
  last,
  label,
  description,
  dragLabel,
  moveUpLabel,
  moveDownLabel,
  widthLabel,
  widthQuarterLabel,
  widthThirdLabel,
  widthHalfLabel,
  widthFullLabel,
  onToggle,
  onSpanChange,
  onMove,
}: SortableModuleRowProps) {
  const { attributes, isDragging, listeners, setNodeRef, transform, transition } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex min-h-[58px] items-center gap-3 bg-[var(--color-panel-solid)] px-3 py-2 ${
        isDragging ? "relative z-10 shadow-sm" : ""
      }`}
    >
      <Tooltip content={dragLabel}>
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="inline-flex size-7 shrink-0 touch-none cursor-grab items-center justify-center rounded text-muted-foreground hover:bg-[var(--gray-a3)] hover:text-foreground active:cursor-grabbing"
        >
          <GripVertical size={16} />
          <span className="sr-only">{dragLabel}</span>
        </button>
      </Tooltip>
      <MuiCheckbox
        checked={enabled}
        disabled={onlyEnabled}
        onChange={(_, checked) => onToggle(checked)}
        slotProps={{ input: { "aria-label": label } }}
        sx={{
          p: 0.5,
          color: "text.secondary",
          "&.Mui-checked": { color: "primary.main" },
        }}
      />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{label}</div>
        <div className="mt-0.5 truncate text-xs text-muted-foreground">{description}</div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Select.Root
          value={String(span)}
          onValueChange={(value) => onSpanChange(Number(value) as DashboardModuleSpan)}
        >
          <Select.Trigger aria-label={widthLabel} className="w-[4.5rem]" />
          <Select.Content>
            <Select.Item value="3">{widthQuarterLabel}</Select.Item>
            <Select.Item value="4">{widthThirdLabel}</Select.Item>
            <Select.Item value="6">{widthHalfLabel}</Select.Item>
            <Select.Item value="12">{widthFullLabel}</Select.Item>
          </Select.Content>
        </Select.Root>
        <Tooltip content={moveUpLabel}>
          <IconButton
            type="button"
            size="1"
            variant="ghost"
            color="gray"
            disabled={first}
            onClick={() => onMove(-1)}
          >
            <ArrowUp size={15} />
          </IconButton>
        </Tooltip>
        <Tooltip content={moveDownLabel}>
          <IconButton
            type="button"
            size="1"
            variant="ghost"
            color="gray"
            disabled={last}
            onClick={() => onMove(1)}
          >
            <ArrowDown size={15} />
          </IconButton>
        </Tooltip>
      </div>
    </div>
  );
}

function cloneSettings(settings: DashboardSettings): DashboardSettings {
  return {
    ...settings,
    modules: settings.modules.map((module) => ({ ...module })),
  };
}

export default function DashboardSettingsPage() {
  const { t } = useTranslation();
  const { account } = useAccount();
  const accountKey = account?.uuid || account?.username || "authenticated";
  const snapshot = getDashboardSettingsSnapshot(accountKey);
  const { settings, loading, error, refetch } = useDashboardSettings(accountKey);
  const [draft, setDraft] = React.useState<DashboardSettings | null>(() =>
    snapshot ? cloneSettings(snapshot) : null,
  );
  const [saved, setSaved] = React.useState<DashboardSettings | null>(() =>
    snapshot ? cloneSettings(snapshot) : null,
  );
  const [saving, setSaving] = React.useState(false);
  const [painted, setPainted] = React.useState(false);
  const moduleSensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  React.useLayoutEffect(() => {
    if (loading) return;
    setDraft((current) =>
      current && dashboardSettingsEqual(current, settings)
        ? current
        : cloneSettings(settings),
    );
    setSaved((current) =>
      current && dashboardSettingsEqual(current, settings)
        ? current
        : cloneSettings(settings),
    );
  }, [loading, settings]);

  React.useLayoutEffect(() => {
    if (loading || !draft || !saved) {
      setPainted(false);
      return;
    }
    if (painted) return;
    const frame = window.requestAnimationFrame(() => setPainted(true));
    return () => window.cancelAnimationFrame(frame);
  }, [draft, loading, painted, saved]);

  const handleSave = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      const confirmed = await saveDashboardSettings(draft, { accountKey });
      setDraft(cloneSettings(confirmed));
      setSaved(cloneSettings(confirmed));
      toast.success(t("settings.settings_saved"));
    } catch (reason) {
      toast.error(`${t("settings.settings_save_failed")}: ${reason instanceof Error ? reason.message : String(reason)}`);
    } finally {
      setSaving(false);
    }
  };

  const timezoneOptions = React.useMemo(() => listTrafficResetTimezones(), []);

  if (error && !draft) {
    return (
      <Callout.Root color="red">
        <Callout.Icon><AlertCircle size={16} /></Callout.Icon>
        <Callout.Text className="flex flex-wrap items-center gap-2">
          <span>{error.message}</span>
          <Button size="1" variant="soft" onClick={() => void refetch(true)}>
            <RefreshCw size={14} />
            {t("common.retry")}
          </Button>
        </Callout.Text>
      </Callout.Root>
    );
  }

  if (loading || !draft || !saved) {
    return <div data-admin-route-pending="true" />;
  }

  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const enabledCount = draft.modules.filter((module) => module.enabled).length;

  const selectPreset = (preset: Exclude<DashboardSettings["preset"], "custom">) => {
    setDraft((current) => dashboardSettingsForPreset(
      preset,
      current?.timezone || DEFAULT_DASHBOARD_TIMEZONE,
    ));
  };

  const toggleModule = (id: DashboardModuleId, enabled: boolean) => {
    setDraft((current) => {
      if (!current) return current;
      return {
        ...current,
        preset: "custom",
        modules: current.modules.map((module) => (
          module.id === id ? { ...module, enabled } : module
        )),
      };
    });
  };

  const resizeModule = (id: DashboardModuleId, span: DashboardModuleSpan) => {
    setDraft((current) => {
      if (!current) return current;
      return {
        ...current,
        preset: "custom",
        modules: current.modules.map((module) => (
          module.id === id ? { ...module, span } : module
        )),
      };
    });
  };

  const moveModule = (index: number, direction: -1 | 1) => {
    setDraft((current) => {
      if (!current) return current;
      const target = index + direction;
      if (target < 0 || target >= current.modules.length) return current;
      const modules = current.modules.map((module) => ({ ...module }));
      [modules[index], modules[target]] = [modules[target], modules[index]];
      return { ...current, preset: "custom", modules };
    });
  };

  const handleModuleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    setDraft((current) => {
      if (!current) return current;
      const oldIndex = current.modules.findIndex((module) => module.id === active.id);
      const newIndex = current.modules.findIndex((module) => module.id === over.id);
      if (oldIndex < 0 || newIndex < 0) return current;
      return {
        ...current,
        preset: "custom",
        modules: arrayMove(current.modules, oldIndex, newIndex),
      };
    });
  };

  const visibleModules = enabledDashboardModules(draft);
  const packedPreview = packDashboardModules(
    visibleModules,
    dashboardModuleSpans(draft),
    draft.preset !== "custom",
  );

  const previewModule = (id: DashboardModuleId, className = "") => {
    return (
      <div
        key={id}
        className={`${className} flex min-h-12 items-center rounded border border-[var(--gray-a5)] bg-[var(--color-panel-solid)] px-2.5 py-2 text-xs font-medium`}
      >
        <span className="min-w-0 truncate">{t(`settings.dashboard.module_${id}`)}</span>
      </div>
    );
  };

  return (
    <div
      className="flex flex-col gap-3"
      data-admin-route-pending={painted ? undefined : "true"}
    >
      <AdminPageTitle description={t("settings.dashboard.page_description")}>
        {t("settings.dashboard.title")}
      </AdminPageTitle>

      <section className="rounded-md border bg-[var(--color-panel-solid)] p-3">
        <div className="mb-3 flex items-center gap-2">
          <h2 className="text-sm font-semibold">{t("settings.dashboard.presets")}</h2>
          {draft.preset === "custom" ? (
            <span className="rounded-full bg-[var(--accent-a3)] px-2 py-0.5 text-xs text-[var(--accent-11)]">
              {t("settings.dashboard.preset_custom")}
            </span>
          ) : null}
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {DASHBOARD_PRESETS.map((preset) => {
            const active = draft.preset === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                aria-pressed={active}
                className={`min-h-[76px] rounded-md border p-3 text-left transition-colors ${
                  active
                    ? "border-[var(--accent-8)] bg-[var(--accent-a3)]"
                    : "border-[var(--gray-a6)] hover:border-[var(--accent-a7)] hover:bg-[var(--gray-a2)]"
                }`}
                onClick={() => selectPreset(preset.id)}
              >
                <div className="text-sm font-semibold">{t(`settings.dashboard.preset_${preset.id}`)}</div>
                <div className="mt-1 text-xs leading-5 text-muted-foreground">
                  {t(`settings.dashboard.preset_${preset.id}_description`)}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <section className="rounded-md border bg-[var(--color-panel-solid)] p-3">
        <div className="mb-3">
          <h2 className="text-sm font-semibold">{t("settings.dashboard.timezone")}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{t("settings.dashboard.timezone_hint")}</p>
        </div>
        <div className="max-w-xl">
          <SelectOrInput
            options={timezoneOptions}
            value={draft.timezone || DEFAULT_DASHBOARD_TIMEZONE}
            allowCustomInput
            onChange={(value) => setDraft((current) => {
              if (!current) return current;
              return {
                ...current,
                timezone: normalizeTrafficResetTimezone(value) || DEFAULT_DASHBOARD_TIMEZONE,
              };
            })}
            placeholder={DEFAULT_DASHBOARD_TIMEZONE}
            aria-label={t("settings.dashboard.timezone")}
          />
        </div>
      </section>

      <section className="rounded-md border bg-[var(--color-panel-solid)] p-3">
        <div className="mb-3">
          <h2 className="text-sm font-semibold">{t("settings.dashboard.refresh_title")}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{t("settings.dashboard.refresh_description")}</p>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <label className="flex items-center justify-between gap-3 rounded-md border px-3 py-2.5 text-sm">
            <span>{t("settings.dashboard.summary_refresh")}</span>
            <Select.Root
              value={String(draft.refresh_seconds)}
              onValueChange={(value) => setDraft((current) => {
                if (!current) return current;
                return {
                  ...current,
                  preset: "custom",
                  refresh_seconds: Number(value) as DashboardSettings["refresh_seconds"],
                };
              })}
            >
              <Select.Trigger className="w-24" />
              <Select.Content>
                {[15, 30, 60, 120].map((seconds) => (
                  <Select.Item key={seconds} value={String(seconds)}>{seconds}s</Select.Item>
                ))}
              </Select.Content>
            </Select.Root>
          </label>
          <label className="flex items-center justify-between gap-3 rounded-md border px-3 py-2.5 text-sm">
            <span>{t("settings.dashboard.chart_refresh")}</span>
            <Select.Root
              value={String(draft.chart_refresh_seconds)}
              onValueChange={(value) => setDraft((current) => {
                if (!current) return current;
                return {
                  ...current,
                  preset: "custom",
                  chart_refresh_seconds: Number(value) as DashboardSettings["chart_refresh_seconds"],
                };
              })}
            >
              <Select.Trigger className="w-24" />
              <Select.Content>
                {[15, 30, 60, 120].map((seconds) => (
                  <Select.Item key={seconds} value={String(seconds)}>{seconds}s</Select.Item>
                ))}
              </Select.Content>
            </Select.Root>
          </label>
          <label className="flex items-center justify-between gap-3 rounded-md border px-3 py-2.5 text-sm">
            <span>{t("settings.dashboard.ranking_limit")}</span>
            <Select.Root
              value={String(draft.ranking_limit)}
              onValueChange={(value) => setDraft((current) => {
                if (!current) return current;
                return {
                  ...current,
                  preset: "custom",
                  ranking_limit: Number(value) as DashboardSettings["ranking_limit"],
                };
              })}
            >
              <Select.Trigger className="w-24" />
              <Select.Content>
                <Select.Item value="5">Top 5</Select.Item>
                <Select.Item value="10">Top 10</Select.Item>
                <Select.Item value="15">Top 15</Select.Item>
                <Select.Item value="20">Top 20</Select.Item>
              </Select.Content>
            </Select.Root>
          </label>
        </div>
      </section>

      <section className="rounded-md border bg-[var(--color-panel-solid)] p-3">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">{t("settings.dashboard.modules")}</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("settings.dashboard.modules_enabled", { count: enabledCount })}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(22rem,0.8fr)]">
          <DndContext
            sensors={moduleSensors}
            collisionDetection={closestCenter}
            autoScroll={false}
            modifiers={[restrictToVerticalAxis, restrictToFirstScrollableAncestor]}
            onDragEnd={handleModuleDragEnd}
          >
            <SortableContext
              items={draft.modules.map((module) => module.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="divide-y overflow-hidden rounded-md border">
                {draft.modules.map((module, index) => (
                  <SortableModuleRow
                    key={module.id}
                    id={module.id}
                    enabled={module.enabled}
                    span={module.span}
                    onlyEnabled={module.enabled && enabledCount === 1}
                    first={index === 0}
                    last={index === draft.modules.length - 1}
                    label={t(`settings.dashboard.module_${module.id}`)}
                    description={t(`settings.dashboard.module_${module.id}_description`)}
                    dragLabel={t("settings.dashboard.drag_to_sort")}
                    moveUpLabel={t("settings.dashboard.move_up")}
                    moveDownLabel={t("settings.dashboard.move_down")}
                    widthLabel={t("settings.dashboard.module_width")}
                    widthQuarterLabel={t("settings.dashboard.width_quarter")}
                    widthThirdLabel={t("settings.dashboard.width_third")}
                    widthHalfLabel={t("settings.dashboard.width_half")}
                    widthFullLabel={t("settings.dashboard.width_full")}
                    onToggle={(enabled) => toggleModule(module.id, enabled)}
                    onSpanChange={(span) => resizeModule(module.id, span)}
                    onMove={(direction) => moveModule(index, direction)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>

          <div className="min-w-0">
            <div className="mb-2 text-xs font-medium text-muted-foreground">{t("settings.dashboard.preview")}</div>
            <div className="grid min-h-[260px] grid-cols-1 content-start gap-2 rounded-md border bg-[var(--gray-a2)] p-3 sm:grid-cols-12">
              {draft.preset === "overview" ? (
                <>
                  <div className="col-span-1 grid grid-cols-1 gap-2 sm:col-span-12 sm:grid-cols-4">
                    {(["server_status", "traffic_summary", "storage_summary", "cost_center"] as const).map((id) => previewModule(id))}
                  </div>
                  {previewModule("latency_trend", "col-span-1 sm:col-span-12")}
                  {previewModule("traffic_trend", "col-span-1 sm:col-span-6")}
                  {previewModule("billing_trend", "col-span-1 sm:col-span-6")}
                  <div className="col-span-1 grid grid-cols-1 gap-2 sm:col-span-12 sm:grid-cols-2">
                    {(["return_route", "alerts"] as const)
                      .map((id) => previewModule(id))}
                  </div>
                  {previewModule(
                    "renewal_calendar",
                    previewSpan[draft.modules.find((module) => module.id === "renewal_calendar")?.span ?? 4],
                  )}
                </>
              ) : packedPreview.map(({ id, span }) => previewModule(id, previewSpan[span]))}
            </div>
          </div>
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button
          type="button"
          variant="soft"
          color="gray"
          disabled={!dirty || saving}
          onClick={() => setDraft(cloneSettings(saved))}
        >
          <RefreshCw size={15} />
          {t("common.reset")}
        </Button>
        <Button type="button" disabled={!dirty || saving} onClick={() => void handleSave()}>
          <Save size={15} />
          {saving ? t("settings.dashboard.saving") : t("common.save")}
        </Button>
      </div>
    </div>
  );
}
