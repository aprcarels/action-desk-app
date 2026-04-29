import { RepQueueSection } from "./RepQueueSection";
import type { RepGroupedQueueSection } from "../services/workflowSelectors";
import type { AssignmentReason } from "../types/actionDesk";

type GroupedRepQueueProps = {
  sections: RepGroupedQueueSection[];
  now: Date;
  selectedEmailId?: string;
  retryingEmailId?: string;
  currentRepId?: string;
  onSelectEmail: (emailId: string) => void;
  onTakeThread: (threadId: string, reason: AssignmentReason) => void;
  onRetryEmail: (emailId: string) => void;
};

export function GroupedRepQueue({
  sections,
  now,
  selectedEmailId,
  retryingEmailId,
  currentRepId,
  onSelectEmail,
  onTakeThread,
  onRetryEmail,
}: GroupedRepQueueProps) {
  return (
    <div style={{ display: "grid" }}>
      {sections.map((section) => (
        <RepQueueSection
          key={section.groupId}
          section={section}
          now={now}
          selectedEmailId={selectedEmailId}
          retryingEmailId={retryingEmailId}
          currentRepId={currentRepId}
          onSelectEmail={onSelectEmail}
          onTakeThread={onTakeThread}
          onRetryEmail={onRetryEmail}
        />
      ))}
    </div>
  );
}
