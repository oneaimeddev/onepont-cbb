export type AuditEvent = {
  actor_user_id: string | null;
  actor_professional_id?: string;
  operation: string;
  resource_type: string;
  resource_id?: string;
  athlete_id?: string;
  occurred_at: string;
  origin_channel: "traditional_ui" | "ai_chat" | "ai_voice" | "system";
  execution_method: "human_ui" | "agent_tool" | "system";
  outcome: "success" | "denied" | "failed";
  request_id: string;
  conversation_id?: string;
  approval_id?: string;
  approved_by_user_id?: string;
  changed_fields?: readonly string[];
};
