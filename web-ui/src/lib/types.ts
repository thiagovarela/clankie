/**
 * Type definitions for clankie's WebSocket RPC protocol.
 * Mirrors the protocol defined in clankie's src/channels/web.ts
 */

export type ThinkingLevel = "none" | "normal" | "extended";

export interface ImageContent {
  type: "image";
  data: string;
  mimeType: string;
}

// ─── RPC Commands (Client → Server) ───────────────────────────────────────────

export type RpcCommand =
  | { id?: string; type: "prompt"; message: string; images?: ImageContent[]; streamingBehavior?: "steer" | "followUp" }
  | { id?: string; type: "steer"; message: string; images?: ImageContent[] }
  | { id?: string; type: "follow_up"; message: string; images?: ImageContent[] }
  | { id?: string; type: "abort" }
  | { id?: string; type: "new_session"; parentSession?: string }
  | { id?: string; type: "get_state" }
  | { id?: string; type: "set_model"; provider: string; modelId: string }
  | { id?: string; type: "cycle_model" }
  | { id?: string; type: "get_available_models" }
  | { id?: string; type: "set_thinking_level"; level: ThinkingLevel }
  | { id?: string; type: "cycle_thinking_level" }
  | { id?: string; type: "set_steering_mode"; mode: "all" | "one-at-a-time" }
  | { id?: string; type: "set_follow_up_mode"; mode: "all" | "one-at-a-time" }
  | { id?: string; type: "compact"; customInstructions?: string }
  | { id?: string; type: "set_auto_compaction"; enabled: boolean }
  | { id?: string; type: "set_auto_retry"; enabled: boolean }
  | { id?: string; type: "abort_retry" }
  | { id?: string; type: "bash"; command: string }
  | { id?: string; type: "abort_bash" }
  | { id?: string; type: "get_session_stats" }
  | { id?: string; type: "export_html"; outputPath?: string }
  | { id?: string; type: "switch_session"; sessionPath: string }
  | { id?: string; type: "fork"; entryId: string }
  | { id?: string; type: "get_fork_messages" }
  | { id?: string; type: "get_last_assistant_text" }
  | { id?: string; type: "set_session_name"; name: string }
  | { id?: string; type: "get_messages" }
  | { id?: string; type: "get_commands" };

// ─── RPC Responses (Server → Client) ──────────────────────────────────────────

export type RpcResponse =
  | { id?: string; type: "response"; command: string; success: true; data?: unknown }
  | { id?: string; type: "response"; command: string; success: false; error: string };

// ─── Agent Session Events (Server → Client) ───────────────────────────────────

export interface MessageContentText {
  type: "text";
  text: string;
}

export interface MessageContentToolUse {
  type: "tool_use";
  id: string;
  name: string;
  input: unknown;
}

export interface MessageContentToolResult {
  type: "tool_result";
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

export interface MessageContentThinking {
  type: "thinking";
  thinking: string;
}

export type MessageContent = MessageContentText | MessageContentToolUse | MessageContentToolResult | MessageContentThinking;

export interface Message {
  role: "user" | "assistant";
  content: MessageContent[];
}

export interface ModelInfo {
  provider: string;
  id: string;
  name: string;
  inputPrice?: number;
  outputPrice?: number;
  contextWindow?: number;
  supportsImages?: boolean;
  supportsPromptCache?: boolean;
}

export type AgentSessionEvent =
  | { type: "session_start"; sessionId: string }
  | { type: "prompt_start" }
  | { type: "prompt_end" }
  | { type: "stream_start" }
  | { type: "stream_token"; text: string; accumulated: string }
  | { type: "stream_end" }
  | { type: "thinking_start"; level: ThinkingLevel }
  | { type: "thinking_token"; text: string; accumulated: string }
  | { type: "thinking_end" }
  | { type: "tool_use_start"; toolName: string; toolUseId: string }
  | { type: "tool_use_input_delta"; toolUseId: string; delta: string }
  | { type: "tool_use_end"; toolUseId: string }
  | { type: "tool_result"; toolUseId: string; result: string; isError: boolean }
  | { type: "compact_start" }
  | { type: "compact_end"; originalCount: number; compactedCount: number }
  | { type: "model_changed"; model: ModelInfo }
  | { type: "thinking_level_changed"; level: ThinkingLevel }
  | { type: "session_name_changed"; name: string }
  | { type: "error"; error: string }
  | { type: "state_update"; state: SessionState };

export interface SessionState {
  model: ModelInfo;
  thinkingLevel: ThinkingLevel;
  isStreaming: boolean;
  isCompacting: boolean;
  steeringMode: "all" | "one-at-a-time";
  followUpMode: "all" | "one-at-a-time";
  sessionFile: string;
  sessionId: string;
  sessionName?: string;
  autoCompactionEnabled: boolean;
  messageCount: number;
  pendingMessageCount: number;
}

// ─── WebSocket Message Wrapper ─────────────────────────────────────────────────

export interface InboundWebMessage {
  sessionId?: string;
  command: RpcCommand;
}

export interface OutboundWebMessage {
  sessionId: string;
  event: AgentSessionEvent | RpcResponse;
}
