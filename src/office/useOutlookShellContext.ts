import { useEffect, useState } from "react";
import {
  getOutlookShellContext,
  type OutlookShellContext,
} from "./getOutlookShellContext";

export function useOutlookShellContext() {
  const [context, setContext] = useState<OutlookShellContext | null>(null);
  const [hasLiveOutlookContext, setHasLiveOutlookContext] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const mailbox = window.Office?.context?.mailbox;
    const itemChangedEvent = window.Office?.EventType?.ItemChanged;

    async function refreshContext() {
      const nextContext = await getOutlookShellContext();

      if (isMounted && nextContext) {
        setContext(nextContext);
        setHasLiveOutlookContext(true);
      }
    }

    void refreshContext();

    const handleItemChanged = () => {
      void refreshContext();
    };

    if (mailbox?.addHandlerAsync && itemChangedEvent) {
      mailbox.addHandlerAsync(itemChangedEvent, handleItemChanged);
    }

    return () => {
      isMounted = false;

      if (mailbox?.removeHandlerAsync && itemChangedEvent) {
        mailbox.removeHandlerAsync(itemChangedEvent, { handler: handleItemChanged });
      }
    };
  }, []);

  return {
    currentEmailContext: context,
    hasLiveOutlookContext,
  };
}
