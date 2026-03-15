export type IncidentCodeRef = {
  file: string;
  line?: number;
  blame?: string;
  snippet?: string;
};

export type IncidentFeedItem = {
  id: string;
  timestamp: string;
  severity: string;
  summary: string;
  report?: string;
  rootCause?: string;
  suggestedFix?: string;
  codeRefs: IncidentCodeRef[];
  firstCodeRef: string;
  reasoningSteps: string[];
};
