import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ContentCopy, Send } from '@mui/icons-material'
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  FormControlLabel,
  IconButton,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useTranslation } from 'react-i18next'

import { MotionDiv } from '../../components/common/MotionDiv'
import type { AssistantLanguageMode, ScenarioCard } from '../../services/api/types'
import { askChat } from '../../services/api/jobs'

interface Message {
  id: string
  role: 'user' | 'assistant'
  text: string
  simulatorCard?: ScenarioCard | null
}

interface ChatPanelProps {
  jobId: string
  languageMode: AssistantLanguageMode
  seedQuestion?: { id: string; text: string }
}

export function ChatPanel({ jobId, languageMode, seedQuestion }: ChatPanelProps) {
  const { t } = useTranslation()
  const [messages, setMessages] = useState<Message[]>([])
  const [question, setQuestion] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const [followups, setFollowups] = useState<string[]>([])
  const [simulatorMode, setSimulatorMode] = useState(false)
  const lastSeed = useRef('')

  const canSubmit = useMemo(() => question.trim().length > 0 && !pending, [pending, question])

  const submitQuestion = useCallback(
    async (text: string) => {
      if (!text.trim()) {
        return
      }

      setPending(true)
      setError('')
      const userMessage: Message = {
        id: `${Date.now()}_u`,
        role: 'user',
        text,
      }
      setMessages((prev) => [...prev, userMessage])
      setQuestion('')

      try {
        const result = await askChat({
          job_id: jobId,
          question: text,
          language: languageMode,
          response_style: 'plain',
          simulator_mode: simulatorMode,
        })
        setMessages((prev) => [
          ...prev,
          {
            id: `${Date.now()}_a`,
            role: 'assistant',
            text: result.answer,
            simulatorCard: result.simulator_card ?? null,
          },
        ])
        setFollowups(result.followups)
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : 'Chat request failed.')
      } finally {
        setPending(false)
      }
    },
    [jobId, languageMode, simulatorMode],
  )

  useEffect(() => {
    if (!seedQuestion || seedQuestion.id === lastSeed.current) {
      return
    }
    lastSeed.current = seedQuestion.id
    void submitQuestion(seedQuestion.text)
  }, [seedQuestion, submitQuestion])

  return (
    <Card>
      <CardContent>
        <Stack spacing={1.2}>
          <Typography variant="h6">{t('chat.title')}</Typography>
          <FormControlLabel
            control={
              <Switch
                size="small"
                checked={simulatorMode}
                onChange={(event) => setSimulatorMode(event.target.checked)}
              />
            }
            label="Simulator / Sandbox Mode"
          />

          {error ? <Alert severity="error">{error}</Alert> : null}

          <Stack
            spacing={0.9}
            sx={{
              maxHeight: 340,
              overflow: 'auto',
              border: (theme) => `1px solid ${theme.palette.divider}`,
              borderRadius: 2,
              p: 1,
              backgroundColor: (theme) =>
                theme.palette.mode === 'light' ? 'rgba(255,255,255,0.7)' : 'rgba(18,29,49,0.45)',
            }}
          >
            {messages.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                {t('chat.empty')}
              </Typography>
            ) : (
              messages.map((message) => (
                <MotionDiv
                  key={message.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <Box
                    sx={{
                      alignSelf: message.role === 'user' ? 'flex-end' : 'flex-start',
                      width: 'fit-content',
                      maxWidth: 'min(78%, 560px)',
                      backgroundColor: message.role === 'user' ? 'primary.main' : 'background.default',
                      color: message.role === 'user' ? 'primary.contrastText' : 'text.primary',
                      px: 1.2,
                      py: 1,
                      borderRadius: 2,
                      borderTopRightRadius: message.role === 'user' ? 0.6 : 2,
                      borderTopLeftRadius: message.role === 'assistant' ? 0.6 : 2,
                    }}
                  >
                    <Stack direction="row" justifyContent="space-between" alignItems="center" gap={1}>
                      <Typography variant="caption" sx={{ opacity: 0.82 }}>
                        {message.role === 'user' ? t('chat.you') : t('chat.assistant')}
                      </Typography>
                      <IconButton
                        size="small"
                        sx={{ color: 'inherit', opacity: 0.75 }}
                        onClick={() => {
                          void navigator.clipboard.writeText(message.text)
                        }}
                      >
                        <ContentCopy sx={{ fontSize: 14 }} />
                      </IconButton>
                    </Stack>

                    {message.role === 'assistant' ? (
                      <Stack spacing={1}>
                        <Box sx={{ fontSize: '0.94rem', lineHeight: 1.55 }}>
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.text}</ReactMarkdown>
                        </Box>
                        {message.simulatorCard ? (
                          <Box
                            sx={{
                              borderRadius: 2,
                              p: 1.1,
                              border: (theme) => `1px solid ${theme.palette.divider}`,
                              backdropFilter: 'blur(8px)',
                              background: (theme) =>
                                theme.palette.mode === 'light'
                                  ? 'rgba(255,255,255,0.66)'
                                  : 'rgba(26,37,57,0.58)',
                            }}
                          >
                            <Typography variant="subtitle2" fontWeight={700}>
                              {message.simulatorCard.title}
                            </Typography>
                            <Typography variant="caption" color="text.secondary" display="block" mb={0.6}>
                              {message.simulatorCard.subtitle}
                            </Typography>
                            <Stack direction="row" spacing={0.7} useFlexGap flexWrap="wrap" mb={0.6}>
                              {message.simulatorCard.metrics.map((metric) => (
                                <Chip
                                  key={`${message.id}_${metric.label}`}
                                  size="small"
                                  label={`${metric.label}: ${metric.value}`}
                                  color={
                                    metric.tone === 'critical'
                                      ? 'error'
                                      : metric.tone === 'warning'
                                        ? 'warning'
                                        : metric.tone === 'good'
                                          ? 'success'
                                          : metric.tone === 'info'
                                            ? 'info'
                                            : 'default'
                                  }
                                />
                              ))}
                            </Stack>
                            {message.simulatorCard.assumptions.map((assumption) => (
                              <Typography key={`${message.id}_${assumption}`} variant="caption" display="block" color="text.secondary">
                                • {assumption}
                              </Typography>
                            ))}
                            <Typography variant="caption" display="block" mt={0.6} color="text.secondary">
                              {message.simulatorCard.disclaimer}
                            </Typography>
                          </Box>
                        ) : null}
                      </Stack>
                    ) : (
                      <Typography variant="body2" whiteSpace="pre-wrap">
                        {message.text}
                      </Typography>
                    )}
                  </Box>
                </MotionDiv>
              ))
            )}
          </Stack>

          <Stack direction="row" spacing={1}>
            <TextField
              fullWidth
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder={t('chat.placeholder')}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  if (canSubmit) {
                    void submitQuestion(question)
                  }
                }
              }}
            />
            <Button
              variant="contained"
              endIcon={<Send />}
              disabled={!canSubmit}
              onClick={() => {
                void submitQuestion(question)
              }}
            >
              {t('chat.send')}
            </Button>
          </Stack>

          {followups.length > 0 ? (
            <>
              <Divider />
              <Typography variant="body2" color="text.secondary">
                {t('chat.followups')}
              </Typography>
              <Stack direction="row" spacing={0.8} useFlexGap flexWrap="wrap">
                {followups.map((item) => (
                  <Chip
                    key={item}
                    size="small"
                    label={item}
                    onClick={() => {
                      void submitQuestion(item)
                    }}
                  />
                ))}
              </Stack>
            </>
          ) : null}
        </Stack>
      </CardContent>
    </Card>
  )
}
