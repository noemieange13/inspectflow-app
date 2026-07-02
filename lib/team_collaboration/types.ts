export type InspectionAssignmentRole = "lead_inspector" | "assistant";

export type InspectionAssignmentStatus = "active" | "removed";

export type InspectionAssignment = {
  id: string;
  report_id: string;
  organization_id: string;
  assigned_to_user_id: string;
  assigned_by_user_id: string;
  role: InspectionAssignmentRole;
  status: InspectionAssignmentStatus;
  created_at: string;
};

export type AssignInspectionInput = {
  report_id: string;
  organization_id: string;
  assigned_to_user_id: string;
  assigned_by_user_id: string;
  role: InspectionAssignmentRole;
};
