import type { ReactNode } from 'react'
import {
  AutoAwesome,
  Celebration,
  Hub,
  Insights,
  Link as LinkIcon,
  Schema,
  Shield,
  VoiceChat,
} from '@mui/icons-material'
import { alpha, useTheme } from '@mui/material/styles'
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Container,
  Divider,
  Grid,
  Stack,
  Typography,
} from '@mui/material'
import { useTranslation } from 'react-i18next'
import { MotionDiv } from '../../components/common/MotionDiv'

export function AboutPage() {
  const { t } = useTranslation()
  const theme = useTheme()
  const isLight = theme.palette.mode === 'light'

  return (
    <Container maxWidth="xl" sx={{ py: { xs: 2.5, md: 4 } }}>
      <Stack spacing={2}>
        <MotionDiv initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.26 }}>
          <Card
            sx={{
              overflow: 'hidden',
              position: 'relative',
              background: isLight
                ? 'linear-gradient(135deg, rgba(0,84,166,0.12) 0%, rgba(0,163,137,0.1) 40%, rgba(255,193,7,0.12) 100%)'
                : 'linear-gradient(135deg, rgba(122,184,255,0.16) 0%, rgba(93,214,200,0.12) 40%, rgba(255,183,77,0.15) 100%)',
            }}
          >
            <Box
              sx={{
                position: 'absolute',
                right: -80,
                top: -70,
                width: 240,
                height: 240,
                borderRadius: '50%',
                bgcolor: alpha(theme.palette.primary.main, 0.14),
              }}
            />
            <CardContent sx={{ position: 'relative', p: { xs: 2, md: 2.8 } }}>
              <Grid container spacing={2.2} alignItems="center">
                <Grid size={{ xs: 12, md: 8 }}>
                  <Stack spacing={1.2}>
                    <Stack direction="row" spacing={0.8} useFlexGap flexWrap="wrap">
                      <Chip icon={<Celebration />} color="primary" label={t('about.hackathon')} />
                      <Chip icon={<AutoAwesome />} variant="outlined" label={t('about.expressive')} />
                    </Stack>
                    <Typography variant="h3">{t('about.title')}</Typography>
                    <Typography color="text.secondary">{t('about.subtitle')}</Typography>
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.2} alignItems={{ xs: 'flex-start', sm: 'center' }}>
                      <Chip icon={<Shield />} label={t('about.byline')} />
                      <Button
                        component="a"
                        href="https://new-project-6d8bf.web.app"
                        target="_blank"
                        rel="noopener noreferrer"
                        startIcon={<LinkIcon />}
                        variant="contained"
                      >
                        {t('about.portfolio')}
                      </Button>
                    </Stack>
                  </Stack>
                </Grid>
                <Grid size={{ xs: 12, md: 4 }}>
                  <Card
                    sx={{
                      borderRadius: 3,
                      bgcolor: isLight ? alpha('#FFFFFF', 0.84) : alpha('#0F1B2D', 0.74),
                    }}
                  >
                    <CardContent sx={{ p: 1.8 }}>
                      <Stack spacing={1}>
                        <StatLine title={t('about.statModels')} value="8+" />
                        <StatLine title={t('about.statFlows')} value="5" />
                        <StatLine title={t('about.statCoverage')} value="OCR + Recon + Chat + Voice + Analytics" />
                      </Stack>
                    </CardContent>
                  </Card>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </MotionDiv>

        <Grid container spacing={2}>
          <Grid size={{ xs: 12, lg: 8 }}>
            <MotionDiv initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28, delay: 0.04 }}>
              <Card>
                <CardContent sx={{ p: { xs: 1.6, md: 2.2 } }}>
                  <Stack spacing={1.1}>
                    <Stack direction="row" spacing={0.8} alignItems="center">
                      <Hub color="primary" />
                      <Typography variant="h5">{t('about.architectureTitle')}</Typography>
                    </Stack>
                    <Typography color="text.secondary" variant="body2">
                      {t('about.architectureText')}
                    </Typography>
                    <ArchitectureGraphic isLight={isLight} />
                  </Stack>
                </CardContent>
              </Card>
            </MotionDiv>
          </Grid>

          <Grid size={{ xs: 12, lg: 4 }}>
            <MotionDiv initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28, delay: 0.08 }}>
              <Card sx={{ height: '100%' }}>
                <CardContent sx={{ p: { xs: 1.6, md: 2.1 } }}>
                  <Stack spacing={1.2}>
                    <Stack direction="row" spacing={0.8} alignItems="center">
                      <Schema color="secondary" />
                      <Typography variant="h5">{t('about.decisionTitle')}</Typography>
                    </Stack>
                    <Typography color="text.secondary" variant="body2">
                      {t('about.decisionText')}
                    </Typography>
                    <DecisionTreeGraphic />
                  </Stack>
                </CardContent>
              </Card>
            </MotionDiv>
          </Grid>
        </Grid>

        <Grid container spacing={2}>
          <Grid size={{ xs: 12, md: 6 }}>
            <InfoCard
              icon={<Insights color="info" />}
              title={t('about.featuresTitle')}
              text={t('about.featuresText')}
              items={[
                'ITC mismatch risk scoring',
                'HSN correction with confidence',
                'Supplier watchlist and SLA behavior',
                'Delta digest across filing cycles',
              ]}
            />
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <InfoCard
              icon={<VoiceChat color="success" />}
              title={t('about.voiceTitle')}
              text={t('about.voiceText')}
              items={[
                'Live voice copilot for queries',
                'Tamil/Hindi/English narration',
                'Evidence pack audio summary',
                'Morning risk brief playback',
              ]}
            />
          </Grid>
        </Grid>
      </Stack>
    </Container>
  )
}

interface InfoCardProps {
  icon: ReactNode
  title: string
  text: string
  items: string[]
}

function InfoCard({ icon, title, text, items }: InfoCardProps) {
  return (
    <MotionDiv initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28 }}>
      <Card sx={{ height: '100%' }}>
        <CardContent sx={{ p: 2 }}>
          <Stack spacing={1.1}>
            <Box>{icon}</Box>
            <Typography variant="h6">{title}</Typography>
            <Typography color="text.secondary" variant="body2">
              {text}
            </Typography>
            <Divider />
            <Stack spacing={0.6}>
              {items.map((item) => (
                <Typography key={item} variant="body2" color="text.secondary">
                  {'\u2022'} {item}
                </Typography>
              ))}
            </Stack>
          </Stack>
        </CardContent>
      </Card>
    </MotionDiv>
  )
}

interface StatLineProps {
  title: string
  value: string
}

function StatLine({ title, value }: StatLineProps) {
  return (
    <Stack spacing={0.25}>
      <Typography variant="body2" color="text.secondary">
        {title}
      </Typography>
      <Typography variant="body2" fontWeight={700} sx={{ overflowWrap: 'anywhere' }}>
        {value}
      </Typography>
    </Stack>
  )
}

function ArchitectureGraphic({ isLight }: { isLight: boolean }) {
  const shellFill = isLight ? 'rgba(35,114,211,0.06)' : 'rgba(122,184,255,0.12)'
  const edgeColor = isLight ? '#1A5FB4' : '#8FC3FF'
  const routePanelFill = isLight ? 'rgba(22,74,146,0.1)' : 'rgba(126,178,255,0.14)'
  const routeTitleFill = isLight ? '#17345E' : '#D9EAFF'
  const routeTextFill = isLight ? '#244A7A' : '#BFD8FA'
  return (
    <svg width="100%" viewBox="0 0 1080 380" role="img" aria-label="System architecture diagram">
      <defs>
        <linearGradient id="archA" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="#2979FF" />
          <stop offset="100%" stopColor="#26C6DA" />
        </linearGradient>
        <linearGradient id="archB" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="#5E35B1" />
          <stop offset="100%" stopColor="#8E24AA" />
        </linearGradient>
        <linearGradient id="archC" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="#00897B" />
          <stop offset="100%" stopColor="#43A047" />
        </linearGradient>
        <linearGradient id="archD" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="#F57C00" />
          <stop offset="100%" stopColor="#F9A825" />
        </linearGradient>
      </defs>
      <rect x="12" y="10" width="1056" height="360" rx="24" fill={shellFill} />

      <rect x="32" y="62" width="188" height="112" rx="16" fill="url(#archA)" opacity="0.95" />
      <text x="48" y="104" fill="white" fontSize="28" fontWeight="700">Ingestion</text>
      <text x="48" y="136" fill="white" fontSize="18">Invoices + GSTR-2B</text>

      <rect x="252" y="62" width="188" height="112" rx="16" fill="url(#archB)" opacity="0.95" />
      <text x="268" y="104" fill="white" fontSize="28" fontWeight="700">Extract</text>
      <text x="268" y="136" fill="white" fontSize="18">OCR + Ministral</text>

      <rect x="472" y="62" width="188" height="112" rx="16" fill="url(#archC)" opacity="0.95" />
      <text x="488" y="104" fill="white" fontSize="28" fontWeight="700">Intelligence</text>
      <text x="488" y="136" fill="white" fontSize="18">ITC + HSN + Risk</text>

      <rect x="692" y="62" width="188" height="112" rx="16" fill="url(#archD)" opacity="0.95" />
      <text x="708" y="104" fill="white" fontSize="28" fontWeight="700">Outputs</text>
      <text x="708" y="136" fill="white" fontSize="18">Reports + Dashboard</text>

      <rect x="882" y="62" width="164" height="112" rx="16" fill="#1565C0" opacity="0.95" />
      <text x="898" y="104" fill="white" fontSize="28" fontWeight="700">Voice</text>
      <text x="898" y="136" fill="white" fontSize="18">Live + Narration</text>

      <path d="M222 118H246M442 118H466M662 118H686M882 118H876" stroke={edgeColor} strokeWidth="3" strokeLinecap="round" />
      <polygon points="246,113 254,118 246,123" fill={edgeColor} />
      <polygon points="466,113 474,118 466,123" fill={edgeColor} />
      <polygon points="686,113 694,118 686,123" fill={edgeColor} />
      <polygon points="876,113 884,118 876,123" fill={edgeColor} />

      <rect x="52" y="228" width="970" height="108" rx="18" fill={routePanelFill} />
      <text x="74" y="266" fill={routeTitleFill} fontSize="24" fontWeight="700">Model Routing</text>
      <text x="74" y="294" fill={routeTextFill} fontSize="16">
        <tspan x="74" dy="0">mistral-ocr to ministral-3b/8b/14b to magistral-medium to mistral-large</tspan>
        <tspan x="74" dy="22">to voxtral + elevenlabs. Supports English, Hindi, Hinglish, Tamil, Tanglish.</tspan>
      </text>
    </svg>
  )
}

function DecisionTreeGraphic() {
  return (
    <svg width="100%" viewBox="0 0 560 430" role="img" aria-label="Decision flow diagram">
      <defs>
        <linearGradient id="decRoot" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="#1565C0" />
          <stop offset="100%" stopColor="#26A69A" />
        </linearGradient>
      </defs>
      <rect x="16" y="20" width="528" height="392" rx="24" fill="rgba(19,96,177,0.06)" />

      <rect x="176" y="48" width="210" height="54" rx="14" fill="url(#decRoot)" />
      <text x="202" y="82" fill="white" fontSize="22" fontWeight="700">Input Type?</text>

      <line x1="281" y1="103" x2="120" y2="158" stroke="#1A5FB4" strokeWidth="2.5" />
      <line x1="281" y1="103" x2="281" y2="158" stroke="#1A5FB4" strokeWidth="2.5" />
      <line x1="281" y1="103" x2="442" y2="158" stroke="#1A5FB4" strokeWidth="2.5" />

      <rect x="48" y="158" width="146" height="52" rx="12" fill="#7E57C2" />
      <text x="70" y="190" fill="white" fontSize="18" fontWeight="700">Image/PDF</text>

      <rect x="216" y="158" width="130" height="52" rx="12" fill="#00897B" />
      <text x="242" y="190" fill="white" fontSize="18" fontWeight="700">JSONL/CSV</text>

      <rect x="366" y="158" width="146" height="52" rx="12" fill="#F57C00" />
      <text x="396" y="190" fill="white" fontSize="18" fontWeight="700">Voice Query</text>

      <line x1="120" y1="210" x2="120" y2="258" stroke="#1A5FB4" strokeWidth="2.5" />
      <line x1="281" y1="210" x2="281" y2="258" stroke="#1A5FB4" strokeWidth="2.5" />
      <line x1="442" y1="210" x2="442" y2="258" stroke="#1A5FB4" strokeWidth="2.5" />

      <rect x="36" y="258" width="168" height="58" rx="12" fill="#5E35B1" opacity="0.9" />
      <text x="58" y="292" fill="white" fontSize="16">OCR + Field Extract</text>

      <rect x="204" y="258" width="154" height="58" rx="12" fill="#2E7D32" opacity="0.9" />
      <text x="222" y="292" fill="white" fontSize="16">Direct Reconcile</text>

      <rect x="358" y="258" width="168" height="58" rx="12" fill="#EF6C00" opacity="0.92" />
      <text x="382" y="292" fill="white" fontSize="16">Transcribe + Ask</text>

      <line x1="281" y1="316" x2="281" y2="346" stroke="#1A5FB4" strokeWidth="2.5" />
      <rect x="114" y="346" width="334" height="46" rx="12" fill="#0D47A1" />
      <text x="281" y="375" fill="white" fontSize="14" fontWeight="700" textAnchor="middle">Risk Grade: Critical / Warning / Info</text>
    </svg>
  )
}
