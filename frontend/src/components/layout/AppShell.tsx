import { useMemo, useState, type ReactNode } from 'react'
import {
  AutoAwesome,
  DarkMode,
  Dashboard,
  History,
  Info,
  Logout,
  Menu as MenuIcon,
  MenuOpen,
  Hub,
  Settings,
  Translate,
  WbSunny,
} from '@mui/icons-material'
import {
  AppBar,
  BottomNavigation,
  BottomNavigationAction,
  Box,
  Button,
  Chip,
  Divider,
  Drawer,
  Fab,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Stack,
  Toolbar,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material'
import { useTranslation } from 'react-i18next'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'

import { useAppPreferences } from '../../app/providers'
import { AssistantDock } from '../../features/assistant/AssistantDock'
import { useAuth } from '../../features/auth/AuthProvider'
import gstShieldMark from '../../assets/brand/gst-shield-mark.svg'

const DRAWER_EXPANDED = 264
const DRAWER_COLLAPSED = 84
const SHELL_COLLAPSE_KEY = 'gst-shell-collapsed'
const SIDEBAR_TRANSITION_MS = 150

interface NavItem {
  label: string
  to: string
  icon: ReactNode
}

function getStoredCollapsedState() {
  if (typeof window === 'undefined') {
    return false
  }
  return localStorage.getItem(SHELL_COLLAPSE_KEY) === '1'
}

export function AppShell() {
  const theme = useTheme()
  const isDesktop = useMediaQuery(theme.breakpoints.up('lg'))
  const location = useLocation()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { mode, toggleMode, language, setLanguage, aiLanguage } = useAppPreferences()
  const { user, logout } = useAuth()
  const [langAnchor, setLangAnchor] = useState<null | HTMLElement>(null)
  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => getStoredCollapsedState())
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false)
  const [assistantOpen, setAssistantOpen] = useState(false)

  const navItems = useMemo<NavItem[]>(
    () => [
      { label: t('nav.dashboard'), to: '/app/dashboard', icon: <Dashboard /> },
      { label: t('nav.intelligence'), to: '/app/intelligence', icon: <Hub /> },
      { label: t('nav.history'), to: '/app/history', icon: <History /> },
      { label: t('nav.settings'), to: '/app/settings', icon: <Settings /> },
      { label: t('nav.about'), to: '/app/about', icon: <Info /> },
    ],
    [t],
  )

  const activeIndex = navItems.findIndex((item) => location.pathname.startsWith(item.to))
  const drawerWidth = isCollapsed ? DRAWER_COLLAPSED : DRAWER_EXPANDED
  const routeJobId = useMemo(() => {
    const match = location.pathname.match(/^\/app\/(?:jobs|results)\/([^/]+)/)
    return match?.[1] ?? null
  }, [location.pathname])

  const toggleDesktopSidebar = () => {
    const next = !isCollapsed
    setIsCollapsed(next)
    localStorage.setItem(SHELL_COLLAPSE_KEY, next ? '1' : '0')
  }

  const handleNavClick = (target: string) => {
    navigate(target)
    if (!isDesktop) {
      setMobileDrawerOpen(false)
    }
  }

  const renderNavContent = (collapsed: boolean) => (
    <>
      <Toolbar />
      <Box
        sx={{
          px: collapsed ? 1 : 2,
          py: 2,
          textAlign: collapsed ? 'center' : 'left',
          display: 'flex',
          flexDirection: 'column',
          alignItems: collapsed ? 'center' : 'flex-start',
          gap: 0.8,
        }}
      >
        <Box
          component="img"
          src={gstShieldMark}
          alt={t('app.name')}
          sx={{
            width: collapsed ? 40 : 54,
            height: collapsed ? 40 : 54,
            transition: theme.transitions.create(['width', 'height'], {
              duration: SIDEBAR_TRANSITION_MS,
              easing: theme.transitions.easing.easeOut,
            }),
          }}
        />
        {!collapsed ? (
          <>
            <Typography variant="h6" fontWeight={800}>
              {t('app.name')}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {t('app.tagline')}
            </Typography>
          </>
        ) : null}
      </Box>
      <Divider />
      <List sx={{ px: collapsed ? 1 : 1.5, py: 1 }}>
        {navItems.map((item) => {
          const selected = activeIndex >= 0 && navItems[activeIndex]?.to === item.to
          const button = (
            <ListItemButton
              key={item.to}
              selected={selected}
              onClick={() => handleNavClick(item.to)}
              aria-current={selected ? 'page' : undefined}
              sx={{
                borderRadius: 2,
                mb: 0.5,
                px: collapsed ? 1 : 1.5,
                minHeight: 46,
                justifyContent: collapsed ? 'center' : 'flex-start',
              }}
            >
              <ListItemIcon
                sx={{
                  minWidth: collapsed ? 0 : 36,
                  mr: collapsed ? 0 : 1,
                  justifyContent: 'center',
                  color: 'inherit',
                }}
              >
                {item.icon}
              </ListItemIcon>
              {!collapsed ? <ListItemText primary={item.label} /> : null}
            </ListItemButton>
          )

          if (!collapsed) {
            return button
          }
          return (
            <Tooltip key={item.to} title={item.label} placement="right">
              <Box>{button}</Box>
            </Tooltip>
          )
        })}
      </List>
    </>
  )

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      {isDesktop ? (
        <Drawer
          variant="permanent"
          sx={{
            width: drawerWidth,
            flexShrink: 0,
            transition: theme.transitions.create('width', {
              duration: SIDEBAR_TRANSITION_MS,
              easing: theme.transitions.easing.easeOut,
            }),
            '& .MuiDrawer-paper': {
              width: drawerWidth,
              boxSizing: 'border-box',
              overflowX: 'hidden',
              borderRight: `1px solid ${theme.palette.divider}`,
              transition: theme.transitions.create('width', {
                duration: SIDEBAR_TRANSITION_MS,
                easing: theme.transitions.easing.easeOut,
              }),
              willChange: 'width',
              transform: 'translateZ(0)',
              backfaceVisibility: 'hidden',
            },
          }}
        >
          {renderNavContent(isCollapsed)}
        </Drawer>
      ) : null}

      {!isDesktop ? (
        <Drawer
          variant="temporary"
          open={mobileDrawerOpen}
          onClose={() => setMobileDrawerOpen(false)}
          ModalProps={{ keepMounted: true }}
          sx={{
            '& .MuiDrawer-paper': {
              width: DRAWER_EXPANDED,
              boxSizing: 'border-box',
              borderRight: `1px solid ${theme.palette.divider}`,
            },
          }}
        >
          {renderNavContent(false)}
        </Drawer>
      ) : null}

      <Box sx={{ flexGrow: 1, pb: { xs: 8, lg: 0 } }}>
        <AppBar
          position="sticky"
          color="transparent"
          sx={{
            borderBottom: `1px solid ${theme.palette.divider}`,
            backgroundColor: theme.palette.mode === 'light' ? 'rgba(244,248,255,0.75)' : 'rgba(14,22,38,0.8)',
          }}
        >
          <Toolbar sx={{ gap: 1 }}>
            <Tooltip
              title={
                isDesktop
                  ? isCollapsed
                    ? t('nav.expandSidebar')
                    : t('nav.collapseSidebar')
                  : t('nav.openMenu')
              }
            >
              <IconButton
                edge="start"
                onClick={() => {
                  if (isDesktop) {
                    toggleDesktopSidebar()
                  } else {
                    setMobileDrawerOpen(true)
                  }
                }}
                aria-label={
                  isDesktop
                    ? isCollapsed
                      ? t('nav.expandSidebar')
                      : t('nav.collapseSidebar')
                    : t('nav.openMenu')
                }
              >
                {isDesktop ? isCollapsed ? <MenuIcon /> : <MenuOpen /> : <MenuIcon />}
              </IconButton>
            </Tooltip>

            <Box sx={{ flexGrow: 1 }} />

            <Stack direction="row" alignItems="center" spacing={0.8} sx={{ minWidth: 0 }}>
              <Chip size="small" color="secondary" label={language.toUpperCase()} />
              <Chip
                size="small"
                variant="outlined"
                label={`AI ${aiLanguage.toUpperCase()}`}
                sx={{ display: { xs: 'none', sm: 'inline-flex' } }}
              />
              <Typography
                variant="subtitle2"
                color="text.secondary"
                noWrap
                sx={{ maxWidth: { xs: 110, sm: 220, md: 280 } }}
              >
                {user?.email ?? 'Signed in'}
              </Typography>
            </Stack>

            <Tooltip title={t('common.language')}>
              <IconButton onClick={(event) => setLangAnchor(event.currentTarget)}>
                <Translate />
              </IconButton>
            </Tooltip>
            <Menu
              anchorEl={langAnchor}
              open={Boolean(langAnchor)}
              onClose={() => setLangAnchor(null)}
            >
              <MenuItem
                selected={language === 'en'}
                onClick={() => {
                  void setLanguage('en')
                  setLangAnchor(null)
                }}
              >
                {t('common.english')}
              </MenuItem>
              <MenuItem
                selected={language === 'hi'}
                onClick={() => {
                  void setLanguage('hi')
                  setLangAnchor(null)
                }}
              >
                {t('common.hindi')}
              </MenuItem>
              <MenuItem
                selected={language === 'ta'}
                onClick={() => {
                  void setLanguage('ta')
                  setLangAnchor(null)
                }}
              >
                {t('common.tamil')}
              </MenuItem>
            </Menu>

            <Tooltip title={t('common.theme')}>
              <IconButton onClick={toggleMode}>{mode === 'dark' ? <WbSunny /> : <DarkMode />}</IconButton>
            </Tooltip>

            <Button
              size="small"
              color="inherit"
              startIcon={<Logout />}
              onClick={async () => {
                await logout()
                navigate('/login', { replace: true })
              }}
            >
              {t('common.logout')}
            </Button>
          </Toolbar>
        </AppBar>

        <Box component="main" sx={{ py: 1 }}>
          <Outlet />
          <Box component="footer" sx={{ px: 3, py: 2.5 }}>
            <Typography variant="caption" color="text.secondary">
              {t('app.demoFooter')}
            </Typography>
          </Box>
        </Box>
      </Box>

      {!isDesktop ? (
        <BottomNavigation
          value={activeIndex}
          onChange={(_, index: number) => navigate(navItems[index].to)}
          showLabels
          sx={{
            position: 'fixed',
            left: 0,
            right: 0,
            bottom: 0,
            borderTop: `1px solid ${theme.palette.divider}`,
            zIndex: theme.zIndex.appBar,
          }}
        >
          <BottomNavigationAction label={t('nav.dashboard')} icon={<Dashboard />} />
          <BottomNavigationAction label={t('nav.history')} icon={<History />} />
          <BottomNavigationAction label={t('nav.settings')} icon={<Settings />} />
          <BottomNavigationAction label={t('nav.about')} icon={<Info />} />
        </BottomNavigation>
      ) : null}

      <Tooltip title={t('assistant.fabHover')}>
        <Fab
          color="primary"
          onClick={() => setAssistantOpen(true)}
          aria-label={t('assistant.open')}
          sx={{
            position: 'fixed',
            right: 20,
            bottom: { xs: 92, lg: 24 },
            zIndex: (currentTheme) => currentTheme.zIndex.drawer - 1,
            borderRadius: '999px',
            px: 0.7,
            boxShadow: (currentTheme) =>
              currentTheme.palette.mode === 'light'
                ? '0 14px 26px rgba(17,62,122,0.33)'
                : '0 14px 26px rgba(0,0,0,0.5)',
          }}
        >
          <AutoAwesome />
        </Fab>
      </Tooltip>

      <AssistantDock
        open={assistantOpen}
        onClose={() => setAssistantOpen(false)}
        languageMode={aiLanguage}
        routeJobId={routeJobId}
      />
    </Box>
  )
}
