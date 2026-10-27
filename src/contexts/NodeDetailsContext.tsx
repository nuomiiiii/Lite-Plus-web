import React from "react";
import { useAccount } from "@/contexts/AccountContext";
import { isAdminNodeBootstrapLoading } from "@/utils/adminAuth";
import { omitClientTokenFromNode } from "@/lib/clientToken";
import { prefetchNodeFlags } from "@/components/Flag";

export type NodeDetail = {
  uuid: string;
  name: string;
  cpu_name: string;
  virtualization: string;
  arch: string;
  cpu_cores: number;
  os: string;
  gpu_name: string;
  ipv4: string;
  ipv6: string;
  region: string;
  region_override: string;
  mem_total: number;
  swap_total: number;
  disk_total: number;
  version: string;
  deployment_status?: "" | "saved" | "sent" | "applied" | "failed";
  weight: number;
  price: number;
  remark: string | undefined;
  public_remark: string;
  remote_protocol?: number;
  remote_control_enabled?: boolean;
  mcp_full?: boolean;
  mcp_full_version?: number;
  traffic_reset_day?: number | null;
  traffic_reset_time?: string;
  traffic_reset_timezone?: string;
  traffic_reset_allowance: number;
  effective_traffic_limit: number;
  effective_traffic_type: "sum" | "max" | "min" | "up" | "down";
  group: string | undefined;
  tags?: string;
  billing_cycle: number;
  expired_at: string;
  expiry_timezone?: string;
  created_at: string;
  updated_at: string;
  [key: string]: any; 
};

interface NodeDetailsContextType {
  nodeDetail: NodeDetail[];
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
}
const NodeDetailsContext = React.createContext<NodeDetailsContextType | undefined>(undefined);
const PREAUTHENTICATED_NODE_DATA = "__preauthenticated__";

declare global {
  interface ObjectConstructor {
    hasOwn(object: object, property: PropertyKey): boolean;
  }
}

function hasDeploymentStatus(node: NodeDetail): boolean {
  return typeof Object.hasOwn === "function"
    ? Object.hasOwn(node, "deployment_status")
    : Object.prototype.hasOwnProperty.call(node, "deployment_status");
}

async function hydrateLegacyDeploymentStatuses(nodes: NodeDetail[]) {
  if (nodes.every(hasDeploymentStatus)) {
    return nodes;
  }
  return Promise.all(nodes.map(async (node) => {
    if (hasDeploymentStatus(node)) return node;
    try {
      const response = await fetch(`/api/admin/client/${node.uuid}/deployment-profile`, {
        cache: "no-store",
      });
      if (!response.ok) return { ...node, deployment_status: "" as const };
      const result = await response.json();
      const status = result?.saved ? result?.delivery_state?.status || "saved" : "";
      return { ...node, deployment_status: status };
    } catch {
      return { ...node, deployment_status: "" as const };
    }
  }));
}

const NodeDetailsProviderValue: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { account, loading: accountLoading } = useAccount();
  const [nodeDetail, setNodeDetail] = React.useState<NodeDetail[]>([]);
  const [loadedAccount, setLoadedAccount] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const requestSequence = React.useRef(0);
  const activeRequestAccount = React.useRef<string | null>(null);
  const accountKey = account?.logged_in
    ? account.uuid || "__authenticated__"
    : null;
  const isLoading = isAdminNodeBootstrapLoading(
    accountLoading,
    accountKey,
    loadedAccount,
    loadedAccount === PREAUTHENTICATED_NODE_DATA,
  );

  const load = React.useCallback((targetAccount: string) => {
    const sequence = ++requestSequence.current;
    activeRequestAccount.current = targetAccount;
    setError(null);

    fetch("/api/admin/client/list", { cache: "no-store" })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Failed to fetch node details (${response.status})`);
        }
        return response.json();
      })
      .then(async (data: NodeDetail[]) => {
        if (sequence !== requestSequence.current) return;
        if (!Array.isArray(data)) {
          throw new Error("Invalid node details response");
        }
        prefetchNodeFlags(data);
        const nodes = (await hydrateLegacyDeploymentStatuses(data)).map(
          omitClientTokenFromNode,
        );
        if (sequence !== requestSequence.current) return;
        setNodeDetail(nodes);
        setLoadedAccount(targetAccount);
      })
      .catch((error: unknown) => {
        if (sequence !== requestSequence.current) return;
        setNodeDetail([]);
        setError(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        if (sequence === requestSequence.current) {
          activeRequestAccount.current = null;
        }
      });
  }, []);

  const refresh = React.useCallback(() => {
    if (accountKey) load(accountKey);
  }, [accountKey, load]);

  React.useEffect(() => {
    if (accountLoading || !account?.logged_in || !accountKey) {
      if (!accountLoading && !account?.logged_in) {
        requestSequence.current += 1;
        activeRequestAccount.current = null;
        setNodeDetail([]);
        setError(null);
        setLoadedAccount(null);
      }
      return;
    }

    if (loadedAccount === PREAUTHENTICATED_NODE_DATA) {
      setLoadedAccount(accountKey);
      return;
    }
    if (loadedAccount !== accountKey) {
      load(accountKey);
    }
  }, [account?.logged_in, accountKey, accountLoading, load, loadedAccount]);

  const value = React.useMemo(
    () => ({ nodeDetail, isLoading, error, refresh }),
    [nodeDetail, isLoading, error, refresh],
  );

  return (
    <NodeDetailsContext.Provider value={value}>
      {children}
    </NodeDetailsContext.Provider>
  );
};

export const NodeDetailsProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const inherited = React.useContext(NodeDetailsContext);
  return inherited ? children : (
    <NodeDetailsProviderValue>{children}</NodeDetailsProviderValue>
  );
};

export const useNodeDetails = () => {
    const context = React.useContext(NodeDetailsContext);
    if (context === undefined) {
        throw new Error("useNodeDetails must be used within a NodeDetailsProvider");
    }
    return context;
};
