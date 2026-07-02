"use client";

import { useMemo } from "react";

import type { ClassifiedPhotoRow } from "../core/types";
import { groupPhotos, type GroupedPhotos } from "../core/groupPhotos";

export function useGroupedPhotos(
  classified: ClassifiedPhotoRow[],
): GroupedPhotos {
  return useMemo(() => groupPhotos(classified), [classified]);
}
