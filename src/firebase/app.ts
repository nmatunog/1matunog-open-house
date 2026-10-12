import { initializeApp, type FirebaseApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, type Auth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore, type Firestore } from 'firebase/firestore';
import { firebaseConfigReady, readFirebaseWebConfig } from './config';

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;
let emulatorsBound = false;

export function getFirebase(): { app: FirebaseApp; auth: Auth; db: Firestore } {
  if (app && auth && db) return { app, auth, db };
  const cfg = readFirebaseWebConfig();
  if (!firebaseConfigReady(cfg)) {
    throw new Error('Firebase web config is missing. Copy .env.example to .env.local and fill it in.');
  }
  app = initializeApp(cfg);
  auth = getAuth(app);
  db = getFirestore(app);
  if (import.meta.env.VITE_USE_EMULATORS === 'true' && !emulatorsBound) {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    connectFirestoreEmulator(db, '127.0.0.1', 8080);
    emulatorsBound = true;
  }
  return { app, auth, db };
}
