import { useState } from 'react'
import { DarkMode, Translate, WbSunny } from '@mui/icons-material'
import {
  AppBar,
  Box,
  Button,
  IconButton,
  Menu,
  MenuItem,
  Stack,
  Toolbar,
  Typography,
} from '@mui/material'
import { useTranslation } from 'react-i18next'
import { Link as RouterLink, Outlet } from 'react-router-dom'

import { useAppPreferences } from '../../app/providers'

export function PublicLayout() {
  const { t } = useTranslation()
  const { mode, toggleMode, language, setLanguage } = useAppPreferences()
  const [anchor, setAnchor] = useState<null | HTMLElement>(null)

  return (
    <Box minHeight="100vh">
      <AppBar position="sticky" color="transparent" sx={{ borderBottom: (theme) => `1px solid ${theme.palette.divider}` }}>
        <Toolbar>
          <Typography component={RouterLink} to="/" variant="h6" sx={{ textDecoration: 'none', color: 'inherit', fontWeight: 800 }}>
            {t('app.name')}
          </Typography>
          <Box sx={{ flexGrow: 1 }} />

          <Stack direction="row" spacing={1} alignItems="center">
            <IconButton onClick={(event) => setAnchor(event.currentTarget)}>
              <Translate />
            </IconButton>
            <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
              <MenuItem
                selected={language === 'en'}
                onClick={() => {
                  void setLanguage('en')
                  setAnchor(null)
                }}
              >
                {t('common.english')}
              </MenuItem>
              <MenuItem
                selected={language === 'hi'}
                onClick={() => {
                  void setLanguage('hi')
                  setAnchor(null)
                }}
              >
                {t('common.hindi')}
              </MenuItem>
              <MenuItem
                selected={language === 'ta'}
                onClick={() => {
                  void setLanguage('ta')
                  setAnchor(null)
                }}
              >
                {t('common.tamil')}
              </MenuItem>
            </Menu>

            <IconButton onClick={toggleMode}>{mode === 'dark' ? <WbSunny /> : <DarkMode />}</IconButton>
            <Button component={RouterLink} to="/about" variant="text">
              {t('nav.about')}
            </Button>
            <Button component={RouterLink} to="/login" variant="text">
              {t('nav.login')}
            </Button>
            <Button component={RouterLink} to="/register" variant="contained">
              {t('nav.register')}
            </Button>
          </Stack>
        </Toolbar>
      </AppBar>
      <Outlet />
      <Box component="footer" sx={{ px: 2, py: 2.5, borderTop: (theme) => `1px solid ${theme.palette.divider}` }}>
        <Typography variant="caption" color="text.secondary">
          {t('app.demoFooter')}
        </Typography>
      </Box>
    </Box>
  )
}
