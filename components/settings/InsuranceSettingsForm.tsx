"use client";

import type { InspectorProfileInput } from "@/lib/inspectorProfile";
import { Field, Section } from "./FormPrimitives";

type Props = {
  form: InspectorProfileInput;
  set: (key: keyof InspectorProfileInput) => (value: string) => void;
};

export function InsuranceSettingsForm({ form, set }: Props) {
  return (
    <Section title="Assurance">
      <Field label="Assureur" id="insurance_provider" value={form.insurance_provider ?? ""} onChange={set("insurance_provider")} />
      <Field label="Numéro de police" id="policy_number" value={form.policy_number ?? ""} onChange={set("policy_number")} />
      <Field label="Date d'échéance" id="expiry_date" type="date" value={form.expiry_date ?? ""} onChange={set("expiry_date")} />
    </Section>
  );
}
