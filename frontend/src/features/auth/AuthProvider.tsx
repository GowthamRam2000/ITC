/* eslint-disable react-refresh/only-export-components */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react'
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithPopup,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  type User,
} from 'firebase/auth'
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore'

import { firebaseClient } from '../../services/firebase/client'

const TERMS_VERSION = 'v1.0-2026-02-28'

export interface RegisterPayload {
  name: string
  email: string
  password: string
  termsAccepted: boolean
}

interface AuthContextValue {
  user: User | null
  loading: boolean
  configured: boolean
  login: (email: string, password: string) => Promise<void>
  loginWithGoogle: (termsAccepted?: boolean) => Promise<void>
  register: (payload: RegisterPayload) => Promise<void>
  logout: () => Promise<void>
  resetPassword: (email: string) => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

function assertAuthConfigured() {
  if (!firebaseClient.configured || !firebaseClient.auth) {
    throw new Error('Firebase is not configured. Fill VITE_FIREBASE_* variables in .env.local.')
  }
}

function isFirestorePermissionError(error: unknown) {
  if (!(error instanceof Error)) {
    return false
  }
  const message = error.message.toLowerCase()
  return message.includes('permission-denied') || message.includes('missing or insufficient permissions')
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(Boolean(firebaseClient.auth))

  useEffect(() => {
    if (!firebaseClient.auth) {
      return
    }

    const unsubscribe = onAuthStateChanged(firebaseClient.auth, (nextUser) => {
      setUser(nextUser)
      setLoading(false)
    })

    return unsubscribe
  }, [])

  const upsertUserProfile = useCallback(
    async (
      inputUser: User,
      options?: {
        termsAccepted?: boolean
        displayName?: string
      },
    ) => {
      assertAuthConfigured()
      if (!firebaseClient.db) {
        return
      }
      const profileRef = doc(firebaseClient.db!, 'user_profiles', inputUser.uid)
      const snapshot = await getDoc(profileRef)
      const now = serverTimestamp()

      const payload: Record<string, unknown> = {
        uid: inputUser.uid,
        email: inputUser.email,
        displayName: options?.displayName ?? inputUser.displayName ?? '',
        lastLoginAt: now,
        preferredLanguage: localStorage.getItem('gst-itc-language') ?? 'en',
        themeMode: localStorage.getItem('gst-itc-theme-mode') ?? 'light',
      }

      if (!snapshot.exists()) {
        payload.createdAt = now
      }

      if (options?.termsAccepted) {
        payload.termsAcceptedAt = now
        payload.termsVersion = TERMS_VERSION
        payload.disclaimerAccepted = true
      }

      await setDoc(profileRef, payload, { merge: true })
    },
    [],
  )

  const syncUserProfileSafe = useCallback(
    async (
      inputUser: User,
      options?: {
        termsAccepted?: boolean
        displayName?: string
      },
    ) => {
      try {
        await upsertUserProfile(inputUser, options)
      } catch (error) {
        if (isFirestorePermissionError(error)) {
          console.warn('Skipping user profile sync because Firestore rules denied access.', error)
          return
        }
        throw error
      }
    },
    [upsertUserProfile],
  )

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      configured: firebaseClient.configured,
      login: async (email, password) => {
        assertAuthConfigured()
        const credential = await signInWithEmailAndPassword(firebaseClient.auth!, email, password)
        await syncUserProfileSafe(credential.user)
      },
      loginWithGoogle: async (termsAccepted = false) => {
        assertAuthConfigured()
        const provider = new GoogleAuthProvider()
        const credential = await signInWithPopup(firebaseClient.auth!, provider)
        await syncUserProfileSafe(credential.user, { termsAccepted })
      },
      register: async (payload) => {
        assertAuthConfigured()
        if (!payload.termsAccepted) {
          throw new Error('Terms and disclaimer must be accepted.')
        }

        const credential = await createUserWithEmailAndPassword(
          firebaseClient.auth!,
          payload.email,
          payload.password,
        )

        if (payload.name.trim().length > 0) {
          await updateProfile(credential.user, { displayName: payload.name.trim() })
        }

        await syncUserProfileSafe(credential.user, {
          termsAccepted: payload.termsAccepted,
          displayName: payload.name.trim(),
        })
      },
      logout: async () => {
        assertAuthConfigured()
        await signOut(firebaseClient.auth!)
      },
      resetPassword: async (email) => {
        assertAuthConfigured()
        await sendPasswordResetEmail(firebaseClient.auth!, email)
      },
    }),
    [loading, syncUserProfileSafe, user],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider')
  }
  return context
}
