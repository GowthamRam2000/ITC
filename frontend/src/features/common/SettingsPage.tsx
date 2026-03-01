import {
  Card,
  CardContent,
  Container,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Switch,
  Typography,
} from '@mui/material'
import { useTranslation } from 'react-i18next'

import type { AssistantLanguageMode } from '../../services/api/types'
import { useAppPreferences } from '../../app/providers'

export function SettingsPage() {
  const { t } = useTranslation()
  const { mode, toggleMode, aiLanguage, setAiLanguage } = useAppPreferences()

  return (
    <Container maxWidth="md" sx={{ py: { xs: 3, md: 4 } }}>
      <Stack spacing={2}>
        <Typography variant="h4">{t('settings.title')}</Typography>
        <Typography color="text.secondary">{t('settings.description')}</Typography>

        <Card>
          <CardContent>
            <FormControlLabel
              control={<Switch checked={mode === 'dark'} onChange={toggleMode} />}
              label={`${t('settings.mode')}: ${mode === 'dark' ? t('common.dark') : t('common.light')}`}
            />
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <FormControl size="small" fullWidth>
              <InputLabel>{t('settings.assistantLanguage')}</InputLabel>
              <Select
                label={t('settings.assistantLanguage')}
                value={aiLanguage}
                onChange={(event) => setAiLanguage(event.target.value as AssistantLanguageMode)}
              >
                <MenuItem value="auto">{t('settings.auto')}</MenuItem>
                <MenuItem value="en">{t('common.english')}</MenuItem>
                <MenuItem value="hi">{t('common.hindi')}</MenuItem>
                <MenuItem value="hinglish">{t('settings.hinglish')}</MenuItem>
                <MenuItem value="ta">{t('common.tamil')}</MenuItem>
                <MenuItem value="tanglish">{t('settings.tanglish')}</MenuItem>
              </Select>
            </FormControl>
          </CardContent>
        </Card>
      </Stack>
    </Container>
  )
}
