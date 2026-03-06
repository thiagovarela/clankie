import { beforeEach, describe, expect, it } from 'vitest'
import {
  connectionStore,
  resetConnectionError,
  resetConnectionTracking,
  updateConnectionSettings,
  updateConnectionStatus,
} from '../connection'
import type { ConnectionState } from '@/lib/ws-client'

describe('connection store', () => {
  beforeEach(() => {
    localStorage.clear()
    connectionStore.setState((state) => ({
      ...state,
      settings: {
        url: 'ws://localhost:3100',
        authToken: '',
        useCookieAuth: false,
      },
      status: 'disconnected',
      error: undefined,
      hasConnectedOnce: false,
    }))
  })

  describe('updateConnectionSettings', () => {
    it('updates connection settings', () => {
      updateConnectionSettings({
        url: 'ws://example.com:8080',
        authToken: 'test-token',
      })

      expect(connectionStore.state.settings).toEqual({
        url: 'ws://example.com:8080',
        authToken: 'test-token',
        useCookieAuth: false,
      })
    })

    it('supports partial updates', () => {
      updateConnectionSettings({ url: 'ws://localhost:3100' })
      updateConnectionSettings({ authToken: 'new-token' })

      expect(connectionStore.state.settings).toMatchObject({
        url: 'ws://localhost:3100',
        authToken: 'new-token',
        useCookieAuth: false,
      })
    })

    it('persists settings to localStorage', () => {
      updateConnectionSettings({
        url: 'ws://saved.example.com',
        authToken: 'saved-token',
      })

      const saved = localStorage.getItem('clankie-connection')
      expect(saved).toBeTruthy()
      const parsed = JSON.parse(saved!)
      expect(parsed).toEqual({
        url: 'ws://saved.example.com',
        authToken: 'saved-token',
        useCookieAuth: false,
      })
    })
  })

  describe('updateConnectionStatus', () => {
    it('updates the connection status', () => {
      const states: Array<ConnectionState> = [
        'disconnected',
        'connecting',
        'connected',
        'error',
      ]

      for (const state of states) {
        updateConnectionStatus(state)
        expect(connectionStore.state.status).toBe(state)
      }
    })

    it('sets an error message when provided', () => {
      updateConnectionStatus('error', 'Connection timeout')

      expect(connectionStore.state).toMatchObject({
        status: 'error',
        error: 'Connection timeout',
      })
    })

    it('marks the store after the first successful connection', () => {
      expect(connectionStore.state.hasConnectedOnce).toBe(false)

      updateConnectionStatus('connected')
      expect(connectionStore.state.hasConnectedOnce).toBe(true)

      updateConnectionStatus('error', 'Connection dropped')
      expect(connectionStore.state.hasConnectedOnce).toBe(true)
    })

    it('clears error when status changes without error param', () => {
      updateConnectionStatus('error', 'Previous error')
      updateConnectionStatus('connected')

      expect(connectionStore.state).toMatchObject({
        status: 'connected',
        error: undefined,
      })
    })
  })

  describe('resetConnectionError', () => {
    it('clears the error field', () => {
      updateConnectionStatus('error', 'Test error')
      resetConnectionError()

      expect(connectionStore.state.error).toBeUndefined()
    })
  })

  describe('resetConnectionTracking', () => {
    it('clears reconnect tracking', () => {
      updateConnectionStatus('connected')
      expect(connectionStore.state.hasConnectedOnce).toBe(true)

      resetConnectionTracking()
      expect(connectionStore.state.hasConnectedOnce).toBe(false)
    })
  })
})
