import { ArrowForward, Insights, ReceiptLong, Rule } from '@mui/icons-material'
import { Box, Button, Card, CardContent, Container, Grid, Stack, Typography } from '@mui/material'
import { useTranslation } from 'react-i18next'
import { Link as RouterLink } from 'react-router-dom'
import { MotionDiv } from '../../components/common/MotionDiv'

export function LandingPage() {
  const { t } = useTranslation()

  const cards = [
    { icon: ReceiptLong, text: t('landing.point1') },
    { icon: Rule, text: t('landing.point2') },
    { icon: Insights, text: t('landing.point3') },
  ]

  return (
    <Container maxWidth="lg" sx={{ py: { xs: 5, md: 7 } }}>
      <Stack spacing={3.2}>
        <Grid container spacing={2.5} alignItems="center">
          <Grid size={{ xs: 12, md: 7 }}>
            <MotionDiv initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
              <Box>
                <Typography variant="overline" color="secondary.main" fontWeight={700}>
                  {t('app.tagline')}
                </Typography>
                <Typography variant="h1" mt={0.8} maxWidth={720}>
                  {t('landing.headline')}
                </Typography>
                <Typography variant="h5" color="text.secondary" mt={1.5} maxWidth={670}>
                  {t('landing.subheadline')}
                </Typography>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.2} mt={3}>
                  <Button
                    component={RouterLink}
                    to="/register"
                    variant="contained"
                    size="medium"
                    endIcon={<ArrowForward />}
                  >
                    {t('landing.ctaPrimary')}
                  </Button>
                  <Button component={RouterLink} to="/about" variant="outlined" size="medium">
                    {t('landing.ctaSecondary')}
                  </Button>
                </Stack>
              </Box>
            </MotionDiv>
          </Grid>

          <Grid size={{ xs: 12, md: 5 }}>
            <MotionDiv initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.45 }}>
              <Card>
                <CardContent sx={{ p: 1.5 }}>
                  <HeroGraphic />
                </CardContent>
              </Card>
            </MotionDiv>
          </Grid>
        </Grid>

        <Grid container spacing={1.5}>
          {cards.map(({ icon: Icon, text }, index) => (
            <Grid key={text} size={{ xs: 12, md: 4 }}>
              <MotionDiv
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: index * 0.06 }}
              >
                <Card sx={{ height: '100%' }}>
                  <CardContent>
                    <Stack direction="row" spacing={1.1} alignItems="center">
                      <Icon color="primary" />
                      <Typography fontWeight={600} variant="body2">
                        {text}
                      </Typography>
                    </Stack>
                  </CardContent>
                </Card>
              </MotionDiv>
            </Grid>
          ))}
        </Grid>

        <Typography color="text.secondary" variant="caption">
          {t('landing.disclaimer')}
        </Typography>
      </Stack>
    </Container>
  )
}

function HeroGraphic() {
  return (
    <svg width="100%" viewBox="0 0 360 220" role="img" aria-label="GST dashboard illustration">
      <defs>
        <linearGradient id="landingGrad" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="#0065B3" />
          <stop offset="100%" stopColor="#00A389" />
        </linearGradient>
      </defs>
      <rect x="10" y="15" width="340" height="190" rx="18" fill="rgba(0,101,179,0.08)" />
      <rect x="28" y="34" width="306" height="30" rx="10" fill="url(#landingGrad)" />
      <rect x="28" y="76" width="142" height="108" rx="12" fill="rgba(0,101,179,0.18)" />
      <rect x="182" y="76" width="152" height="32" rx="10" fill="rgba(0,101,179,0.12)" />
      <rect x="182" y="114" width="152" height="32" rx="10" fill="rgba(0,163,137,0.2)" />
      <rect x="182" y="152" width="92" height="32" rx="10" fill="rgba(0,163,137,0.3)" />
      <circle cx="80" cy="126" r="24" fill="#0065B3" />
      <circle cx="80" cy="126" r="12" fill="#fff" />
      <rect x="112" y="118" width="46" height="8" rx="4" fill="rgba(20,35,56,0.45)" />
      <rect x="112" y="132" width="30" height="8" rx="4" fill="rgba(20,35,56,0.35)" />
    </svg>
  )
}
