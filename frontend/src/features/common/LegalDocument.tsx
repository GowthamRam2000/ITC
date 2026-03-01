import { Card, CardContent, Container, Stack, Typography } from '@mui/material'

interface LegalDocumentProps {
  title: string
  points: string[]
  updated: string
}

export function LegalDocument({ title, points, updated }: LegalDocumentProps) {
  return (
    <Container maxWidth="md" sx={{ py: { xs: 4, md: 6 } }}>
      <Card>
        <CardContent>
          <Stack spacing={2.2}>
            <Typography variant="h3">{title}</Typography>
            {points.map((point) => (
              <Typography key={point} color="text.secondary" variant="body1">
                {point}
              </Typography>
            ))}
            <Typography color="text.secondary" variant="caption">
              {updated}
            </Typography>
          </Stack>
        </CardContent>
      </Card>
    </Container>
  )
}
