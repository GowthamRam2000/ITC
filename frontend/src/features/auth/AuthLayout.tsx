import type { ReactNode } from 'react'
import { ShieldMoon, VerifiedUser } from '@mui/icons-material'
import { Box, Card, CardContent, Grid, Stack, Typography } from '@mui/material'
import { MotionDiv } from '../../components/common/MotionDiv'

interface AuthLayoutProps {
  title: string
  subtitle: string
  children: ReactNode
}

export function AuthLayout({ title, subtitle, children }: AuthLayoutProps) {
  return (
    <Box sx={{ px: 2, py: { xs: 3, md: 5 } }}>
      <Grid container spacing={2.2} maxWidth="lg" mx="auto" alignItems="stretch">
        <Grid size={{ xs: 12, md: 5 }}>
          <MotionDiv initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
            <Card sx={{ height: '100%', overflow: 'hidden', position: 'relative' }}>
              <CardContent sx={{ p: { xs: 2.5, md: 3 }, height: '100%' }}>
                <Stack spacing={2} height="100%">
                  <Typography variant="h4" lineHeight={1.2}>
                    {title}
                  </Typography>
                  <Typography color="text.secondary">{subtitle}</Typography>
                  <Box sx={{ flexGrow: 1, display: 'grid', placeItems: 'center' }}>
                    <ComplianceShieldGraphic />
                  </Box>
                  <Stack direction="row" spacing={2} color="text.secondary" alignItems="center">
                    <VerifiedUser fontSize="small" color="success" />
                    <Typography variant="body2">Demo-focused secure sign-in</Typography>
                  </Stack>
                  <Stack direction="row" spacing={2} color="text.secondary" alignItems="center">
                    <ShieldMoon fontSize="small" color="info" />
                    <Typography variant="body2">Terms-first and privacy aware onboarding</Typography>
                  </Stack>
                </Stack>
              </CardContent>
            </Card>
          </MotionDiv>
        </Grid>

        <Grid size={{ xs: 12, md: 7 }}>
          <MotionDiv initial={{ opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.08 }}>
            <Card>
              <CardContent sx={{ p: { xs: 2, md: 3 } }}>{children}</CardContent>
            </Card>
          </MotionDiv>
        </Grid>
      </Grid>
    </Box>
  )
}

function ComplianceShieldGraphic() {
  return (
    <svg width="100%" viewBox="0 0 420 220" role="img" aria-label="Compliance shield illustration">
      <defs>
        <linearGradient id="authGrad" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="#0065B3" />
          <stop offset="100%" stopColor="#00A389" />
        </linearGradient>
      </defs>
      <rect x="10" y="18" width="400" height="184" rx="22" fill="rgba(0,101,179,0.08)" />
      <path
        d="M210 38L292 67V114C292 155 260 185 210 196C160 185 128 155 128 114V67L210 38Z"
        fill="url(#authGrad)"
      />
      <circle cx="210" cy="108" r="34" fill="rgba(255,255,255,0.9)" />
      <path
        d="M194 108L206 120L227 98"
        stroke="#0065B3"
        strokeWidth="8"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <rect x="42" y="55" width="70" height="14" rx="7" fill="rgba(0,101,179,0.22)" />
      <rect x="42" y="83" width="52" height="10" rx="5" fill="rgba(0,101,179,0.16)" />
      <rect x="312" y="132" width="66" height="12" rx="6" fill="rgba(0,163,137,0.24)" />
      <rect x="312" y="154" width="48" height="10" rx="5" fill="rgba(0,163,137,0.17)" />
    </svg>
  )
}
