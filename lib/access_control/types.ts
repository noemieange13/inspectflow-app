export type OrganizationType = "personal" | "company";

export type OrganizationRole = "owner" | "admin" | "inspector" | "assistant";

export type MembershipStatus = "active" | "invited" | "disabled";

export type AccessUser = {
  id: string;
  membership: {
    organization_id: string;
    role: OrganizationRole;
    status: MembershipStatus;
  } | null;
};

export type AccessInspection = {
  report_id: string;
  inspection_id: string | null;
  organization_id: string | null;
  owner_user_id: string;
};

export type ReportAccessAction = "view" | "edit" | "upload" | "pdf" | "manage_organization";

export type InspectionAssignmentRole = "lead_inspector" | "assistant";

export type InspectionAssignmentStatus = "active" | "removed";

/** Assignation active de l'utilisateur courant sur le rapport (Phase 6C). */
export type AccessInspectionAssignment = {
  role: InspectionAssignmentRole;
  status: InspectionAssignmentStatus;
};

export type AccessContext = {
  user: AccessUser;
  inspection: AccessInspection;
  assignment?: AccessInspectionAssignment | null;
};

export type Organization = {
  id: string;
  name: string;
  type: OrganizationType;
  created_by: string;
  created_at: string;
};

export type OrganizationMember = {
  id: string;
  organization_id: string;
  user_id: string;
  role: OrganizationRole;
  status: MembershipStatus;
  created_at: string;
};
