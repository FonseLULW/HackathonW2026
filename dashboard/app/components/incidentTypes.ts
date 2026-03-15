export type IncidentCodeRef = {
  file: string;
  line?: number;
  blame?: string;
  snippet?: string;
};

export type IncidentContextEvent = {
  id: string;
  level?: string;
  message?: string;
  score?: number;
  tier?: string;
};

export type IncidentFeedItem = {
  id: string;
  correlationKey?: string;
  timestamp: string;
  firstSeenTimestamp?: string;
  lastSeenTimestamp?: string;
  source?: string;
  severity: string;
  summary: string;
  report?: string;
  rootCause?: string;
  suggestedFix?: string;
  investigationReason?: string;
  investigationUrgency?: string;
  logCount?: number;
  occurrenceCount?: number;
  triggerCount?: number;
  relatedLogIds: string[];
  primaryLogId?: string;
  primaryEvent?: IncidentContextEvent;
  contextEvents: IncidentContextEvent[];
  codeRefs: IncidentCodeRef[];
  firstCodeRef: string;
  reasoningSteps: string[];
};
