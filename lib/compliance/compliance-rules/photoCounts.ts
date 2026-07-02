import { isObservationId } from "@/lib/observationIds";
import {
  QC_MIN_PHOTOS_BY_SYSTEM,
  QC_SYSTEM_CODES,
  type QcSystemCode,
} from "@/lib/qcSystemSections";

import type { ComplianceContext, NormalizedConstat } from "./types";

export function constatIdsForSystem(
  constats: NormalizedConstat[],
  systemCode: QcSystemCode,
): Set<string> {
  const out = new Set<string>();
  for (const c of constats) {
    if (c.systemCode === systemCode && isObservationId(c.id)) out.add(c.id);
  }
  return out;
}

/** Compte les photos liées via observation_id === constat.id uniquement. */
export function countLinkedPhotosForConstatIds(
  ctx: ComplianceContext,
  constatIds: ReadonlySet<string>,
): number {
  if (constatIds.size === 0) return 0;
  const seen = new Set<string>();
  let count = 0;
  for (const p of ctx.photos) {
    if (!isObservationId(p.photo_id)) continue;
    if (!p.observation_id || !constatIds.has(p.observation_id)) continue;
    if (seen.has(p.photo_id)) continue;
    seen.add(p.photo_id);
    count++;
  }
  return count;
}

export function countLinkedPhotosForSystem(
  ctx: ComplianceContext,
  systemCode: QcSystemCode,
): number {
  return countLinkedPhotosForConstatIds(ctx, constatIdsForSystem(ctx.constats, systemCode));
}

export function findInsufficientLinkedPhotoSystems(ctx: ComplianceContext): QcSystemCode[] {
  const bad: QcSystemCode[] = [];
  for (const code of QC_SYSTEM_CODES) {
    const hasConstat = ctx.constats.some(
      (c) => c.systemCode === code && c.hasObservationText,
    );
    if (!hasConstat) continue;
    const min = QC_MIN_PHOTOS_BY_SYSTEM[code];
    const got = countLinkedPhotosForSystem(ctx, code);
    if (got < min) bad.push(code);
  }
  return bad;
}

export function hasAnyLinkedPhoto(ctx: ComplianceContext): boolean {
  for (const p of ctx.photos) {
    if (!isObservationId(p.photo_id) || !p.observation_id) continue;
    if (ctx.constats.some((c) => c.id === p.observation_id)) return true;
  }
  return false;
}
