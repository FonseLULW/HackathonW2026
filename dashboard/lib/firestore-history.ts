import { getDb } from "./firebase";
import {
  collection,
  query,
  orderBy,
  limit,
  doc,
  onSnapshot,
  type Unsubscribe,
} from "firebase/firestore";

export function subscribeToLogs(
  callback: (logs: unknown[]) => void,
  max = 200,
): Unsubscribe {
  const db = getDb();
  const q = query(
    collection(db, "snooplog-logs"),
    orderBy("timestamp", "desc"),
    limit(max),
  );
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => d.data()).reverse());
  });
}

export function subscribeToIncidents(
  callback: (incidents: unknown[]) => void,
  max = 50,
): Unsubscribe {
  const db = getDb();
  const q = query(
    collection(db, "snooplog-incidents"),
    orderBy("timestamp", "desc"),
    limit(max),
  );
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => d.data()));
  });
}

export function subscribeToAgentCalls(
  callback: (calls: unknown[]) => void,
  max = 60,
): Unsubscribe {
  const db = getDb();
  const q = query(
    collection(db, "snooplog-agent-calls"),
    orderBy("timestamp", "desc"),
    limit(max),
  );
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => d.data()).reverse());
  });
}

export function subscribeToStats(
  callback: (stats: Record<string, unknown> | null) => void,
): Unsubscribe {
  const db = getDb();
  const ref = doc(db, "snooplog-stats", "current");
  return onSnapshot(ref, (snap) => {
    callback(snap.exists() ? (snap.data() as Record<string, unknown>) : null);
  });
}
