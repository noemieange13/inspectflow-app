import { useEffect, useState } from "react";
import SectionCard from "./SectionCard";
import { supabase } from "../lib/supabase";

type Props = {
  userId: string;
};

type BrandingRow = {
  displayname?: string | null;
  inspectornumber?: string | null;
  companyname?: string | null;
  companyphone?: string | null;
  companyemail?: string | null;
  companyaddress?: string | null;
  covertitle?: string | null;
  footertext?: string | null;
  provincedefault?: string | null;
};

const defaults = {
  displayname: "",
  inspectornumber: "",
  companyname: "",
  companyphone: "",
  companyemail: "",
  companyaddress: "",
  covertitle: "Rapport d’inspection",
  footertext: "",
  provincedefault: "QC",
};

export default function BrandingPanel({ userId }: Props) {
  const [data, setData] = useState(defaults);

  useEffect(() => {
    if (!userId) return;
    void load();
  }, [userId]);

  async function load() {
    const { data: row } = await supabase
      .from("inspectorbranding")
      .select("*")
      .eq("userid", userId)
      .maybeSingle<BrandingRow>();

    if (row) {
      setData({
        displayname: row.displayname || "",
        inspectornumber: row.inspectornumber || "",
        companyname: row.companyname || "",
        companyphone: row.companyphone || "",
        companyemail: row.companyemail || "",
        companyaddress: row.companyaddress || "",
        covertitle: row.covertitle || "Rapport d’inspection",
        footertext: row.footertext || "",
        provincedefault: row.provincedefault || "QC",
      });
    }
  }

  async function save() {
    const payload = { userid: userId, ...data };

    const { error } = await supabase
      .from("inspectorbranding")
      .upsert(payload, { onConflict: "userid" });

    if (error) {
      alert(error.message);
      return;
    }

    alert("Profil inspecteur enregistré");
  }

  return (
    <SectionCard title="Profil inspecteur / couverture">
      <div className="grid-2">
        <input
          value={data.displayname}
          placeholder="Nom inspecteur"
          onChange={(e) => setData({ ...data, displayname: e.target.value })}
        />
        <input
          value={data.inspectornumber}
          placeholder="Numéro inspecteur"
          onChange={(e) => setData({ ...data, inspectornumber: e.target.value })}
        />
        <input
          value={data.companyname}
          placeholder="Compagnie"
          onChange={(e) => setData({ ...data, companyname: e.target.value })}
        />
        <input
          value={data.companyphone}
          placeholder="Téléphone"
          onChange={(e) => setData({ ...data, companyphone: e.target.value })}
        />
        <input
          value={data.companyemail}
          placeholder="Courriel"
          onChange={(e) => setData({ ...data, companyemail: e.target.value })}
        />
        <input
          value={data.companyaddress}
          placeholder="Adresse compagnie"
          onChange={(e) => setData({ ...data, companyaddress: e.target.value })}
        />
        <input
          value={data.covertitle}
          placeholder="Titre couverture"
          onChange={(e) => setData({ ...data, covertitle: e.target.value })}
        />
        <input
          value={data.footertext}
          placeholder="Texte pied de page"
          onChange={(e) => setData({ ...data, footertext: e.target.value })}
        />
      </div>

      <button type="button" className="btn-primary" onClick={() => void save()}>
        Enregistrer le profil
      </button>
    </SectionCard>
  );
}
