import { describe, expect, it } from 'vitest'
import {
  authStore,
  clearLoginFlow,
  resetAuth,
  setLoadingProviders,
  setProviders,
  startLoginFlow,
  updateLoginFlow,
} from '../auth'
import {
  makeAuthEventComplete,
  makeAuthEventPrompt,
  makeAuthEventUrl,
  makeAuthProvider,
} from '@/test/fixtures'

describe('auth store', () => {
  describe('setLoadingProviders', () => {
    it('sets isLoadingProviders to true', () => {
      setLoadingProviders(true)

      expect(authStore.state.isLoadingProviders).toBe(true)
    })

    it('sets isLoadingProviders to false', () => {
      setLoadingProviders(true)
      setLoadingProviders(false)

      expect(authStore.state.isLoadingProviders).toBe(false)
    })
  })

  describe('setProviders', () => {
    it('sets the providers list', () => {
      const providers = [
        makeAuthProvider({ id: 'anthropic', name: 'Anthropic' }),
        makeAuthProvider({ id: 'openai', name: 'OpenAI' }),
      ]

      setProviders(providers)

      expect(authStore.state.providers).toEqual(providers)
    })

    it('clears the loading flag', () => {
      setLoadingProviders(true)
      setProviders([makeAuthProvider()])

      expect(authStore.state.isLoadingProviders).toBe(false)
    })
  })

  describe('login flow state machine', () => {
    it('startLoginFlow initializes a new login flow in idle state', () => {
      startLoginFlow('flow-123', 'anthropic')

      expect(authStore.state.loginFlow).toEqual({
        loginFlowId: 'flow-123',
        providerId: 'anthropic',
        status: 'idle',
      })
    })

    it('url event transitions to waiting_url state', () => {
      startLoginFlow('flow-123', 'anthropic')
      updateLoginFlow(
        makeAuthEventUrl(
          'flow-123',
          'https://auth.example.com',
          'Please sign in',
        ),
      )

      expect(authStore.state.loginFlow).toMatchObject({
        loginFlowId: 'flow-123',
        status: 'waiting_url',
        url: 'https://auth.example.com',
        instructions: 'Please sign in',
      })
    })

    it('prompt event transitions to waiting_input state', () => {
      startLoginFlow('flow-123', 'anthropic')
      updateLoginFlow(
        makeAuthEventPrompt('flow-123', 'Enter your code', 'Code'),
      )

      expect(authStore.state.loginFlow).toMatchObject({
        status: 'waiting_input',
        promptMessage: 'Enter your code',
        promptPlaceholder: 'Code',
      })
    })

    it('manual_input event sets showManualInput flag', () => {
      startLoginFlow('flow-123', 'anthropic')
      updateLoginFlow({
        type: 'auth_event',
        loginFlowId: 'flow-123',
        event: 'manual_input',
      })

      expect(authStore.state.loginFlow?.showManualInput).toBe(true)
    })

    it('progress event transitions to in_progress state', () => {
      startLoginFlow('flow-123', 'anthropic')
      updateLoginFlow({
        type: 'auth_event',
        loginFlowId: 'flow-123',
        event: 'progress',
        message: 'Verifying...',
      })

      expect(authStore.state.loginFlow).toMatchObject({
        status: 'in_progress',
        progressMessage: 'Verifying...',
      })
    })

    it('complete event (success) transitions to complete state', () => {
      startLoginFlow('flow-123', 'anthropic')
      updateLoginFlow(makeAuthEventComplete('flow-123', true))

      expect(authStore.state.loginFlow).toMatchObject({
        status: 'complete',
        success: true,
      })
    })

    it('complete event (error) transitions to error state', () => {
      startLoginFlow('flow-123', 'anthropic')
      updateLoginFlow(
        makeAuthEventComplete('flow-123', false, 'Authentication failed'),
      )

      expect(authStore.state.loginFlow).toMatchObject({
        status: 'error',
        success: false,
        error: 'Authentication failed',
      })
    })

    it('ignores events for the wrong loginFlowId', () => {
      startLoginFlow('flow-123', 'anthropic')
      const initialFlow = authStore.state.loginFlow

      // Try to update with a different loginFlowId
      updateLoginFlow(makeAuthEventUrl('flow-456', 'https://wrong.example.com'))

      // State should be unchanged
      expect(authStore.state.loginFlow).toEqual(initialFlow)
    })

    it('full flow: idle → waiting_url → in_progress → complete', () => {
      startLoginFlow('flow-123', 'anthropic')
      expect(authStore.state.loginFlow?.status).toBe('idle')

      updateLoginFlow(makeAuthEventUrl('flow-123', 'https://auth.example.com'))
      expect(authStore.state.loginFlow?.status).toBe('waiting_url')

      updateLoginFlow({
        type: 'auth_event',
        loginFlowId: 'flow-123',
        event: 'progress',
        message: 'Completing...',
      })
      expect(authStore.state.loginFlow?.status).toBe('in_progress')

      updateLoginFlow(makeAuthEventComplete('flow-123', true))
      expect(authStore.state.loginFlow?.status).toBe('complete')
    })
  })

  describe('clearLoginFlow', () => {
    it('clears the login flow', () => {
      startLoginFlow('flow-123', 'anthropic')
      clearLoginFlow()

      expect(authStore.state.loginFlow).toBeNull()
    })
  })

  describe('resetAuth', () => {
    it('resets the store to initial state', () => {
      setProviders([makeAuthProvider()])
      setLoadingProviders(true)
      startLoginFlow('flow-123', 'anthropic')

      resetAuth()

      expect(authStore.state).toEqual({
        providers: [],
        isLoadingProviders: false,
        loginFlow: null,
      })
    })
  })
})
