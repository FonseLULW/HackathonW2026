import { initializeApp, type FirebaseApp } from "firebase/app";
import { getFirestore, type Firestore } from "firebase/firestore";

let _app: FirebaseApp | null = null;
let _db: Firestore | null = null;

export function getDb(): Firestore {
  if (_db) return _db;

  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const storageBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
  const messagingSenderId = process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID;
  const appId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID;

  console.log("[SnoopLog] Firebase init — apiKey:", apiKey ? "set" : "MISSING", "projectId:", projectId ?? "MISSING");

  if (!apiKey || !projectId) {
    throw new Error(
      `Firebase config missing: apiKey=${apiKey ? "set" : "MISSING"}, projectId=${projectId ? "set" : "MISSING"}. Set dashboard/.env.local with NEXT_PUBLIC_FIREBASE_* values.`,
    );
  }

  _app = initializeApp({
    apiKey,
    authDomain,
    projectId,
    storageBucket,
    messagingSenderId,
    appId,
  });
  _db = getFirestore(_app);
  console.log("[SnoopLog] Firestore initialized successfully for project:", projectId);
  return _db;
}
