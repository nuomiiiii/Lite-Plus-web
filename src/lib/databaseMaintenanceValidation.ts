export type MaintenanceAction = "vacuum" | "optimize" | "vacuum_full";
export type DatabaseLocation = "local" | "external";

export type DatabaseFiles = {
  database: number;
  wal: number;
  shm: number;
};

export type DigestHandoffStatus = {
  metric: string;
  reason: string;
  at: string | null;
};

export type DatabaseRuntimeStatus = {
  compacting: boolean;
  current_metric: string;
  progress: number;
  total: number;
  cycle_written: number;
  cycle_started_at: string | null;
  last_step_at: string | null;
  last_cycle_completed_at: string | null;
  checkpoint_applicable: boolean;
  last_checkpoint_attempt_at: string | null;
  last_checkpoint_success_at: string | null;
  next_checkpoint_at: string | null;
  checkpoint_pending: boolean;
  consecutive_checkpoint_failures: number;
  consecutive_cycle_failures: number;
  last_error?: string;
  digest_handoff_deferred: DigestHandoffStatus[];
};

export type DatabaseInfo = {
  driver: string;
  location: DatabaseLocation;
  size: number | null;
  files?: DatabaseFiles;
  runtime?: DatabaseRuntimeStatus;
  action: MaintenanceAction;
  error?: string;
};

export type DatabaseOverview = {
  main: DatabaseInfo;
  monitoring: DatabaseInfo;
  local_total: number | null;
};

export type DatabaseMaintenanceItem = {
  driver: string;
  action: MaintenanceAction;
  before: number | null;
  after: number | null;
  success: boolean;
  error?: string;
  size_error?: string;
};

export type DatabaseMaintenanceResult = {
  all_succeeded: boolean;
  main: DatabaseMaintenanceItem;
  monitoring: DatabaseMaintenanceItem;
};

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMaintenanceAction(value: unknown): value is MaintenanceAction {
  return value === "vacuum" || value === "optimize" || value === "vacuum_full";
}

function isNonNegativeFinite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isNonNegativeInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function parseNullableSize(
  value: unknown,
): { ok: true; value: number | null } | { ok: false } {
  if (value === null) return { ok: true, value: null };
  if (isNonNegativeFinite(value)) return { ok: true, value };
  return { ok: false };
}

function parseNullableTimestamp(
  value: unknown,
): { ok: true; value: string | null } | { ok: false } {
  if (value === null) return { ok: true, value: null };
  if (typeof value === "string" && !Number.isNaN(Date.parse(value))) {
    return { ok: true, value };
  }
  return { ok: false };
}

function parseDatabaseFiles(value: unknown): DatabaseFiles | null {
  if (!isPlainObject(value)) return null;
  if (
    !isNonNegativeFinite(value.database) ||
    !isNonNegativeFinite(value.wal) ||
    !isNonNegativeFinite(value.shm)
  ) {
    return null;
  }
  return {
    database: value.database,
    wal: value.wal,
    shm: value.shm,
  };
}

function parseDigestHandoffStatus(value: unknown): DigestHandoffStatus | null {
  if (!isPlainObject(value)) return null;
  if (typeof value.metric !== "string" || typeof value.reason !== "string") {
    return null;
  }
  const at = parseNullableTimestamp(value.at);
  if (!at.ok) return null;
  return {
    metric: value.metric,
    reason: value.reason,
    at: at.value,
  };
}

function parseDatabaseRuntimeStatus(value: unknown): DatabaseRuntimeStatus | null {
  if (!isPlainObject(value)) return null;
  if (
    typeof value.compacting !== "boolean" ||
    typeof value.current_metric !== "string" ||
    !isNonNegativeInt(value.progress) ||
    !isNonNegativeInt(value.total) ||
    !isNonNegativeInt(value.cycle_written) ||
    typeof value.checkpoint_applicable !== "boolean" ||
    typeof value.checkpoint_pending !== "boolean" ||
    !isNonNegativeInt(value.consecutive_checkpoint_failures) ||
    !isNonNegativeInt(value.consecutive_cycle_failures)
  ) {
    return null;
  }
  if (value.last_error !== undefined && typeof value.last_error !== "string") {
    return null;
  }
  const cycleStarted = parseNullableTimestamp(value.cycle_started_at);
  const lastStep = parseNullableTimestamp(value.last_step_at);
  const lastCompleted = parseNullableTimestamp(value.last_cycle_completed_at);
  const lastAttempt = parseNullableTimestamp(value.last_checkpoint_attempt_at);
  const lastSuccess = parseNullableTimestamp(value.last_checkpoint_success_at);
  const nextCheckpoint = parseNullableTimestamp(value.next_checkpoint_at);
  if (
    !cycleStarted.ok ||
    !lastStep.ok ||
    !lastCompleted.ok ||
    !lastAttempt.ok ||
    !lastSuccess.ok ||
    !nextCheckpoint.ok
  ) {
    return null;
  }

  const deferred: DigestHandoffStatus[] = [];
  if (
    value.digest_handoff_deferred !== undefined &&
    value.digest_handoff_deferred !== null
  ) {
    if (!Array.isArray(value.digest_handoff_deferred)) return null;
    for (const item of value.digest_handoff_deferred) {
      const parsedItem = parseDigestHandoffStatus(item);
      if (!parsedItem) return null;
      deferred.push(parsedItem);
    }
  }

  return {
    compacting: value.compacting,
    current_metric: value.current_metric,
    progress: value.progress,
    total: value.total,
    cycle_written: value.cycle_written,
    cycle_started_at: cycleStarted.value,
    last_step_at: lastStep.value,
    last_cycle_completed_at: lastCompleted.value,
    checkpoint_applicable: value.checkpoint_applicable,
    last_checkpoint_attempt_at: lastAttempt.value,
    last_checkpoint_success_at: lastSuccess.value,
    next_checkpoint_at: nextCheckpoint.value,
    checkpoint_pending: value.checkpoint_pending,
    consecutive_checkpoint_failures: value.consecutive_checkpoint_failures,
    consecutive_cycle_failures: value.consecutive_cycle_failures,
    ...(value.last_error !== undefined ? { last_error: value.last_error } : {}),
    digest_handoff_deferred: deferred,
  };
}

function parseDatabaseInfo(value: unknown): DatabaseInfo | null {
  if (!isPlainObject(value)) return null;
  if (typeof value.driver !== "string") return null;
  const driver = value.driver.trim();
  if (!driver) return null;
  if (value.location !== "local" && value.location !== "external") return null;
  const size = parseNullableSize(value.size);
  if (!size.ok) return null;
  if (!isMaintenanceAction(value.action)) return null;
  if (value.error !== undefined && typeof value.error !== "string") return null;

  let files: DatabaseFiles | undefined;
  if (value.files !== undefined) {
    const parsedFiles = parseDatabaseFiles(value.files);
    if (!parsedFiles) return null;
    files = parsedFiles;
  }

  let runtime: DatabaseRuntimeStatus | undefined;
  if (value.runtime !== undefined) {
    const parsedRuntime = parseDatabaseRuntimeStatus(value.runtime);
    if (!parsedRuntime) return null;
    runtime = parsedRuntime;
  }

  return {
    driver,
    location: value.location,
    size: size.value,
    ...(files !== undefined ? { files } : {}),
    ...(runtime !== undefined ? { runtime } : {}),
    action: value.action,
    ...(value.error !== undefined ? { error: value.error } : {}),
  };
}

export function parseDatabaseOverview(value: unknown): DatabaseOverview | null {
  if (!isPlainObject(value)) return null;
  const main = parseDatabaseInfo(value.main);
  const monitoring = parseDatabaseInfo(value.monitoring);
  const localTotal = parseNullableSize(value.local_total);
  if (!main || !monitoring || !localTotal.ok) return null;
  return {
    main,
    monitoring,
    local_total: localTotal.value,
  };
}

function parseMaintenanceItem(value: unknown): DatabaseMaintenanceItem | null {
  if (!isPlainObject(value)) return null;
  if (typeof value.driver !== "string") return null;
  const driver = value.driver.trim();
  if (!driver) return null;
  if (!isMaintenanceAction(value.action)) return null;
  const before = parseNullableSize(value.before);
  const after = parseNullableSize(value.after);
  if (!before.ok || !after.ok) return null;
  if (typeof value.success !== "boolean") return null;
  if (value.error !== undefined && typeof value.error !== "string") return null;
  if (value.size_error !== undefined && typeof value.size_error !== "string") {
    return null;
  }
  return {
    driver,
    action: value.action,
    before: before.value,
    after: after.value,
    success: value.success,
    ...(value.error !== undefined ? { error: value.error } : {}),
    ...(value.size_error !== undefined ? { size_error: value.size_error } : {}),
  };
}

export function parseMaintenanceResult(
  value: unknown,
): DatabaseMaintenanceResult | null {
  if (!isPlainObject(value)) return null;
  if (typeof value.all_succeeded !== "boolean") return null;
  const main = parseMaintenanceItem(value.main);
  const monitoring = parseMaintenanceItem(value.monitoring);
  if (!main || !monitoring) return null;
  return {
    all_succeeded: value.all_succeeded,
    main,
    monitoring,
  };
}
