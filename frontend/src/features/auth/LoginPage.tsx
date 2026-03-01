import { useMemo, useState } from 'react'
import { Google } from '@mui/icons-material'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import {
  Alert,
  Box,
  Button,
  Divider,
  Link,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { Link as RouterLink, useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import { AuthLayout } from './AuthLayout'
import { useAuth } from './AuthProvider'
import { mapAuthError } from './authErrors'

const schema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
})

type FormValues = z.infer<typeof schema>

export function LoginPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const { login, loginWithGoogle, resetPassword, configured } = useAuth()
  const [formError, setFormError] = useState('')
  const [success, setSuccess] = useState('')

  const fromPath = useMemo(() => {
    const state = location.state as { from?: string } | undefined
    return state?.from && state.from.startsWith('/app') ? state.from : '/app/dashboard'
  }, [location.state])

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    getValues,
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      email: '',
      password: '',
    },
  })

  const onSubmit = handleSubmit(async (values) => {
    setFormError('')
    setSuccess('')
    try {
      await login(values.email, values.password)
      navigate(fromPath, { replace: true })
    } catch (error) {
      setFormError(mapAuthError(error))
    }
  })

  const handleResetPassword = async () => {
    setFormError('')
    setSuccess('')
    const email = getValues('email')
    if (!email) {
      setFormError('Enter your email and then use forgot password.')
      return
    }
    try {
      await resetPassword(email)
      setSuccess(t('auth.resetSent'))
    } catch (error) {
      setFormError(mapAuthError(error))
    }
  }

  const handleGoogle = async () => {
    setFormError('')
    try {
      await loginWithGoogle()
      navigate(fromPath, { replace: true })
    } catch (error) {
      setFormError(mapAuthError(error))
    }
  }

  return (
    <AuthLayout title={t('auth.loginTitle')} subtitle={t('app.tagline')}>
      <Stack spacing={1.5} component="form" onSubmit={onSubmit}>
        {!configured ? <Alert severity="warning">{t('auth.noFirebase')}</Alert> : null}
        {formError ? <Alert severity="error">{formError}</Alert> : null}
        {success ? <Alert severity="success">{success}</Alert> : null}

        <Button
          variant="outlined"
          startIcon={<Google />}
          onClick={handleGoogle}
          disabled={isSubmitting || !configured}
        >
          {t('auth.googleSignin')}
        </Button>

        <Box display="flex" alignItems="center" gap={1}>
          <Divider sx={{ flexGrow: 1 }} />
          <Typography variant="caption" color="text.secondary">
            {t('auth.or')}
          </Typography>
          <Divider sx={{ flexGrow: 1 }} />
        </Box>

        <TextField
          size="small"
          label={t('common.email')}
          {...register('email')}
          error={Boolean(errors.email)}
          helperText={errors.email?.message}
          autoComplete="email"
        />
        <TextField
          size="small"
          type="password"
          label={t('common.password')}
          {...register('password')}
          error={Boolean(errors.password)}
          helperText={errors.password?.message}
          autoComplete="current-password"
        />

        <Button type="submit" variant="contained" disabled={isSubmitting || !configured}>
          {t('auth.loginButton')}
        </Button>

        <Button variant="text" onClick={handleResetPassword} disabled={isSubmitting || !configured}>
          {t('auth.forgotPassword')}
        </Button>

        <Typography color="text.secondary" variant="body2">
          {t('auth.needAccount')}{' '}
          <Link component={RouterLink} to="/register" underline="hover">
            {t('auth.goRegister')}
          </Link>
        </Typography>

        <Typography variant="caption" color="text.secondary">
          <Link component={RouterLink} to="/legal/terms" underline="hover">
            Terms
          </Link>{' '}
          |{' '}
          <Link component={RouterLink} to="/legal/privacy" underline="hover">
            Privacy
          </Link>{' '}
          |{' '}
          <Link component={RouterLink} to="/legal/disclaimer" underline="hover">
            Disclaimer
          </Link>
        </Typography>
      </Stack>
    </AuthLayout>
  )
}
