import { describe, expect, it } from 'vitest'
import {
  extensionsStore,
  resetExtensions,
  resetInstallStatus,
  setExtensions,
  setInstallStatus,
  setLoading,
  setSkills,
} from '../extensions'
import type {
  ExtensionError,
  ExtensionInfo,
  SkillDiagnostic,
  SkillInfo,
} from '@/lib/types'

describe('extensions store', () => {
  describe('setLoading', () => {
    it('sets isLoading to true', () => {
      setLoading(true)

      expect(extensionsStore.state.isLoading).toBe(true)
    })

    it('sets isLoading to false', () => {
      setLoading(true)
      setLoading(false)

      expect(extensionsStore.state.isLoading).toBe(false)
    })
  })

  describe('setExtensions', () => {
    it('sets the extensions list and errors, clears loading flag', () => {
      const extensions: Array<ExtensionInfo> = [
        {
          path: '~/.pi/extensions/my-ext',
          resolvedPath: '/home/user/.pi/extensions/my-ext',
          tools: ['tool1', 'tool2'],
          commands: ['cmd1'],
          flags: [],
          shortcuts: [],
        },
      ]

      const errors: Array<ExtensionError> = [
        {
          path: '~/.pi/extensions/broken-ext',
          error: 'Failed to load',
        },
      ]

      setLoading(true)
      setExtensions(extensions, errors)

      expect(extensionsStore.state).toMatchObject({
        extensions,
        extensionErrors: errors,
        isLoading: false,
      })
    })

    it('handles empty extensions and errors', () => {
      setExtensions([], [])

      expect(extensionsStore.state).toMatchObject({
        extensions: [],
        extensionErrors: [],
        isLoading: false,
      })
    })

    it('replaces previous extensions and errors', () => {
      setExtensions(
        [
          {
            path: 'old',
            resolvedPath: 'old',
            tools: [],
            commands: [],
            flags: [],
            shortcuts: [],
          },
        ],
        [{ path: 'old-error', error: 'old' }],
      )

      setExtensions(
        [
          {
            path: 'new',
            resolvedPath: 'new',
            tools: [],
            commands: [],
            flags: [],
            shortcuts: [],
          },
        ],
        [{ path: 'new-error', error: 'new' }],
      )

      expect(extensionsStore.state.extensions).toHaveLength(1)
      expect(extensionsStore.state.extensions[0].path).toBe('new')
      expect(extensionsStore.state.extensionErrors).toHaveLength(1)
      expect(extensionsStore.state.extensionErrors[0].path).toBe('new-error')
    })
  })

  describe('setSkills', () => {
    it('sets the skills list and diagnostics, clears loading flag', () => {
      const skills: Array<SkillInfo> = [
        {
          name: 'my-skill',
          description: 'A test skill',
          filePath: '/path/to/SKILL.md',
          baseDir: '/path/to',
          source: 'local',
          disableModelInvocation: false,
        },
      ]

      const diagnostics: Array<SkillDiagnostic> = [
        {
          type: 'warning',
          message: 'Missing field',
          path: '/path/to/other.md',
        },
      ]

      setLoading(true)
      setSkills(skills, diagnostics)

      expect(extensionsStore.state).toMatchObject({
        skills,
        skillDiagnostics: diagnostics,
        isLoading: false,
      })
    })

    it('handles empty skills and diagnostics', () => {
      setSkills([], [])

      expect(extensionsStore.state).toMatchObject({
        skills: [],
        skillDiagnostics: [],
        isLoading: false,
      })
    })
  })

  describe('setInstallStatus', () => {
    it('updates install status with partial merge', () => {
      setInstallStatus({ isInstalling: true, output: 'Installing...' })

      expect(extensionsStore.state.installStatus).toMatchObject({
        isInstalling: true,
        output: 'Installing...',
        exitCode: null,
      })
    })

    it('supports incremental updates', () => {
      setInstallStatus({ isInstalling: true })
      setInstallStatus({ output: 'Step 1' })
      setInstallStatus({ output: 'Step 1\nStep 2' })
      setInstallStatus({ exitCode: 0, isInstalling: false })

      expect(extensionsStore.state.installStatus).toMatchObject({
        isInstalling: false,
        output: 'Step 1\nStep 2',
        exitCode: 0,
      })
    })

    it('sets error message', () => {
      setInstallStatus({ error: 'Installation failed' })

      expect(extensionsStore.state.installStatus.error).toBe(
        'Installation failed',
      )
    })
  })

  describe('resetInstallStatus', () => {
    it('resets install status to initial state', () => {
      setInstallStatus({
        isInstalling: true,
        output: 'Test output',
        exitCode: 1,
        error: 'Test error',
      })

      resetInstallStatus()

      expect(extensionsStore.state.installStatus).toEqual({
        isInstalling: false,
        output: '',
        exitCode: null,
        error: undefined,
      })
    })
  })

  describe('resetExtensions', () => {
    it('resets the entire store to initial state', () => {
      setExtensions(
        [
          {
            path: 'ext',
            resolvedPath: 'ext',
            tools: [],
            commands: [],
            flags: [],
            shortcuts: [],
          },
        ],
        [{ path: 'err', error: 'err' }],
      )
      setSkills(
        [
          {
            name: 'skill',
            description: 'desc',
            filePath: 'path',
            baseDir: 'base',
            source: 'local',
            disableModelInvocation: false,
          },
        ],
        [{ type: 'warning', message: 'warn' }],
      )
      setLoading(true)
      setInstallStatus({ isInstalling: true })

      resetExtensions()

      expect(extensionsStore.state).toEqual({
        extensions: [],
        extensionErrors: [],
        skills: [],
        skillDiagnostics: [],
        isLoading: false,
        installStatus: {
          isInstalling: false,
          output: '',
          exitCode: null,
        },
      })
    })
  })
})
