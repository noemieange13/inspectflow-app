import { useEffect, useState } from "react";
import SectionCard from "./SectionCard";
import { supabase } from "../lib/supabase";

type Props = {
  inspectionId: string;
};

type FormState = {
  requester: {
    name: string;
    phone: string;
    email: string;
    address: string;
  };
  inspectedproperty: {
    addressline1: string;
    city: string;
    province: string;
    postalcode: string;
    buildingtype: string;
    yearbuilt: string;
    floors: string;
    occupancy: string;
    mainuse: string;
  };
  clientcontact: {
    name: string;
    phone: string;
    email: string;
  };
  weather: {
    summary: string;
    temperaturec: string;
    precipitation: string;
    wind: string;
    source: string;
  };
  inspectionmeta: {
    inspectiondate: string;
    starttime: string;
    endtime: string;
    durationtext: string;
    entrymode: string;
  };
  buildingsummary: {
    mode: string;
    text: string;
    confidence: number | null;
  };
  generalcondition: {
    text: string;
    rating: string;
    confidence: number | null;
  };
  facadeorientation: {
    value: string;
    source: string;
    confidence: number | null;
  };
  fieldnotes: {
    manualnotes: string;
    voicenotessummary: string;
    handwrittennotessummary: string;
  };
  provincecode: string;
  complianceprofile: string;
};

const emptyState: FormState = {
  requester: { name: "", phone: "", email: "", address: "" },
  inspectedproperty: {
    addressline1: "",
    city: "",
    province: "QC",
    postalcode: "",
    buildingtype: "",
    yearbuilt: "",
    floors: "",
    occupancy: "",
    mainuse: "",
  },
  clientcontact: { name: "", phone: "", email: "" },
  weather: {
    summary: "",
    temperaturec: "",
    precipitation: "",
    wind: "",
    source: "manual",
  },
  inspectionmeta: {
    inspectiondate: new Date().toISOString().slice(0, 10),
    starttime: "",
    endtime: "",
    durationtext: "",
    entrymode: "manual",
  },
  buildingsummary: { mode: "manual", text: "", confidence: null },
  generalcondition: { text: "", rating: "", confidence: null },
  facadeorientation: { value: "", source: "manual", confidence: null },
  fieldnotes: {
    manualnotes: "",
    voicenotessummary: "",
    handwrittennotessummary: "",
  },
  provincecode: "QC",
  complianceprofile: "QC-2027",
};

type ReportFormDataRow = {
  id: string;
  inspectionid: string;
  requester?: FormState["requester"];
  inspectedproperty?: FormState["inspectedproperty"];
  clientcontact?: FormState["clientcontact"];
  weather?: FormState["weather"];
  inspectionmeta?: FormState["inspectionmeta"];
  buildingsummary?: FormState["buildingsummary"];
  generalcondition?: FormState["generalcondition"];
  facadeorientation?: FormState["facadeorientation"];
  fieldnotes?: FormState["fieldnotes"];
  provincecode?: string;
  complianceprofile?: string;
};

export default function InspectionForm({ inspectionId }: Props) {
  const [form, setForm] = useState<FormState>(emptyState);
  const [rowId, setRowId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void load();
  }, [inspectionId]);

  async function load() {
    const { data } = await supabase
      .from("reportformdata")
      .select("*")
      .eq("inspectionid", inspectionId)
      .maybeSingle<ReportFormDataRow>();

    if (!data) return;

    setRowId(data.id);
    setForm({
      requester: data.requester ?? emptyState.requester,
      inspectedproperty: data.inspectedproperty ?? emptyState.inspectedproperty,
      clientcontact: data.clientcontact ?? emptyState.clientcontact,
      weather: data.weather ?? emptyState.weather,
      inspectionmeta: data.inspectionmeta ?? emptyState.inspectionmeta,
      buildingsummary: data.buildingsummary ?? emptyState.buildingsummary,
      generalcondition: data.generalcondition ?? emptyState.generalcondition,
      facadeorientation: data.facadeorientation ?? emptyState.facadeorientation,
      fieldnotes: data.fieldnotes ?? emptyState.fieldnotes,
      provincecode: data.provincecode ?? "QC",
      complianceprofile: data.complianceprofile ?? "QC-2027",
    });
  }

  function patch<K extends keyof FormState>(section: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [section]: value }));
  }

  async function save() {
    setSaving(true);

    const payload = {
      inspectionid: inspectionId,
      requester: form.requester,
      inspectedproperty: form.inspectedproperty,
      clientcontact: form.clientcontact,
      weather: form.weather,
      inspectionmeta: form.inspectionmeta,
      buildingsummary: form.buildingsummary,
      generalcondition: form.generalcondition,
      facadeorientation: form.facadeorientation,
      fieldnotes: form.fieldnotes,
      provincecode: form.provincecode,
      complianceprofile: form.complianceprofile,
    };

    const query = rowId
      ? supabase.from("reportformdata").update(payload).eq("id", rowId).select().single()
      : supabase.from("reportformdata").insert(payload).select().single();

    const { data, error } = await query;

    setSaving(false);

    if (error) {
      alert(error.message);
      return;
    }

    if (!rowId && data && typeof data === "object" && "id" in data) {
      setRowId(String((data as { id: string }).id));
    }
    alert("Enregistré");
  }

  return (
    <div className="grid-sections">
      <SectionCard title="Requérant">
        <div className="grid-2">
          <input
            value={form.requester.name}
            placeholder="Nom complet"
            onChange={(e) =>
              patch("requester", { ...form.requester, name: e.target.value })
            }
          />
          <input
            value={form.requester.phone}
            placeholder="Téléphone"
            onChange={(e) =>
              patch("requester", { ...form.requester, phone: e.target.value })
            }
          />
          <input
            value={form.requester.email}
            placeholder="Courriel"
            onChange={(e) =>
              patch("requester", { ...form.requester, email: e.target.value })
            }
          />
          <input
            value={form.requester.address}
            placeholder="Adresse"
            onChange={(e) =>
              patch("requester", { ...form.requester, address: e.target.value })
            }
          />
        </div>
      </SectionCard>

      <SectionCard title="Propriété inspectée">
        <div className="grid-2">
          <input
            value={form.inspectedproperty.addressline1}
            placeholder="Adresse"
            onChange={(e) =>
              patch("inspectedproperty", {
                ...form.inspectedproperty,
                addressline1: e.target.value,
              })
            }
          />
          <input
            value={form.inspectedproperty.city}
            placeholder="Ville"
            onChange={(e) =>
              patch("inspectedproperty", { ...form.inspectedproperty, city: e.target.value })
            }
          />
          <input
            value={form.inspectedproperty.province}
            placeholder="Province"
            onChange={(e) =>
              patch("inspectedproperty", {
                ...form.inspectedproperty,
                province: e.target.value,
              })
            }
          />
          <input
            value={form.inspectedproperty.postalcode}
            placeholder="Code postal"
            onChange={(e) =>
              patch("inspectedproperty", {
                ...form.inspectedproperty,
                postalcode: e.target.value,
              })
            }
          />
          <input
            value={form.inspectedproperty.buildingtype}
            placeholder="Type de bâtiment"
            onChange={(e) =>
              patch("inspectedproperty", {
                ...form.inspectedproperty,
                buildingtype: e.target.value,
              })
            }
          />
          <input
            value={form.inspectedproperty.yearbuilt}
            placeholder="Année de construction"
            onChange={(e) =>
              patch("inspectedproperty", {
                ...form.inspectedproperty,
                yearbuilt: e.target.value,
              })
            }
          />
          <input
            value={form.inspectedproperty.floors}
            placeholder="Nombre d’étages"
            onChange={(e) =>
              patch("inspectedproperty", {
                ...form.inspectedproperty,
                floors: e.target.value,
              })
            }
          />
          <input
            value={form.inspectedproperty.occupancy}
            placeholder="Occupation"
            onChange={(e) =>
              patch("inspectedproperty", {
                ...form.inspectedproperty,
                occupancy: e.target.value,
              })
            }
          />
          <input
            value={form.inspectedproperty.mainuse}
            placeholder="Usage principal"
            onChange={(e) =>
              patch("inspectedproperty", {
                ...form.inspectedproperty,
                mainuse: e.target.value,
              })
            }
          />
        </div>
      </SectionCard>

      <SectionCard title="Client">
        <div className="grid-2">
          <input
            value={form.clientcontact.name}
            placeholder="Nom du client"
            onChange={(e) =>
              patch("clientcontact", { ...form.clientcontact, name: e.target.value })
            }
          />
          <input
            value={form.clientcontact.phone}
            placeholder="Téléphone"
            onChange={(e) =>
              patch("clientcontact", { ...form.clientcontact, phone: e.target.value })
            }
          />
          <input
            value={form.clientcontact.email}
            placeholder="Courriel"
            onChange={(e) =>
              patch("clientcontact", { ...form.clientcontact, email: e.target.value })
            }
          />
        </div>
      </SectionCard>

      <SectionCard title="Inspection">
        <div className="grid-2">
          <input
            type="date"
            value={form.inspectionmeta.inspectiondate}
            onChange={(e) =>
              patch("inspectionmeta", {
                ...form.inspectionmeta,
                inspectiondate: e.target.value,
              })
            }
          />
          <input
            value={form.inspectionmeta.durationtext}
            placeholder="Durée"
            onChange={(e) =>
              patch("inspectionmeta", {
                ...form.inspectionmeta,
                durationtext: e.target.value,
              })
            }
          />
          <input
            type="time"
            value={form.inspectionmeta.starttime}
            onChange={(e) =>
              patch("inspectionmeta", {
                ...form.inspectionmeta,
                starttime: e.target.value,
              })
            }
          />
          <input
            type="time"
            value={form.inspectionmeta.endtime}
            onChange={(e) =>
              patch("inspectionmeta", {
                ...form.inspectionmeta,
                endtime: e.target.value,
              })
            }
          />
        </div>
      </SectionCard>

      <SectionCard title="Météo">
        <div className="grid-2">
          <input
            value={form.weather.summary}
            placeholder="Conditions météo"
            onChange={(e) =>
              patch("weather", { ...form.weather, summary: e.target.value })
            }
          />
          <input
            value={form.weather.temperaturec}
            placeholder="Température °C"
            onChange={(e) =>
              patch("weather", { ...form.weather, temperaturec: e.target.value })
            }
          />
          <input
            value={form.weather.precipitation}
            placeholder="Précipitations"
            onChange={(e) =>
              patch("weather", { ...form.weather, precipitation: e.target.value })
            }
          />
          <input
            value={form.weather.wind}
            placeholder="Vent"
            onChange={(e) => patch("weather", { ...form.weather, wind: e.target.value })}
          />
        </div>
      </SectionCard>

      <SectionCard title="Description sommaire du bâtiment">
        <textarea
          rows={5}
          value={form.buildingsummary.text}
          placeholder="Description sommaire"
          onChange={(e) =>
            patch("buildingsummary", {
              ...form.buildingsummary,
              text: e.target.value,
            })
          }
        />
      </SectionCard>

      <SectionCard title="Condition générale du bâtiment">
        <textarea
          rows={5}
          value={form.generalcondition.text}
          placeholder="Condition générale"
          onChange={(e) =>
            patch("generalcondition", {
              ...form.generalcondition,
              text: e.target.value,
            })
          }
        />
      </SectionCard>

      <SectionCard title="Orientation de la façade">
        <input
          value={form.facadeorientation.value}
          placeholder="Orientation"
          onChange={(e) =>
            patch("facadeorientation", {
              ...form.facadeorientation,
              value: e.target.value,
            })
          }
        />
      </SectionCard>

      <SectionCard title="Notes terrain">
        <textarea
          rows={6}
          value={form.fieldnotes.manualnotes}
          placeholder="Notes terrain"
          onChange={(e) =>
            patch("fieldnotes", {
              ...form.fieldnotes,
              manualnotes: e.target.value,
            })
          }
        />
      </SectionCard>

      <div className="sticky-actions">
        <button type="button" className="btn-primary" onClick={() => void save()} disabled={saving}>
          {saving ? "Enregistrement…" : "Enregistrer le formulaire"}
        </button>
      </div>
    </div>
  );
}
