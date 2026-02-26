import { Store } from '@tanstack/store'
import type { ExtensionUIRequest, ExtensionUIResponse } from '@/lib/types'

export interface ExtensionWidget {
  key: string
  lines: Array<string>
  placement: 'aboveEditor' | 'belowEditor'
}

export interface ExtensionUIStore {
  pendingDialog: ExtensionUIRequest | null
  statusByKey: Record<string, string>
  widgetsByKey: Record<string, ExtensionWidget>
  notifications: Array<{
    id: string
    type: 'info' | 'warning' | 'error'
    message: string
  }>
  editorText: string
  title?: string
}

const INITIAL_STATE: ExtensionUIStore = {
  pendingDialog: null,
  statusByKey: {},
  widgetsByKey: {},
  notifications: [],
  editorText: '',
  title: undefined,
}

export const extensionUIStore = new Store<ExtensionUIStore>(INITIAL_STATE)

export function handleExtensionUIRequest(request: ExtensionUIRequest): void {
  extensionUIStore.setState((state) => {
    if (request.method === 'notify') {
      return {
        ...state,
        notifications: [
          ...state.notifications,
          {
            id: request.id,
            type: request.notifyType ?? 'info',
            message: request.message,
          },
        ].slice(-5),
      }
    }

    if (request.method === 'setStatus') {
      const next = { ...state.statusByKey }
      if (request.statusText) {
        next[request.statusKey] = request.statusText
      } else {
        delete next[request.statusKey]
      }
      return {
        ...state,
        statusByKey: next,
      }
    }

    if (request.method === 'setWidget') {
      const next = { ...state.widgetsByKey }
      if (request.widgetLines && request.widgetLines.length > 0) {
        next[request.widgetKey] = {
          key: request.widgetKey,
          lines: request.widgetLines,
          placement: request.widgetPlacement ?? 'aboveEditor',
        }
      } else {
        delete next[request.widgetKey]
      }
      return {
        ...state,
        widgetsByKey: next,
      }
    }

    if (request.method === 'setTitle') {
      return {
        ...state,
        title: request.title,
      }
    }

    if (request.method === 'set_editor_text') {
      return {
        ...state,
        editorText: request.text,
      }
    }

    return {
      ...state,
      pendingDialog: request,
    }
  })
}

export function clearPendingDialog(): void {
  extensionUIStore.setState((state) => ({
    ...state,
    pendingDialog: null,
  }))
}

export function shiftNotification(): void {
  extensionUIStore.setState((state) => ({
    ...state,
    notifications: state.notifications.slice(1),
  }))
}

export function resetExtensionUI(): void {
  extensionUIStore.setState(() => INITIAL_STATE)
}

export function confirmExtensionDialog(
  confirmed: boolean,
): ExtensionUIResponse {
  const pending = extensionUIStore.state.pendingDialog
  if (!pending) {
    return { type: 'extension_ui_response', id: '', cancelled: true }
  }
  clearPendingDialog()
  return { type: 'extension_ui_response', id: pending.id, confirmed }
}

export function valueExtensionDialog(value: string): ExtensionUIResponse {
  const pending = extensionUIStore.state.pendingDialog
  if (!pending) {
    return { type: 'extension_ui_response', id: '', cancelled: true }
  }
  clearPendingDialog()
  return { type: 'extension_ui_response', id: pending.id, value }
}

export function cancelExtensionDialog(): ExtensionUIResponse {
  const pending = extensionUIStore.state.pendingDialog
  if (!pending) {
    return { type: 'extension_ui_response', id: '', cancelled: true }
  }
  clearPendingDialog()
  return { type: 'extension_ui_response', id: pending.id, cancelled: true }
}
