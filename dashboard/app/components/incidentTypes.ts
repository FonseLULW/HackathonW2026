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
  timestamp: string;
  source?: string;
  severity: string;
  summary: string;
  report?: string;
  rootCause?: string;
  suggestedFix?: string;
  investigationReason?: string;
  investigationUrgency?: string;
  logCount?: number;
  relatedLogIds: string[];
  primaryLogId?: string;
  primaryEvent?: IncidentContextEvent;
  contextEvents: IncidentContextEvent[];
  codeRefs: IncidentCodeRef[];
  firstCodeRef: string;
  reasoningSteps: string[];
};
