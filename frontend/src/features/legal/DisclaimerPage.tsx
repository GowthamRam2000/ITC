import { useTranslation } from 'react-i18next'

import { LegalDocument } from '../common/LegalDocument'

export function DisclaimerPage() {
  const { t } = useTranslation()

  return (
    <LegalDocument
      title={t('legal.disclaimerTitle')}
      updated={t('legal.updated')}
      points={[
        t('legal.tocNote'),
        t('legal.liability'),
        t('legal.freeService'),
        'Always verify GST compliance outcomes with a qualified CA before filing.',
      ]}
    />
  )
}
