import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

type InspectionRow = {
  id: string;
  clientname?: string | null;
  clientemail?: string | null;
  address?: string | null;
  province?: string | null;
  inspectiondate?: string | null;
  status?: string | null;
  owner_id?: string | null;
};

type Props = {
  userId: string;
  onOpen: (inspection: InspectionRow) => void;
};

export default function Dashboard({ userId, onOpen }: Props) {
  const [items, setItems] = useState<InspectionRow[]>([]);
  const [form, setForm] = useState({
    clientname: "",
    clientemail: "",
    address: "",
    province: "QC",
    inspectiondate: new Date().toISOString().slice(0, 10),
    status: "draft",
  });

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    let q = supabase.from("inspections").select("*").order("created_at", { ascending: false });

    if (userId) {
      q = q.eq("owner_id", userId);
    }

    const { data } = await q;
    setItems((data as InspectionRow[]) || []);
  }

  async function createInspection(e: React.FormEvent) {
    e.preventDefault();

    if (!userId) {
      alert("Connecte-toi (Supabase Auth) pour créer une inspection liée à ton compte.");
      return;
    }

    const insertPayload = {
      ...form,
      owner_id: userId,
    };

    const { data, error } = await supabase
      .from("inspections")
      .insert(insertPayload)
      .select()
      .single();

    if (error) {
      alert(error.message);
      return;
    }

    onOpen(data as InspectionRow);
  }

  return (
    <div className="page">
      <header className="hero">
        <div>
          <h1>InspectFlow</h1>
          <p>Créer et finaliser un rapport d’inspection avec un minimum de rédaction.</p>
        </div>
      </header>

      <div className="dashboard-grid">
        <form className="card" onSubmit={(e) => void createInspection(e)}>
          <div className="card-header">
            <h2>Nouvelle inspection</h2>
          </div>
          <div className="card-body grid-2">
            <input
              placeholder="Nom du client"
              value={form.clientname}
              onChange={(e) => setForm({ ...form, clientname: e.target.value })}
            />
            <input
              placeholder="Courriel client"
              value={form.clientemail}
              onChange={(e) => setForm({ ...form, clientemail: e.target.value })}
            />
            <input
              placeholder="Adresse"
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
            />
            <input
              placeholder="Province"
              value={form.province}
              onChange={(e) => setForm({ ...form, province: e.target.value })}
            />
            <input
              type="date"
              value={form.inspectiondate}
              onChange={(e) => setForm({ ...form, inspectiondate: e.target.value })}
            />
          </div>
          <div className="card-body">
            <button className="btn-primary" type="submit">
              Créer l’inspection
            </button>
          </div>
        </form>

        <div className="card">
          <div className="card-header">
            <h2>Inspections récentes</h2>
          </div>
          <div className="card-body stack">
            {items.map((item) => (
              <button
                type="button"
                key={item.id}
                className="list-button"
                onClick={() => onOpen(item)}
              >
                <div>
                  <strong>{item.address || "Sans adresse"}</strong>
                  <div className="muted">{item.clientname || "Client non défini"}</div>
                </div>
                <span className="badge">{item.status || "draft"}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
