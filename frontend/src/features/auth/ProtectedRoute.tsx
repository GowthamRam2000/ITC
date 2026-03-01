import { CircularProgress, Stack, Typography } from '@mui/material'
import { Navigate, Outlet, useLocation } from 'react-router-dom'

import { useAuth } from './AuthProvider'

export function ProtectedRoute() {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <Stack alignItems="center" justifyContent="center" minHeight="100vh" spacing={2}>
        <CircularProgress />
        <Typography variant="body2" color="text.secondary">
          Checking session...
        </Typography>
      </Stack>
    )
  }

  if (!user) {
    return <Navigate replace to="/login" state={{ from: location.pathname }} />
  }

  return <Outlet />
}
