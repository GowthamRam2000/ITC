import { useTranslation } from 'react-i18next'

import { LegalDocument } from '../common/LegalDocument'

export function TermsPage() {
  const { t } = useTranslation()

  return (
    <LegalDocument
      title={t('legal.termsTitle')}
      updated={t('legal.updated')}
      points={[t('legal.tocNote'), t('legal.liability'), t('legal.freeService')]}
    />
  )
}
