/**
 * Type definitions for clankie's WebSocket RPC protocol.
 * Mirrors the protocol defined in clankie's src/channels/web.ts
 */

export type ThinkingLevel =
  | 'off'
  | 'minimal'
  | 'low'
  | 'medium'
  | 'high'
  | 'xhigh'

export interface ImageContent {
  type: 'image'
  data: string
  mimeType: string
}

// ─── RPC Commands (Client → Server) ───────────────────────────────────────────

export type RpcCommand =
  | {
      id?: string
      type: 'prompt'
      message: string
      images?: Array<ImageContent>
      streamingBehavior?: 'steer' | 'followUp'
    }
  | {
      id?: string
      type: 'steer'
      message: string
      images?: Array<ImageContent>
    }
  | {
      id?: string
      type: 'follow_up'
      message: string
      images?: Array<ImageContent>
    }
  | { id?: string; type: 'abort' }
  | {
      id?: string
      type: 'upload_attachment'
      fileName: string
      data: string
      mimeType: string
    }
  | { id?: string; type: 'new_session'; parentSession?: string }
  | { id?: string; type: 'list_sessions' }
  | { id?: string; type: 'get_state' }
  | { id?: string; type: 'set_model'; provider: string; modelId: string }
  | { id?: string; type: 'cycle_model' }
  | { id?: string; type: 'get_available_models' }
  | { id?: string; type: 'set_thinking_level'; level: ThinkingLevel }
  | { id?: string; type: 'cycle_thinking_level' }
  | { id?: string; type: 'set_steering_mode'; mode: 'all' | 'one-at-a-time' }
  | { id?: string; type: 'set_follow_up_mode'; mode: 'all' | 'one-at-a-time' }
  | { id?: string; type: 'compact'; customInstructions?: string }
  | { id?: string; type: 'set_auto_compaction'; enabled: boolean }
  | { id?: string; type: 'set_auto_retry'; enabled: boolean }
  | { id?: string; type: 'abort_retry' }
  | { id?: string; type: 'bash'; command: string }
  | { id?: string; type: 'abort_bash' }
  | { id?: string; type: 'get_session_stats' }
  | { id?: string; type: 'export_html'; outputPath?: string }
  | { id?: string; type: 'switch_session'; sessionPath: string }
  | { id?: string; type: 'fork'; entryId: string }
  | { id?: string; type: 'get_fork_messages' }
  | { id?: string; type: 'get_last_assistant_text' }
  | { id?: string; type: 'set_session_name'; name: string }
  | { id?: string; type: 'get_messages' }
  | { id?: string; type: 'get_commands' }
  | { id?: string; type: 'get_extensions' }
  | { id?: string; type: 'get_skills' }
  | { id?: string; type: 'install_package'; source: string; local?: boolean }
  | { id?: string; type: 'reload' }
  | { id?: string; type: 'get_auth_providers' }
  | { id?: string; type: 'auth_login'; providerId: string }
  | {
      id?: string
      type: 'auth_set_api_key'
      providerId: string
      apiKey: string
    }
  | {
      id?: string
      type: 'auth_login_input'
      loginFlowId: string
      value: string
    }
  | { id?: string; type: 'auth_login_cancel'; loginFlowId: string }
  | { id?: string; type: 'auth_logout'; providerId: string }

// ─── RPC Responses (Server → Client) ──────────────────────────────────────────

export type RpcResponse =
  | {
      id?: string
      type: 'response'
      command: string
      success: true
      data?: unknown
    }
  | {
      id?: string
      type: 'response'
      command: string
      success: false
      error: string
    }

// ─── Agent Session Events (Server → Client) ───────────────────────────────────

export interface MessageContentText {
  type: 'text'
  text: string
}

export interface MessageContentToolUse {
  type: 'tool_use'
  id: string
  name: string
  input: unknown
}

export interface MessageContentToolResult {
  type: 'tool_result'
  tool_use_id: string
  content: string
  is_error?: boolean
}

export interface MessageContentThinking {
  type: 'thinking'
  thinking: string
}

export type MessageContent =
  | MessageContentText
  | MessageContentToolUse
  | MessageContentToolResult
  | MessageContentThinking

export interface Message {
  role: string // Can be "user", "assistant", "toolResult", "bashExecution", "custom", "branchSummary", "compactionSummary"
  content?: string | Array<MessageContent>
  // Fields from custom message types that may be present
  [key: string]: unknown
}

export interface ModelInfo {
  provider: string
  id: string
  name: string
  inputPrice?: number
  outputPrice?: number
  contextWindow?: number
  supportsImages?: boolean
  supportsPromptCache?: boolean
}

// ─── Assistant message sub-events (nested in message_update) ──────────────────

export type AssistantMessageEvent =
  | { type: 'start'; partial: any }
  | { type: 'text_start'; contentIndex: number; partial: any }
  | { type: 'text_delta'; contentIndex: number; delta: string; partial: any }
  | { type: 'text_end'; contentIndex: number; content: string; partial: any }
  | { type: 'thinking_start'; contentIndex: number; partial: any }
  | {
      type: 'thinking_delta'
      contentIndex: number
      delta: string
      partial: any
    }
  | {
      type: 'thinking_end'
      contentIndex: number
      content: string
      partial: any
    }
  | { type: 'toolcall_start'; contentIndex: number; partial: any }
  | {
      type: 'toolcall_delta'
      contentIndex: number
      delta: string
      partial: any
    }
  | { type: 'toolcall_end'; contentIndex: number; toolCall: any; partial: any }
  | { type: 'done'; reason: string; message: any }
  | { type: 'error'; reason: string; error: any }

// ─── Agent events (pi-agent-core protocol) ────────────────────────────────────

export type AgentSessionEvent =
  // Session-level events
  | { type: 'session_start'; sessionId: string }
  | { type: 'model_changed'; model: ModelInfo }
  | { type: 'thinking_level_changed'; level: ThinkingLevel }
  | { type: 'session_name_changed'; name: string }
  | { type: 'state_update'; state: SessionState }
  // Agent lifecycle
  | { type: 'agent_start' }
  | { type: 'agent_end'; messages: Array<any> }
  // Turn lifecycle
  | { type: 'turn_start' }
  | { type: 'turn_end'; message: any; toolResults: Array<any> }
  // Message streaming
  | { type: 'message_start'; message: any }
  | {
      type: 'message_update'
      message: any
      assistantMessageEvent: AssistantMessageEvent
    }
  | { type: 'message_end'; message: any }
  // Tool execution
  | {
      type: 'tool_execution_start'
      toolCallId: string
      toolName: string
      args: any
    }
  | {
      type: 'tool_execution_update'
      toolCallId: string
      toolName: string
      args: any
      partialResult: any
    }
  | {
      type: 'tool_execution_end'
      toolCallId: string
      toolName: string
      result: any
      isError: boolean
    }
  // Compaction
  | { type: 'compact_start' }
  | { type: 'compact_end'; originalCount: number; compactedCount: number }
  | { type: 'auto_compaction_start'; reason: string }
  | {
      type: 'auto_compaction_end'
      result: any
      aborted: boolean
      willRetry: boolean
      errorMessage?: string
    }
  // Error
  | { type: 'error'; error: string }

export interface SessionState {
  model: ModelInfo
  thinkingLevel: ThinkingLevel
  isStreaming: boolean
  isCompacting: boolean
  steeringMode: 'all' | 'one-at-a-time'
  followUpMode: 'all' | 'one-at-a-time'
  sessionFile: string
  sessionId: string
  sessionName?: string
  autoCompactionEnabled: boolean
  messageCount: number
  pendingMessageCount: number
}

// ─── Auth Provider & Events ────────────────────────────────────────────────────

export interface AuthProvider {
  id: string
  name: string
  type: 'oauth' | 'apikey'
  hasAuth: boolean
  usesCallbackServer?: boolean
}

export type AuthEvent =
  | {
      type: 'auth_event'
      loginFlowId: string
      event: 'url'
      url: string
      instructions?: string
    }
  | {
      type: 'auth_event'
      loginFlowId: string
      event: 'prompt'
      message: string
      placeholder?: string
    }
  | { type: 'auth_event'; loginFlowId: string; event: 'manual_input' }
  | {
      type: 'auth_event'
      loginFlowId: string
      event: 'progress'
      message: string
    }
  | {
      type: 'auth_event'
      loginFlowId: string
      event: 'complete'
      success: boolean
      error?: string
    }

export type ExtensionUIRequest =
  | {
      type: 'extension_ui_request'
      id: string
      method: 'select'
      title: string
      options: Array<string>
      timeout?: number
    }
  | {
      type: 'extension_ui_request'
      id: string
      method: 'confirm'
      title: string
      message: string
      timeout?: number
    }
  | {
      type: 'extension_ui_request'
      id: string
      method: 'input'
      title: string
      placeholder?: string
      timeout?: number
    }
  | {
      type: 'extension_ui_request'
      id: string
      method: 'editor'
      title: string
      prefill?: string
    }
  | {
      type: 'extension_ui_request'
      id: string
      method: 'notify'
      message: string
      notifyType?: 'info' | 'warning' | 'error'
    }
  | {
      type: 'extension_ui_request'
      id: string
      method: 'setStatus'
      statusKey: string
      statusText?: string
    }
  | {
      type: 'extension_ui_request'
      id: string
      method: 'setWidget'
      widgetKey: string
      widgetLines?: Array<string>
      widgetPlacement?: 'aboveEditor' | 'belowEditor'
    }
  | {
      type: 'extension_ui_request'
      id: string
      method: 'setTitle'
      title: string
    }
  | {
      type: 'extension_ui_request'
      id: string
      method: 'set_editor_text'
      text: string
    }

export type ExtensionUIResponse =
  | { type: 'extension_ui_response'; id: string; value: string }
  | { type: 'extension_ui_response'; id: string; confirmed: boolean }
  | { type: 'extension_ui_response'; id: string; cancelled: true }

// ─── Extensions & Skills ───────────────────────────────────────────────────────

export interface ExtensionInfo {
  path: string
  resolvedPath: string
  tools: Array<string>
  commands: Array<string>
  flags: Array<string>
  shortcuts: Array<string>
}

export interface ExtensionError {
  path: string
  error: string
}

export interface SkillInfo {
  name: string
  description: string
  filePath: string
  baseDir: string
  source: string
  disableModelInvocation: boolean
}

export interface SkillDiagnostic {
  type: string
  message: string
  path?: string
}

// ─── WebSocket Message Wrapper ─────────────────────────────────────────────────

export interface InboundWebMessage {
  sessionId?: string
  command: RpcCommand
}

export interface OutboundWebMessage {
  sessionId: string // "_auth" for auth events
  event: AgentSessionEvent | RpcResponse | AuthEvent | ExtensionUIRequest
}
