/* eslint-disable react-refresh/only-export-components */

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react'
import { CssBaseline, ThemeProvider, useMediaQuery } from '@mui/material'
import type { PaletteMode } from '@mui/material'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { AuthProvider } from '../features/auth/AuthProvider'
import type { AssistantLanguageMode } from '../services/api/types'
import { buildTheme } from '../theme/theme'

const THEME_KEY = 'gst-itc-theme-mode'
const LANGUAGE_KEY = 'gst-itc-language'
const AI_LANGUAGE_KEY = 'gst-itc-ai-language'

type LanguageCode = 'en' | 'hi' | 'ta'

interface AppPreferences {
  mode: PaletteMode
  toggleMode: () => void
  language: LanguageCode
  setLanguage: (language: LanguageCode) => Promise<void>
  aiLanguage: AssistantLanguageMode
  setAiLanguage: (language: AssistantLanguageMode) => void
}

const AppPreferencesContext = createContext<AppPreferences | null>(null)

function detectMode(prefersDarkMode: boolean): PaletteMode {
  const saved = localStorage.getItem(THEME_KEY)
  if (saved === 'light' || saved === 'dark') {
    return saved
  }
  return prefersDarkMode ? 'dark' : 'light'
}

function detectLanguage(): LanguageCode {
  const saved = localStorage.getItem(LANGUAGE_KEY)
  if (saved === 'en' || saved === 'hi' || saved === 'ta') {
    return saved
  }
  return 'en'
}

function detectAiLanguage(): AssistantLanguageMode {
  const saved = localStorage.getItem(AI_LANGUAGE_KEY)
  if (
    saved === 'auto' ||
    saved === 'en' ||
    saved === 'hi' ||
    saved === 'hinglish' ||
    saved === 'ta' ||
    saved === 'tanglish'
  ) {
    return saved
  }
  return 'auto'
}

export function AppProviders({ children }: PropsWithChildren) {
  const prefersDarkMode = useMediaQuery('(prefers-color-scheme: dark)')
  const [queryClient] = useState(() => new QueryClient())
  const [mode, setMode] = useState<PaletteMode>(() => detectMode(prefersDarkMode))
  const [language, setLanguageState] = useState<LanguageCode>(() => detectLanguage())
  const [aiLanguage, setAiLanguageState] = useState<AssistantLanguageMode>(() => detectAiLanguage())
  const { i18n } = useTranslation()

  const theme = useMemo(() => buildTheme(mode), [mode])

  useEffect(() => {
    void i18n.changeLanguage(language)
  }, [i18n, language])

  const value = useMemo<AppPreferences>(
    () => ({
      mode,
      toggleMode: () => {
        setMode((previous) => {
          const next = previous === 'light' ? 'dark' : 'light'
          localStorage.setItem(THEME_KEY, next)
          return next
        })
      },
      language,
      setLanguage: async (nextLanguage) => {
        setLanguageState(nextLanguage)
        localStorage.setItem(LANGUAGE_KEY, nextLanguage)
        await i18n.changeLanguage(nextLanguage)
      },
      aiLanguage,
      setAiLanguage: (nextLanguage) => {
        setAiLanguageState(nextLanguage)
        localStorage.setItem(AI_LANGUAGE_KEY, nextLanguage)
      },
    }),
    [aiLanguage, i18n, language, mode],
  )

  return (
    <QueryClientProvider client={queryClient}>
      <AppPreferencesContext.Provider value={value}>
        <ThemeProvider theme={theme}>
          <CssBaseline />
          <AuthProvider>{children}</AuthProvider>
        </ThemeProvider>
      </AppPreferencesContext.Provider>
    </QueryClientProvider>
  )
}

export function useAppPreferences() {
  const context = useContext(AppPreferencesContext)
  if (!context) {
    throw new Error('useAppPreferences must be used inside AppProviders')
  }
  return context
}
