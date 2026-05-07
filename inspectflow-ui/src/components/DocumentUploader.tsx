import { useEffect, useState } from "react";
import SectionCard from "./SectionCard";
import { supabase } from "../lib/supabase";

type Props = {
  inspectionId: string;
};

type DocRow = {
  id: string;
  filename?: string | null;
  documenttype?: string | null;
  extractionstatus?: string | null;
};

export default function DocumentUploader({ inspectionId }: Props) {
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [uploading, setUploading] = useState(false);
  const [documentType, setDocumentType] = useState("dvpdf");

  useEffect(() => {
    void loadDocs();
  }, [inspectionId]);

  async function loadDocs() {
    const { data } = await supabase
      .from("inspectiondocuments")
      .select("*")
      .eq("inspectionid", inspectionId)
      .order("createdat", { ascending: false });

    setDocs((data as DocRow[]) || []);
  }

  async function onUpload(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);

    try {
      for (const file of Array.from(files)) {
        const path = `${inspectionId}/${crypto.randomUUID()}-${file.name}`;

        const bucket = documentType === "voicenote" ? "inspection-notes" : "user-uploads";
        const { error: storageError } = await supabase.storage.from(bucket).upload(path, file);

        if (storageError) throw storageError;

        const { error: dbError } = await supabase.from("inspectiondocuments").insert({
          inspectionid: inspectionId,
          documenttype: documentType,
          filename: file.name,
          filepath: path,
          mimetype: file.type,
          source: "manual",
          extractionstatus: "pending",
        });

        if (dbError) throw dbError;
      }

      await loadDocs();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Erreur upload document";
      alert(message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <SectionCard title="Documents intelligents">
      <div className="toolbar">
        <select value={documentType} onChange={(e) => setDocumentType(e.target.value)}>
          <option value="dvpdf">DV PDF</option>
          <option value="dvphoto">Photo DV</option>
          <option value="fieldnotephoto">Photo notes manuscrites</option>
          <option value="voicenote">Note vocale</option>
          <option value="supportingdocument">Document complémentaire</option>
          <option value="other">Autre</option>
        </select>

        <label className="btn-secondary">
          {uploading ? "Upload…" : "Ajouter un document"}
          <input type="file" hidden multiple onChange={(e) => void onUpload(e.target.files)} />
        </label>
      </div>

      <div className="list">
        {docs.map((doc) => (
          <div key={doc.id} className="list-row">
            <div>
              <strong>{doc.filename || doc.documenttype}</strong>
              <div className="muted">
                {doc.documenttype} · {doc.extractionstatus}
              </div>
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}
