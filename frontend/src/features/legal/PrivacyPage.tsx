import { useTranslation } from 'react-i18next'

import { LegalDocument } from '../common/LegalDocument'

export function PrivacyPage() {
  const { t } = useTranslation()

  return (
    <LegalDocument
      title={t('legal.privacyTitle')}
      updated={t('legal.updated')}
      points={[
        t('legal.tocNote'),
        'We collect account and reconciliation usage metadata only for product operation and demo analytics.',
        'Do not upload sensitive personal data not required for GST reconciliation workflows.',
      ]}
    />
  )
}
