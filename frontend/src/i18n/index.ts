import i18n from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { initReactI18next } from 'react-i18next'

import en from './en.json'
import hi from './hi.json'
import ta from './ta.json'

const resources = {
  en: { translation: en },
  hi: { translation: hi },
  ta: { translation: ta },
}

function flattenKeys(input: Record<string, unknown>, prefix = ''): Set<string> {
  const out = new Set<string>()
  Object.entries(input).forEach(([key, value]) => {
    const current = prefix ? `${prefix}.${key}` : key
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      flattenKeys(value as Record<string, unknown>, current).forEach((k) => out.add(k))
    } else {
      out.add(current)
    }
  })
  return out
}

function warnLocaleCompleteness() {
  if (!import.meta.env.DEV) {
    return
  }
  const base = flattenKeys(en as Record<string, unknown>)
  ;(['hi', 'ta'] as const).forEach((lng) => {
    const current = flattenKeys((lng === 'hi' ? hi : ta) as Record<string, unknown>)
    const missing = [...base].filter((key) => !current.has(key))
    if (missing.length > 0) {
      console.warn(`[i18n] ${lng} is missing ${missing.length} keys.`, missing.slice(0, 25))
    }
  })
}

if (!i18n.isInitialized) {
  warnLocaleCompleteness()
  void i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
      resources,
      fallbackLng: 'en',
      supportedLngs: ['en', 'hi', 'ta'],
      interpolation: { escapeValue: false },
      saveMissing: import.meta.env.DEV,
      missingKeyHandler: (lngs, namespace, key) => {
        if (import.meta.env.DEV) {
          console.warn(`[i18n] missing key "${key}" in ${Array.isArray(lngs) ? lngs.join(',') : lngs} (${namespace})`)
        }
      },
      detection: {
        order: ['localStorage', 'navigator'],
        lookupLocalStorage: 'gst-itc-language',
        caches: ['localStorage'],
      },
    })
}

export default i18n
