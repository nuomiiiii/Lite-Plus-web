import { formatBytes } from "@/utils/unitHelper";
import { useVisibleInterval } from "@/hooks/useVisibleInterval";
import {
  isPlainObject,
  parseDatabaseOverview,
  parseMaintenanceResult,
  type DatabaseInfo,
  type DatabaseMaintenanceResult,
  type DatabaseOverview,
} from "@/lib/databaseMaintenanceValidation";
import { getDatabaseRuntimeHealth } from "@/lib/databaseRuntime";
import {
  AppDialogContent, Badge, Button, Dialog, Flex, Progress, Text } from "@/components/admin/ui";
import { Activity, DatabaseZap, RefreshCw } from "@/components/admin/muiIcons";
import React from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { SettingCard } from "./SettingCard";

type TranslationFunction = ReturnType<typeof useTranslation>["t"];

let databaseOverviewSnapshot: DatabaseOverview | null = null;

export function getDatabaseOverviewSnapshot(): DatabaseOverview | null {
  return databaseOverviewSnapshot;
}

const isRecord = isPlainObject;

async function requestAdminData(
  input: RequestInfo | URL,
  fallbackMessage: string,
  init?: RequestInit,
): Promise<unknown> {
  const response = await fetch(input, init);
  let payload: unknown;

  try {
    payload = await response.json();
  } catch {
    throw new Error(fallbackMessage);
  }

  const message =
    isRecord(payload) && typeof payload.message === "string"
      ? payload.message
      : fallbackMessage;
  if (
    !response.ok ||
    !isRecord(payload) ||
    payload.status !== "success" ||
    !("data" in payload)
  ) {
    throw new Error(message);
  }

  return payload.data;
}

export async function prefetchDatabaseOverview(): Promise<DatabaseOverview | null> {
  if (databaseOverviewSnapshot) return databaseOverviewSnapshot;
  try {
    const data = await requestAdminData(
      "/api/admin/database/size",
      "Failed to load database overview",
    );
    const parsed = parseDatabaseOverview(data);
    if (!parsed) return databaseOverviewSnapshot;
    databaseOverviewSnapshot = parsed;
    return parsed;
  } catch {
    return databaseOverviewSnapshot;
  }
}

function driverLabel(driver: string): string {
  switch (driver.toLowerCase()) {
    case "sqlite":
      return "SQLite";
    case "mysql":
    case "mariadb":
      return "MySQL / MariaDB";
    case "postgres":
    case "postgresql":
      return "PostgreSQL";
    default:
      return driver;
  }
}

function DatabaseSummaryRow({ label, info }: { label: string; info: DatabaseInfo }) {
  const { t } = useTranslation();
  const runtimeSize = info.files ? info.files.wal + info.files.shm : null;
  const unavailable = "—";

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 border-b border-[var(--gray-a5)] py-3 last:border-b-0 sm:grid-cols-[minmax(160px,1.4fr)_repeat(3,minmax(96px,1fr))] sm:items-center">
      <div className="col-span-2 min-w-0 sm:col-span-1">
        <Text as="div" size="2" weight="medium">
          {label}
        </Text>
        <Text as="div" size="1" color="gray">
          {driverLabel(info.driver)} / {t(`settings.database.locations.${info.location}`)}
        </Text>
        {info.error ? (
          <Text as="div" size="1" color="red" className="break-words">
            {info.error}
          </Text>
        ) : null}
      </div>

      <div className="contents sm:block sm:text-right">
        <Text as="span" size="1" color="gray" className="sm:hidden">
          {t("settings.database.database_file")}
        </Text>
        <Text as="span" size="2" className="whitespace-nowrap sm:block">
          {info.files ? formatBytes(info.files.database) : unavailable}
        </Text>
      </div>

      <div className="contents sm:block sm:text-right">
        <Text as="span" size="1" color="gray" className="sm:hidden">
          {t("settings.database.runtime_files")}
        </Text>
        <Text as="span" size="2" className="whitespace-nowrap sm:block">
          {runtimeSize === null ? unavailable : formatBytes(runtimeSize)}
        </Text>
      </div>

      <div className="contents sm:block sm:text-right">
        <Text as="span" size="1" color="gray" className="sm:hidden">
          {t("settings.database.total_usage")}
        </Text>
        <Text
          as="span"
          size="2"
          weight="medium"
          className="whitespace-nowrap sm:block"
        >
          {info.size === null ? t("common.unknown") : formatBytes(info.size)}
        </Text>
      </div>

      {info.files ? (
        <Text
          as="div"
          size="1"
          color="gray"
          className="col-span-2 mt-1 break-words sm:col-span-4"
        >
          {t("settings.database.runtime_files_detail", {
            wal: formatBytes(info.files.wal),
            shm: formatBytes(info.files.shm),
          })}
        </Text>
      ) : null}
    </div>
  );
}

function DatabaseUsageTable({ overview }: { overview: DatabaseOverview }) {
  const { t } = useTranslation();

  return (
    <div className="w-full" role="table" aria-label={t("settings.database.maintenance_title")}>
      <div
        role="row"
        className="hidden grid-cols-[minmax(160px,1.4fr)_repeat(3,minmax(96px,1fr))] gap-x-4 border-b border-[var(--gray-a5)] py-2 sm:grid"
      >
        <Text role="columnheader" size="1" color="gray">
          {t("settings.database.title")}
        </Text>
        <Text role="columnheader" size="1" color="gray" className="text-right">
          {t("settings.database.database_file")}
        </Text>
        <Text role="columnheader" size="1" color="gray" className="text-right">
          {t("settings.database.runtime_files")}
        </Text>
        <Text role="columnheader" size="1" color="gray" className="text-right">
          {t("settings.database.total_usage")}
        </Text>
      </div>
      <DatabaseSummaryRow
        label={t("settings.database.main")}
        info={overview.main}
      />
      <DatabaseSummaryRow
        label={t("settings.database.monitoring")}
        info={overview.monitoring}
      />
    </div>
  );
}

function StorageSummaryItem({
  label,
  description,
  value,
}: {
  label: string;
  description: string;
  value: number | null;
}) {
  const { t } = useTranslation();

  return (
    <div className="min-w-0 px-3 py-3 sm:px-4">
      <Text as="div" size="1" color="gray">
        {label}
      </Text>
      <Text as="div" size="4" weight="bold" className="mt-1 break-words">
        {value === null ? t("common.unknown") : formatBytes(value)}
      </Text>
      <Text as="div" size="1" color="gray" className="mt-1 break-words">
        {description}
      </Text>
    </div>
  );
}

function StorageSummary({ overview }: { overview: DatabaseOverview }) {
  const { t } = useTranslation();

  return (
    <div className="mb-3 grid w-full grid-cols-1 divide-y divide-[var(--gray-a5)] border-y border-[var(--gray-a5)] sm:grid-cols-3 sm:divide-x sm:divide-y-0">
      <StorageSummaryItem
        label={t("settings.database.local_total")}
        description={t("settings.storage.total_description")}
        value={overview.local_total}
      />
      <StorageSummaryItem
        label={t("settings.database.main")}
        description={t("settings.storage.main_description")}
        value={overview.main.size}
      />
      <StorageSummaryItem
        label={t("settings.database.monitoring")}
        description={t("settings.storage.monitoring_description")}
        value={overview.monitoring.size}
      />
    </div>
  );
}

function formatRuntimeTime(value: string | null, fallback: string): string {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function RuntimeValue({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="min-w-0 border-l-2 border-[var(--gray-a5)] pl-3">
      <Text as="div" size="1" color="gray">
        {label}
      </Text>
      <Text as="div" size="2" weight="medium" className="mt-1 break-words">
        {value}
      </Text>
      {hint ? (
        <Text as="div" size="1" color="gray" className="mt-0.5 break-words">
          {hint}
        </Text>
      ) : null}
    </div>
  );
}

function DatabaseRuntimePanel({ info }: { info: DatabaseInfo }) {
  const { t } = useTranslation();
  const runtime = info.runtime;
  if (!runtime) return null;

  const health = getDatabaseRuntimeHealth(runtime);
  const healthColor = {
    healthy: "green",
    pending: "orange",
    attention: "red",
    idle: "gray",
  } as const;
  const progress =
    runtime.total > 0
      ? Math.min(100, (runtime.progress / runtime.total) * 100)
      : 0;
  const unavailable = t("settings.database.runtime_status.unavailable");
  const checkpointHint = runtime.checkpoint_pending
    ? t("settings.database.runtime_status.wal_waiting")
    : t("settings.database.runtime_status.wal_normal");
  const runtimeFileSize = info.files ? info.files.wal + info.files.shm : null;
  const runtimeFileHint = info.files
    ? `${t("settings.database.runtime_status.runtime_file_breakdown", {
        wal: formatBytes(info.files.wal),
        shm: formatBytes(info.files.shm),
      })} · ${checkpointHint}`
    : checkpointHint;
  const nextCheckpointAt = runtime.next_checkpoint_at
    ? new Date(runtime.next_checkpoint_at)
    : null;
  const nextCheckpointValue =
    runtime.compacting && runtime.total > 0 && runtime.progress >= runtime.total
      ? t("settings.database.runtime_status.checkpoint_in_progress")
      : nextCheckpointAt && !Number.isNaN(nextCheckpointAt.getTime()) && nextCheckpointAt.getTime() <= Date.now()
        ? t("settings.database.runtime_status.checkpoint_waiting_schedule")
        : formatRuntimeTime(runtime.next_checkpoint_at, unavailable);

  return (
    <section className="mt-4 border-t border-[var(--gray-a5)] pt-4">
      <Flex align="center" justify="between" gap="3" wrap="wrap">
        <Flex align="center" gap="2">
          <Activity size={17} aria-hidden="true" />
          <Text as="div" size="2" weight="bold">
            {t("settings.database.runtime_status.title")}
          </Text>
        </Flex>
        <Badge color={healthColor[health]} variant="soft">
          {t(`settings.database.runtime_status.health.${health}`)}
        </Badge>
      </Flex>

      <div className="mt-3">
        <Flex justify="between" align="center" gap="3">
          <Text size="1" color="gray">
            {t("settings.database.runtime_status.compaction_progress")}
          </Text>
          <Text size="1" weight="medium" className="whitespace-nowrap">
            {runtime.total > 0
              ? `${runtime.progress} / ${runtime.total}`
              : t("settings.database.runtime_status.not_started")}
          </Text>
        </Flex>
        <Progress value={progress} size="2" color={healthColor[health]} className="mt-2" />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2">
        <RuntimeValue
          label={t("settings.database.runtime_status.current_metric")}
          value={runtime.current_metric || unavailable}
          hint={t("settings.database.runtime_status.cycle_written", {
            count: runtime.cycle_written,
          })}
        />
        {runtime.checkpoint_applicable ? (
          <RuntimeValue
            label={t("settings.database.runtime_files")}
            value={runtimeFileSize === null ? unavailable : formatBytes(runtimeFileSize)}
            hint={runtimeFileHint}
          />
        ) : (
          <RuntimeValue
            label={t("settings.database.runtime_status.checkpoint")}
            value={t("settings.database.runtime_status.not_applicable")}
          />
        )}
        <RuntimeValue
          label={t("settings.database.runtime_status.last_checkpoint")}
          value={
            runtime.checkpoint_applicable
              ? formatRuntimeTime(runtime.last_checkpoint_success_at, unavailable)
              : t("settings.database.runtime_status.not_applicable")
          }
        />
        <RuntimeValue
          label={t("settings.database.runtime_status.next_checkpoint")}
          value={
            runtime.checkpoint_applicable
              ? nextCheckpointValue
              : t("settings.database.runtime_status.not_applicable")
          }
        />
      </div>

      {runtime.digest_handoff_deferred.length > 0 ? (
        <div className="mt-4 border-l-2 border-[var(--orange-a8)] bg-[var(--orange-a2)] px-3 py-2">
          <Text as="div" size="2" weight="medium" color="orange">
            {t("settings.database.runtime_status.digest_handoff_title", {
              count: runtime.digest_handoff_deferred.length,
            })}
          </Text>
          <Text as="div" size="1" color="gray" className="mt-0.5">
            {t("settings.database.runtime_status.digest_handoff_hint")}
          </Text>
          <div className="mt-2 space-y-2">
            {runtime.digest_handoff_deferred.map((item) => (
              <div key={item.metric} className="min-w-0">
                <Text as="div" size="1" weight="medium" className="break-words">
                  {t("settings.database.runtime_status.digest_handoff_item", {
                    metric: item.metric,
                    time: formatRuntimeTime(item.at, unavailable),
                  })}
                </Text>
                <Text as="div" size="1" color="gray" className="break-words">
                  {item.reason}
                </Text>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {runtime.last_error ? (
        <Text as="div" size="1" color="red" className="mt-3 break-words">
          {t("settings.database.runtime_status.last_error", {
            error: runtime.last_error,
          })}
        </Text>
      ) : null}
    </section>
  );
}

function MaintenanceActionRow({
  label,
  info,
}: {
  label: string;
  info: DatabaseInfo;
}) {
  const { t } = useTranslation();

  return (
    <div className="grid grid-cols-1 gap-1 border-b border-[var(--gray-a5)] py-3 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:gap-4">
      <div className="min-w-0">
        <Text as="div" size="2" weight="medium">
          {label}
        </Text>
        <Text as="div" size="1" color="gray">
          {driverLabel(info.driver)} / {t(`settings.database.locations.${info.location}`)}
        </Text>
      </div>
      <Text
        as="div"
        size="2"
        weight="medium"
        className="break-words sm:text-right"
      >
        {t(`settings.database.actions.${info.action}`)}
      </Text>
    </div>
  );
}

function maintenanceFailureDescription(
  result: DatabaseMaintenanceResult,
  t: TranslationFunction,
): string | undefined {
  const failures = (
    [
      [t("settings.database.main"), result.main],
      [t("settings.database.monitoring"), result.monitoring],
    ] as const
  )
    .filter(([, item]) => !item.success)
    .map(
      ([label, item]) =>
        `${label}: ${
          item.error || item.size_error || t("settings.database.operation_failed")
        }`,
    );

  return failures.length > 0 ? failures.join("; ") : undefined;
}

export function DatabaseMaintenanceCard({
  mode = "overview",
}: {
  mode?: "overview" | "maintenance";
}) {
  const { t } = useTranslation();
  const snapshot = getDatabaseOverviewSnapshot();
  const [overview, setOverview] = React.useState<DatabaseOverview | null>(
    snapshot,
  );
  const [loading, setLoading] = React.useState(() => snapshot === null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [maintaining, setMaintaining] = React.useState(false);
  const [confirmOpen, setConfirmOpen] = React.useState(false);

  const fetchOverview = React.useCallback(async (silent = false) => {
    if (!silent && !databaseOverviewSnapshot) {
      setLoading(true);
      setLoadError(null);
    }
    const fallbackMessage = t("settings.database.load_error");

    try {
      const data = await requestAdminData(
        "/api/admin/database/size",
        fallbackMessage,
      );
      const parsed = parseDatabaseOverview(data);
      if (!parsed) {
        throw new Error(t("settings.database.invalid_response"));
      }

      setOverview(parsed);
      databaseOverviewSnapshot = parsed;
      setLoadError(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!silent) setOverview(null);
      setLoadError(
        message === fallbackMessage
          ? fallbackMessage
          : `${fallbackMessage}: ${message}`,
      );
    } finally {
      if (!silent) setLoading(false);
    }
  }, [t]);

  React.useEffect(() => {
    void fetchOverview();
  }, [fetchOverview]);

  useVisibleInterval(() => {
    void fetchOverview(true);
  }, 10_000);

  const handleMaintenance = async () => {
    if (!overview || maintaining) return;

    setConfirmOpen(false);
    setMaintaining(true);
    try {
      const data = await requestAdminData(
        "/api/admin/database/vacuum",
        t("settings.database.maintenance_error"),
        { method: "POST" },
      );
      const result = parseMaintenanceResult(data);
      if (!result) {
        throw new Error(t("settings.database.invalid_response"));
      }

      const allItemsSucceeded = result.main.success && result.monitoring.success;
      if (result.all_succeeded && allItemsSucceeded) {
        toast.success(t("settings.database.maintenance_success"));
      } else {
        toast.warning(t("settings.database.maintenance_partial_failure"), {
          description: maintenanceFailureDescription(result, t),
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(t("settings.database.maintenance_error"), {
        description: message,
      });
    } finally {
      await fetchOverview();
      setMaintaining(false);
    }
  };

  const actionDisabled = loading || maintaining;
  const showOverview = mode === "overview";

  return (
    <SettingCard
      title={
        showOverview
          ? t("settings.storage.storage_usage")
          : t("settings.database.maintenance_title")
      }
      description={
        showOverview
          ? t("settings.storage.total_description")
          : t("settings.database.maintenance_description")
      }
    >
      <Flex direction="column" className="w-full pt-2" gap="0">
        {overview ? (
          showOverview ? (
            <>
              <StorageSummary overview={overview} />
              <DatabaseUsageTable overview={overview} />
              <DatabaseRuntimePanel info={overview.monitoring} />
            </>
          ) : (
            <Flex direction="column">
              <MaintenanceActionRow
                label={t("settings.database.main")}
                info={overview.main}
              />
              <MaintenanceActionRow
                label={t("settings.database.monitoring")}
                info={overview.monitoring}
              />
            </Flex>
          )
        ) : loading ? (
          <Text size="2" color="gray" className="py-3">
            {t("loading")}
          </Text>
        ) : null}

        {loadError ? (
          <Text size="2" color="red" className="break-words py-3">
            {loadError}
          </Text>
        ) : null}

        <Flex justify="end" className="pt-3">
          {!overview && loadError ? (
            <Button
              variant="soft"
              disabled={loading}
              onClick={() => void fetchOverview()}
            >
              <RefreshCw
                size={16}
                className={loading ? "animate-spin" : undefined}
              />
              {t("common.retry")}
            </Button>
          ) : overview && !showOverview ? (
            <Dialog.Root open={confirmOpen} onOpenChange={setConfirmOpen}>
              <Dialog.Trigger>
                <Button
                  variant="solid"
                  color="orange"
                  disabled={actionDisabled}
                >
                  <DatabaseZap size={16} />
                  {maintaining
                    ? t("settings.database.maintaining")
                    : t("settings.database.maintenance_button")}
                </Button>
              </Dialog.Trigger>
              <AppDialogContent maxWidth="520px">
                <Dialog.Title>
                  {t("settings.database.confirm_title")}
                </Dialog.Title>
                <Dialog.Description size="2">
                  {t("settings.database.confirm_description")}
                </Dialog.Description>

                <Flex direction="column" mt="3">
                  <MaintenanceActionRow
                    label={t("settings.database.main")}
                    info={overview.main}
                  />
                  <MaintenanceActionRow
                    label={t("settings.database.monitoring")}
                    info={overview.monitoring}
                  />
                </Flex>

                <Flex gap="3" mt="4" justify="end">
                  <Dialog.Close>
                    <Button variant="soft" color="gray">
                      {t("common.cancel")}
                    </Button>
                  </Dialog.Close>
                  <Button
                    variant="solid"
                    color="orange"
                    onClick={() => void handleMaintenance()}
                  >
                    <DatabaseZap size={16} />
                    {t("settings.database.maintenance_button")}
                  </Button>
                </Flex>
              </AppDialogContent>
            </Dialog.Root>
          ) : null}
        </Flex>
      </Flex>
    </SettingCard>
  );
}
