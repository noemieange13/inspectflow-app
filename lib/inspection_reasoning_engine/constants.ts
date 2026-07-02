export const INSPECTION_REASONING_VERSION = "2027.1";

/** Minimum de constats jugés liés pour former un motif. */
export const MIN_PATTERN_OBSERVATIONS = 2;

export const MOISTURE_CRACK_PATTERN =
  /\b(fissure|crack|fissuration|crevasse)\b/i;

export const MOISTURE_EFFLORESCENCE_PATTERN =
  /\b(efflorescence|salp[êe]tre|mineral deposit|depot blanc)\b/i;

export const MOISTURE_HUMIDITY_PATTERN =
  /\b(humidit|moisture|infiltr|eau|water|hydrostatic|moisi|mold|moisissure)\b/i;

export const ELECTRICAL_SIGNAL_PATTERN =
  /\b(panneau|panel|[ée]lectri|wiring|filage|junction|bo[îi]te|conducteur|amateur|obsol[èe]te|exposed wire|fil nu)\b/i;

export const STRUCTURAL_SIGNAL_PATTERN =
  /\b(structure|fondation|foundation|poutre|beam|affaissement|settlement|d[ée]formation|mur porteur)\b/i;

export const MAINTENANCE_SIGNAL_PATTERN =
  /\b(usure|wear|entretien|maintenance|peinture|surface|cosm[ée]tique)\b/i;

export const NORMAL_WEAR_PATTERN =
  /\b(usure normale|normal wear|vieillissement normal|typical aging|entretien courant suffisant)\b/i;
