import { createTheme, responsiveFontSizes, type PaletteMode, alpha } from '@mui/material/styles'

const sharedTypography = {
  fontFamily: '"Google Sans Flex", "Noto Sans Devanagari", system-ui, sans-serif',
}

export function buildTheme(mode: PaletteMode) {
  const light = mode === 'light'
  const theme = createTheme({
    palette: {
      mode,
      primary: { main: light ? '#0054A6' : '#7AB8FF' },
      secondary: { main: light ? '#00796B' : '#5DD6C8' },
      error: { main: light ? '#B3261E' : '#FF8A80' },
      warning: { main: light ? '#A15C00' : '#F9B56D' },
      info: { main: light ? '#00658B' : '#63D2FF' },
      success: { main: light ? '#1F6B3A' : '#6EDB96' },
      background: {
        default: light ? '#F4F8FF' : '#0E1626',
        paper: light ? '#FFFFFF' : '#121D31',
      },
      text: {
        primary: light ? '#142338' : '#E7EEF8',
        secondary: light ? '#38506C' : '#9FB4CC',
      },
    },
    shape: { borderRadius: 14 },
    typography: {
      ...sharedTypography,
      fontWeightRegular: 400,
      h1: { fontSize: '2.05rem', fontWeight: 700, lineHeight: 1.14 },
      h2: { fontSize: '1.72rem', fontWeight: 700, lineHeight: 1.17 },
      h3: { fontSize: '1.4rem', fontWeight: 700, lineHeight: 1.2 },
      h4: { fontSize: '1.2rem', fontWeight: 700, lineHeight: 1.24 },
      h5: { fontSize: '1.05rem', fontWeight: 700, lineHeight: 1.25 },
      body1: { fontSize: '0.95rem', lineHeight: 1.56 },
      body2: { fontSize: '0.86rem', lineHeight: 1.5 },
      button: { textTransform: 'none', fontWeight: 600 },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: {
            backgroundImage: light
              ? 'radial-gradient(circle at top right, #E1ECFF 0%, transparent 55%), radial-gradient(circle at bottom left, #D9FFF6 0%, transparent 48%)'
              : 'radial-gradient(circle at top right, #193052 0%, transparent 55%), radial-gradient(circle at bottom left, #102A34 0%, transparent 48%)',
            backgroundAttachment: 'fixed',
          },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: {
            border: `1px solid ${alpha(light ? '#0054A6' : '#7AB8FF', 0.12)}`,
            boxShadow: light ? '0 10px 24px rgba(17,56,101,0.08)' : '0 14px 28px rgba(0,0,0,0.35)',
          },
        },
      },
      MuiButton: {
        defaultProps: { disableElevation: true, size: 'small' },
        styleOverrides: {
          root: { borderRadius: 11, paddingInline: 14, minHeight: 34 },
        },
      },
      MuiTextField: {
        defaultProps: { size: 'small' },
      },
      MuiFormControl: {
        defaultProps: { size: 'small' },
      },
      MuiChip: {
        styleOverrides: {
          root: {
            fontWeight: 500,
            borderRadius: 8,
            height: 26,
            minHeight: 26,
            alignItems: 'center',
            maxWidth: '100%',
          },
          label: {
            lineHeight: 1.2,
            display: 'flex',
            alignItems: 'center',
            whiteSpace: 'nowrap',
            paddingTop: 0,
            paddingBottom: 0,
            paddingLeft: 8,
            paddingRight: 8,
          },
        },
      },
      MuiAppBar: {
        styleOverrides: {
          root: {
            backgroundImage: 'none',
            backdropFilter: 'blur(10px)',
          },
        },
      },
      MuiDrawer: {
        styleOverrides: {
          paper: {
            backgroundColor: light ? alpha('#FFFFFF', 0.94) : alpha('#121D31', 0.94),
            backdropFilter: 'blur(8px)',
          },
        },
      },
      MuiTooltip: {
        defaultProps: {
          arrow: true,
        },
        styleOverrides: {
          tooltip: {
            backgroundColor: light ? '#0F2844' : '#DCE9F8',
            color: light ? '#ECF4FF' : '#0E1A2D',
            border: `1px solid ${alpha(light ? '#ECF4FF' : '#0E1A2D', 0.2)}`,
            fontSize: '0.74rem',
            fontWeight: 600,
          },
          arrow: {
            color: light ? '#0F2844' : '#DCE9F8',
          },
        },
      },
    },
  })

  return responsiveFontSizes(theme)
}
