import { useEffect, useRef, useState } from "react";
import {
  filterProcessedEmails,
  getIntentOptions,
  processEmails,
  refreshProcessedEmail,
} from "./app/processEmails";
import { runActionDesk } from "./app/runActionDesk";
import { EmailDetail } from "./components/EmailDetail";
import { InboxQueue } from "./components/InboxQueue";
import { mockEmails } from "./data/mockEmails";
import type { ProcessedEmail } from "./types/actionDesk";

export default function App() {
  const [queueItems, setQueueItems] = useState<ProcessedEmail[]>([]);
  const [selectedEmailId, setSelectedEmailId] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [replyActionError, setReplyActionError] = useState<string | null>(null);
  const [copyFeedback, setCopyFeedback] = useState<"idle" | "success" | "error">("idle");
  const [regeneratingReply, setRegeneratingReply] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [urgencyFilter, setUrgencyFilter] = useState<"all" | "high" | "medium" | "low">("all");
  const [intentFilter, setIntentFilter] = useState("all");
  const copyFeedbackTimeoutRef = useRef<number | null>(null);

  function resetCopyFeedbackWithDelay(nextState: "success" | "error") {
    if (copyFeedbackTimeoutRef.current !== null) {
      window.clearTimeout(copyFeedbackTimeoutRef.current);
    }

    setCopyFeedback(nextState);
    copyFeedbackTimeoutRef.current = window.setTimeout(() => {
      setCopyFeedback("idle");
      copyFeedbackTimeoutRef.current = null;
    }, 2500);
  }

  useEffect(() => {
    let isMounted = true;

    async function loadQueue() {
      setLoading(true);
      setLoadError(null);

      try {
        const processedQueue = await processEmails(mockEmails);

        if (!isMounted) {
          return;
        }

        setQueueItems(processedQueue);
        setSelectedEmailId(processedQueue[0]?.email.id);
      } catch {
        if (isMounted) {
          setQueueItems([]);
          setSelectedEmailId(undefined);
          setLoadError("The inbox queue could not be processed. Please refresh and try again.");
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    void loadQueue();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (copyFeedbackTimeoutRef.current !== null) {
        window.clearTimeout(copyFeedbackTimeoutRef.current);
      }
    };
  }, []);

  async function handleCopyReply() {
    const selectedItem = filteredQueueItems.find((item) => item.email.id === selectedEmailId);

    if (!selectedItem) {
      return;
    }

    setReplyActionError(null);

    if (!navigator.clipboard?.writeText) {
      resetCopyFeedbackWithDelay("error");
      return;
    }

    try {
      await navigator.clipboard.writeText(selectedItem.result.replyDraft);
      resetCopyFeedbackWithDelay("success");
    } catch {
      resetCopyFeedbackWithDelay("error");
    }
  }

  async function handleRegenerateReply() {
    const selectedItem = queueItems.find((item) => item.email.id === selectedEmailId);

    if (!selectedItem) {
      return;
    }

    setRegeneratingReply(true);
    setCopyFeedback("idle");
    setReplyActionError(null);

    try {
      const nextResult = await runActionDesk(selectedItem.email.body);

      setQueueItems((currentItems) =>
        refreshProcessedEmail(currentItems, selectedItem.email.id, nextResult),
      );
    } catch {
      setReplyActionError(
        "The reply could not be regenerated right now. Please try again.",
      );
    } finally {
      setRegeneratingReply(false);
    }
  }

  const intentOptions = getIntentOptions(queueItems);
  const filteredQueueItems = filterProcessedEmails(queueItems, {
    searchQuery,
    urgency: urgencyFilter,
    intent: intentFilter,
  });

  useEffect(() => {
    if (filteredQueueItems.length === 0) {
      setSelectedEmailId(undefined);
      return;
    }

    const hasSelectedVisible = filteredQueueItems.some((item) => item.email.id === selectedEmailId);

    if (!hasSelectedVisible) {
      setSelectedEmailId(filteredQueueItems[0].email.id);
      setCopyFeedback("idle");
      setReplyActionError(null);
    }
  }, [filteredQueueItems, selectedEmailId]);

  const selectedItem = filteredQueueItems.find((item) => item.email.id === selectedEmailId);

  const pageStyle: React.CSSProperties = {
    minHeight: "100vh",
    margin: 0,
    backgroundColor: "#f3f6fb",
    color: "#1f2937",
    fontFamily: "Arial, sans-serif",
  };

  const shellStyle: React.CSSProperties = {
    maxWidth: "1280px",
    margin: "0 auto",
    padding: "32px 20px 40px",
    boxSizing: "border-box",
  };

  const headerStyle: React.CSSProperties = {
    marginBottom: "24px",
  };

  const titleStyle: React.CSSProperties = {
    margin: 0,
    fontSize: "32px",
    fontWeight: 700,
    color: "#0f172a",
  };

  const subtitleStyle: React.CSSProperties = {
    margin: "8px 0 0",
    fontSize: "15px",
    color: "#475569",
  };

  const layoutStyle: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "360px minmax(0, 1fr)",
    gap: "20px",
    alignItems: "start",
  };

  const statusCardStyle: React.CSSProperties = {
    backgroundColor: "#ffffff",
    border: "1px solid #d8e1ec",
    borderRadius: "16px",
    padding: "20px",
    boxShadow: "0 10px 30px rgba(15, 23, 42, 0.06)",
  };

  if (loading) {
    return (
      <div style={pageStyle}>
        <div style={shellStyle}>
          <div style={headerStyle}>
            <h1 style={titleStyle}>Action Desk</h1>
            <p style={subtitleStyle}>Inbox Queue MVP</p>
          </div>

          <div style={statusCardStyle}>
            Processing inbox emails and generating AI analysis.
          </div>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div style={pageStyle}>
        <div style={shellStyle}>
          <div style={headerStyle}>
            <h1 style={titleStyle}>Action Desk</h1>
            <p style={subtitleStyle}>Inbox Queue MVP</p>
          </div>

          <div style={statusCardStyle}>{loadError}</div>
        </div>
      </div>
    );
  }

  return (
    <div style={pageStyle}>
      <div style={shellStyle}>
        <div style={headerStyle}>
          <h1 style={titleStyle}>Action Desk</h1>
          <p style={subtitleStyle}>
            Inbox Queue MVP for customer support triage, analysis, and reply drafting
          </p>
        </div>

        <div style={layoutStyle}>
          <InboxQueue
            items={filteredQueueItems}
            totalCount={queueItems.length}
            selectedEmailId={selectedEmailId}
            searchQuery={searchQuery}
            urgencyFilter={urgencyFilter}
            intentFilter={intentFilter}
            intentOptions={intentOptions}
            onSelectEmail={(emailId) => {
              setSelectedEmailId(emailId);
              setCopyFeedback("idle");
              setReplyActionError(null);
            }}
            onSearchQueryChange={setSearchQuery}
            onUrgencyFilterChange={setUrgencyFilter}
            onIntentFilterChange={setIntentFilter}
          />

          <EmailDetail
            item={selectedItem}
            copyFeedback={copyFeedback}
            regeneratingReply={regeneratingReply}
            replyActionError={replyActionError}
            onCopyReply={handleCopyReply}
            onRegenerateReply={handleRegenerateReply}
          />
        </div>
      </div>
    </div>
  );
}
