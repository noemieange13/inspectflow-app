import {
  isSnapshotStored8J,
  parseReportProfessionalSnapshotV1,
  readReportProfessionalSnapshotFromPayload,
  toInspectorProfileV1FromSnapshot,
  type ReportProfessionalSnapshotV1,
} from "@/lib/inspectorProfile";
import {
  INSPECTOR_PROFILE_PAYLOAD_KEY,
  parseCoverV1FromUnknown,
  parseInspectorProfileFromUnknown,
  type InspectionCoverPayloadV1,
} from "@/lib/inspectionCoverPayload";
import type { ProfessionalBranding } from "@/lib/report_template_engine/types";

export function brandingFromSnapshot(
  snapshot: ReportProfessionalSnapshotV1,
): ProfessionalBranding {
  return {
    companyName: snapshot.company.trim(),
    logoUrl: snapshot.logo?.trim() || null,
    inspectorName: snapshot.inspector.trim(),
    inspectorTitle: snapshot.title?.trim() || null,
    certification: snapshot.certification.trim(),
    certificationAssociation: snapshot.association?.trim() || null,
    signatureUrl: snapshot.signature?.trim() || null,
    phone: snapshot.phone.trim(),
    email: snapshot.email.trim(),
    website: snapshot.website?.trim() || null,
  };
}

function brandingFromStored8J(
  stored: import("@/lib/inspectorProfile").ReportProfessionalSnapshotStored8J,
): ProfessionalBranding {
  const flat = brandingFromSnapshot(
    parseReportProfessionalSnapshotV1(stored)!,
  );
  return {
    ...flat,
    inspectorTitle: stored.inspector.title?.trim() || flat.inspectorTitle,
    certificationEntries: stored.inspector.certification_entries,
  };
}

export function brandingFromPayload(
  payload: Record<string, unknown>,
): ProfessionalBranding | null {
  const rawStored = payload.report_professional_snapshot_v1;
  if (isSnapshotStored8J(rawStored)) {
    return brandingFromStored8J(rawStored);
  }

  const snapshot = readReportProfessionalSnapshotFromPayload(payload);
  if (snapshot) return brandingFromSnapshot(snapshot);

  const parsed = parseReportProfessionalSnapshotV1(
    payload.report_professional_snapshot_v1,
  );
  if (parsed) return brandingFromSnapshot(parsed);

  const cover = parseCoverV1FromUnknown(payload.cover_v1);
  const profile = parseInspectorProfileFromUnknown(
    payload[INSPECTOR_PROFILE_PAYLOAD_KEY],
  );
  if (!cover && !profile) return null;

  return {
    companyName: cover?.compagnie?.trim() || profile?.compagnie?.trim() || "",
    logoUrl: profile?.logo_data_url?.trim() || null,
    inspectorName: cover?.inspecteur_nom?.trim() || profile?.nom?.trim() || "",
    certification:
      cover?.inspecteur_numero_certification?.trim() ||
      profile?.numero_certification?.trim() ||
      "",
    signatureUrl: profile?.signature_data_url?.trim() || null,
    phone: "",
    email: "",
    website: null,
  };
}

export function coverFieldsFromPayload(
  payload: Record<string, unknown>,
  branding: ProfessionalBranding,
): {
  cover: InspectionCoverPayloadV1 | null;
  address: string;
  clientName: string;
  inspectionDate: string;
  inspectorName: string;
  certification: string;
} {
  const cover = parseCoverV1FromUnknown(payload.cover_v1);
  const profile = parseInspectorProfileFromUnknown(
    payload[INSPECTOR_PROFILE_PAYLOAD_KEY],
  );
  const snap = readReportProfessionalSnapshotFromPayload(payload);
  const profileFromSnap = snap ? toInspectorProfileV1FromSnapshot(snap) : null;

  return {
    cover,
    address: cover?.propriete?.adresse?.trim() || "—",
    clientName: cover?.propriete?.client_nom?.trim() || "—",
    inspectionDate: cover?.date_heure_affichage?.trim() || "—",
    inspectorName:
      branding.inspectorName ||
      cover?.inspecteur_nom?.trim() ||
      profile?.nom?.trim() ||
      profileFromSnap?.nom?.trim() ||
      "—",
    certification:
      branding.certification ||
      cover?.inspecteur_numero_certification?.trim() ||
      profile?.numero_certification?.trim() ||
      "—",
  };
}
