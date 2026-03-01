import { initializeApp, type FirebaseApp } from 'firebase/app'
import { getAuth, type Auth } from 'firebase/auth'
import { getFirestore, type Firestore } from 'firebase/firestore'

export interface FirebaseClient {
  app: FirebaseApp | null
  auth: Auth | null
  db: Firestore | null
  configured: boolean
}

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

const configured = Object.values(firebaseConfig).every((value) => typeof value === 'string' && value.length > 0)

let app: FirebaseApp | null = null
let auth: Auth | null = null
let db: Firestore | null = null

if (configured) {
  app = initializeApp(firebaseConfig)
  auth = getAuth(app)
  db = getFirestore(app)
}

export const firebaseClient: FirebaseClient = {
  app,
  auth,
  db,
  configured,
}
