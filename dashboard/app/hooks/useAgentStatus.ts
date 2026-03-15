"use client";

import { useEffect, useState } from "react";
import { useLiveData } from "../components/live-data";

export type AgentStatus = "investigating" | "dormant";

const IDLE_THRESHOLD_MS = 30_000;
const POLL_INTERVAL_MS = 5_000;

export function useAgentStatus(): AgentStatus {
  const { agentCalls } = useLiveData();
  const [status, setStatus] = useState<AgentStatus>("dormant");

  useEffect(() => {
    const evaluate = () => {
      if (agentCalls.length === 0) {
        setStatus("dormant");
        return;
      }
      const lastTimestamp = new Date(
        agentCalls[agentCalls.length - 1].timestamp,
      ).getTime();
      if (Number.isNaN(lastTimestamp)) {
        setStatus("dormant");
        return;
      }
      const elapsed = Date.now() - lastTimestamp;
      setStatus(elapsed < IDLE_THRESHOLD_MS ? "investigating" : "dormant");
    };

    evaluate();
    const timer = setInterval(evaluate, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [agentCalls]);

  return status;
}
