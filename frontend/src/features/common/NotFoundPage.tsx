import { Button, Container, Stack, Typography } from '@mui/material'
import { Link as RouterLink } from 'react-router-dom'

export function NotFoundPage() {
  return (
    <Container maxWidth="sm" sx={{ py: 10 }}>
      <Stack spacing={2.5}>
        <Typography variant="h3">Page not found</Typography>
        <Typography color="text.secondary">
          The page you requested does not exist or may have moved.
        </Typography>
        <Button component={RouterLink} to="/" variant="contained">
          Go to Home
        </Button>
      </Stack>
    </Container>
  )
}
