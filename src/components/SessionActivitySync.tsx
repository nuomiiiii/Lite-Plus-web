import { useEffect } from "react";

import { useAccount } from "@/contexts/AccountContext";
import { clearAdminNodeLiveDataCache } from "@/hooks/use-admin-node-live-data";
import { subscribeSessionTouch, useSessionActivity } from "@/hooks/useSessionActivity";

export default function SessionActivitySync() {
  const { account, refresh } = useAccount();
  useSessionActivity(Boolean(account?.logged_in));

  useEffect(() => {
    if (account && !account.logged_in) {
      clearAdminNodeLiveDataCache();
    }
  }, [account]);

  useEffect(() => {
    return subscribeSessionTouch((payload) => {
      if (payload.expired) {
        clearAdminNodeLiveDataCache();
        void refresh();
      }
    });
  }, [refresh]);

  return null;
}
