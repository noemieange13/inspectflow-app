"use client";

import type { InspectorProfileInput } from "@/lib/inspectorProfile";
import { Field, Section, TextArea } from "./FormPrimitives";
import SignatureUpload from "./SignatureUpload";

type Props = {
  form: InspectorProfileInput;
  set: (key: keyof InspectorProfileInput) => (value: string) => void;
  bearerToken: string | null;
  organizationId?: string | null;
  onLogoUrl: (url: string) => void;
};

export default function CompanySettingsForm({
  form,
  set,
  bearerToken,
  organizationId,
  onLogoUrl,
}: Props) {
  return (
    <Section title="Mon entreprise">
      <Field label="Nom de l'entreprise" id="company_name" value={form.company_name ?? ""} onChange={set("company_name")} />
      <SignatureUpload
        label="Logo de l'entreprise"
        assetType="logo"
        currentUrl={form.logo_url}
        bearerToken={bearerToken}
        organizationId={organizationId}
        onUploaded={onLogoUrl}
      />
      <TextArea label="Adresse (rue)" id="address" value={form.address ?? ""} onChange={set("address")} rows={2} />
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Ville" id="city" value={form.city ?? ""} onChange={set("city")} />
        <Field label="Province" id="province" value={form.province ?? ""} onChange={set("province")} placeholder="QC" />
        <Field label="Code postal" id="postal_code" value={form.postal_code ?? ""} onChange={set("postal_code")} placeholder="H2X 1Y4" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Téléphone" id="phone" value={form.phone ?? ""} onChange={set("phone")} />
        <Field label="Courriel" id="email" type="email" value={form.email ?? ""} onChange={set("email")} />
      </div>
      <Field label="Site web" id="website" value={form.website ?? ""} onChange={set("website")} placeholder="https://" />
    </Section>
  );
}
