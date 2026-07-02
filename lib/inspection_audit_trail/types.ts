export type InspectionAuditEventType =
  | "photo_uploaded"
  | "photo_analyzed"
  | "ai_observation_created"
  | "inspector_modified"
  | "compliance_validated"
  | "pdf_generated"
  | "access_denied"
  | "inspection_assigned"
  | "inspection_unassigned"
  | "organization_invitation_sent"
  | "organization_member_joined"
  | "billing_plan_changed";

export type InspectionAuditActorType = "system" | "ai" | "inspector";

export type InspectionAuditEventRow = {
  id: string;
  inspection_id: string | null;
  report_id: string;
  event_type: InspectionAuditEventType;
  actor_type: InspectionAuditActorType;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type RecordInspectionEventInput = {
  report_id: string;
  inspection_id?: string | null;
  event_type: InspectionAuditEventType;
  actor_type: InspectionAuditActorType;
  metadata?: Record<string, unknown>;
  created_at?: string;
};

export type RecordInspectionEventResult = {
  recorded: boolean;
  id?: string;
  error?: string;
};
