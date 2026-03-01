import { useState } from 'react'
import { Google } from '@mui/icons-material'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Divider,
  FormControlLabel,
  Link,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { Link as RouterLink, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import { AuthLayout } from './AuthLayout'
import { useAuth } from './AuthProvider'
import { mapAuthError } from './authErrors'

const schema = z
  .object({
    name: z.string().min(2, 'Name is required'),
    email: z.string().email('Enter a valid email'),
    password: z.string().min(6, 'Password must be at least 6 characters'),
    confirmPassword: z.string().min(6, 'Confirm password is required'),
    termsAccepted: z.boolean(),
  })
  .refine((value) => value.password === value.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  })
  .refine((value) => value.termsAccepted, {
    path: ['termsAccepted'],
    message: 'Terms and disclaimer must be accepted',
  })

type FormValues = z.infer<typeof schema>

export function RegisterPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { register: registerUser, loginWithGoogle, configured } = useAuth()
  const [formError, setFormError] = useState('')

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    getValues,
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      email: '',
      password: '',
      confirmPassword: '',
      termsAccepted: false,
    },
  })

  const onSubmit = handleSubmit(async (values) => {
    setFormError('')
    try {
      await registerUser({
        name: values.name,
        email: values.email,
        password: values.password,
        termsAccepted: values.termsAccepted,
      })
      navigate('/app/dashboard', { replace: true })
    } catch (error) {
      setFormError(mapAuthError(error))
    }
  })

  const handleGoogle = async () => {
    setFormError('')
    if (!getValues('termsAccepted')) {
      setFormError(t('auth.consentRequired'))
      return
    }
    try {
      await loginWithGoogle(true)
      navigate('/app/dashboard', { replace: true })
    } catch (error) {
      setFormError(mapAuthError(error))
    }
  }

  return (
    <AuthLayout title={t('auth.registerTitle')} subtitle={t('legal.tocNote')}>
      <Stack spacing={1.5} component="form" onSubmit={onSubmit}>
        {!configured ? <Alert severity="warning">{t('auth.noFirebase')}</Alert> : null}
        {formError ? <Alert severity="error">{formError}</Alert> : null}

        <TextField
          size="small"
          label={t('common.name')}
          {...register('name')}
          error={Boolean(errors.name)}
          helperText={errors.name?.message}
          autoComplete="name"
        />

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
          autoComplete="new-password"
        />

        <TextField
          size="small"
          type="password"
          label={t('auth.confirmPassword')}
          {...register('confirmPassword')}
          error={Boolean(errors.confirmPassword)}
          helperText={errors.confirmPassword?.message}
          autoComplete="new-password"
        />

        <FormControlLabel
          control={<Checkbox {...register('termsAccepted')} />}
          label={
            <Typography variant="body2">
              {t('auth.consentLabel')}{' '}
              <Link component={RouterLink} to="/legal/terms" underline="hover">
                Terms
              </Link>{' '}
              /{' '}
              <Link component={RouterLink} to="/legal/privacy" underline="hover">
                Privacy
              </Link>{' '}
              /{' '}
              <Link component={RouterLink} to="/legal/disclaimer" underline="hover">
                Disclaimer
              </Link>
            </Typography>
          }
        />
        {errors.termsAccepted ? (
          <Typography variant="caption" color="error.main">
            {t('auth.consentRequired')}
          </Typography>
        ) : null}

        <Button type="submit" variant="contained" disabled={isSubmitting || !configured}>
          {t('auth.registerButton')}
        </Button>

        <Box display="flex" alignItems="center" gap={1}>
          <Divider sx={{ flexGrow: 1 }} />
          <Typography variant="caption" color="text.secondary">
            {t('auth.or')}
          </Typography>
          <Divider sx={{ flexGrow: 1 }} />
        </Box>

        <Button
          variant="outlined"
          startIcon={<Google />}
          onClick={handleGoogle}
          disabled={isSubmitting || !configured}
        >
          {t('auth.googleSignup')}
        </Button>

        <Typography color="text.secondary" variant="body2">
          {t('auth.alreadyAccount')}{' '}
          <Link component={RouterLink} to="/login" underline="hover">
            {t('auth.goLogin')}
          </Link>
        </Typography>
      </Stack>
    </AuthLayout>
  )
}
