"use client";

import type { InspectorProfileInput } from "@/lib/inspectorProfile";
import { Field, Section } from "./FormPrimitives";

type Props = {
  form: InspectorProfileInput;
  set: (key: keyof InspectorProfileInput) => (value: string) => void;
};

export default function InspectorProfileForm({ form, set }: Props) {
  return (
    <Section title="Mon profil">
      <Field
        label="Nom affiché"
        id="display_name"
        value={form.display_name ?? ""}
        onChange={set("display_name")}
        placeholder="Jean Tremblay"
        hint="Tel qu'il apparaîtra sur vos rapports."
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Prénom" id="first_name" value={form.first_name ?? ""} onChange={set("first_name")} />
        <Field label="Nom" id="last_name" value={form.last_name ?? ""} onChange={set("last_name")} />
      </div>
      <Field
        label="Titre professionnel"
        id="professional_title"
        value={form.professional_title ?? form.title ?? ""}
        onChange={set("professional_title")}
        placeholder="Inspecteur en bâtiment"
      />
      <Field label="Association" id="association" value={form.association ?? ""} onChange={set("association")} placeholder="AIBQ" />
      <Field
        label="Numéro de certification"
        id="certification_number"
        value={form.certification_number ?? ""}
        onChange={set("certification_number")}
      />
      <Field
        label="Numéro de permis / licence"
        id="license_number"
        value={form.license_number ?? ""}
        onChange={set("license_number")}
      />
    </Section>
  );
}
