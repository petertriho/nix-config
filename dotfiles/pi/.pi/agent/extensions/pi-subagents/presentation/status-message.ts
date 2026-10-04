import {
  capStatusLines, formatStatusAggregate, formatTransitionLine,
  type StatusSnapshot, type SubagentStatusKind, type SubagentStatusTransition,
} from "../telemetry/status.ts";

export interface StatusTransitionItem {
  name: string;
  kind: SubagentStatusKind;
  transition: Exclude<SubagentStatusTransition, null>;
  elapsedText: string;
  activityLabel?: string;
  activeScope?: string;
  activeDurationText?: string;
  waitingDurationText?: string;
  snapshotProblemText?: string;
  statusLabel?: string;
}

export interface StatusTransitionRecord {
  name: string;
  snapshot: StatusSnapshot;
  transition: Exclude<SubagentStatusTransition, null>;
}

function toStatusTransitionItem(record: StatusTransitionRecord): StatusTransitionItem {
  const { name, snapshot, transition } = record;
  return {
    name,
    kind: snapshot.kind,
    transition,
    elapsedText: snapshot.elapsedText,
    ...(snapshot.activityLabel ? { activityLabel: snapshot.activityLabel } : {}),
    ...(snapshot.activeScope ? { activeScope: snapshot.activeScope } : {}),
    ...(snapshot.activeDurationText ? { activeDurationText: snapshot.activeDurationText } : {}),
    ...(snapshot.waitingDurationText ? { waitingDurationText: snapshot.waitingDurationText } : {}),
    ...(snapshot.snapshotProblemText ? { snapshotProblemText: snapshot.snapshotProblemText } : {}),
    ...(snapshot.statusLabel ? { statusLabel: snapshot.statusLabel } : {}),
  };
}

export function buildStatusRefreshMessage(
  transitions: StatusTransitionRecord[],
  lineLimit: number,
): {
  content: string;
  details: {
    lines: string[];
    items: StatusTransitionItem[];
    overflow: number;
  };
} {
  const lines = transitions.map(({ name, snapshot, transition }) =>
    formatTransitionLine(name, snapshot, transition)
  );
  const capped = capStatusLines(lines, lineLimit);
  return {
    content: formatStatusAggregate(lines, lineLimit),
    details: {
      lines: capped.visibleLines,
      items: transitions.slice(0, capped.visibleLines.length).map(toStatusTransitionItem),
      overflow: capped.overflow,
    },
  };
}
