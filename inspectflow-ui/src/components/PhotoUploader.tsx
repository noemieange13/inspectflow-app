import { useEffect, useState } from "react";
import SectionCard from "./SectionCard";
import { supabase } from "../lib/supabase";

type Props = {
  inspectionId: string;
  userId: string;
};

type PhotoRow = {
  id: string;
  storage_path: string;
};

async function sha256Hex(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export default function PhotoUploader({ inspectionId, userId }: Props) {
  const [photos, setPhotos] = useState<PhotoRow[]>([]);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    void loadPhotos();
  }, [inspectionId]);

  async function loadPhotos() {
    const { data } = await supabase
      .from("photos")
      .select("id, storage_path")
      .eq("inspection_id", inspectionId)
      .order("created_at", { ascending: false });

    setPhotos((data as PhotoRow[]) || []);
  }

  async function onUpload(files: FileList | null) {
    if (!files?.length || !userId) return;
    setUploading(true);

    try {
      for (const file of Array.from(files)) {
        const fileHash = await sha256Hex(file);
        const ext = file.name.includes(".") ? `.${file.name.split(".").pop()}` : "";
        const path = `${userId}/${fileHash}${ext}`;

        const { error: uploadError } = await supabase.storage.from("photos").upload(path, file);

        if (uploadError) throw uploadError;

        const { data: maxRow } = await supabase
          .from("photos")
          .select("photo_number")
          .eq("inspection_id", inspectionId)
          .order("photo_number", { ascending: false })
          .limit(1)
          .maybeSingle<{ photo_number: number | null }>();

        const nextNum =
          typeof maxRow?.photo_number === "number" ? maxRow.photo_number + 1 : 1;

        const { error: insertError } = await supabase.from("photos").insert({
          inspection_id: inspectionId,
          owner_id: userId,
          storage_path: path,
          file_hash: fileHash,
          photo_number: nextNum,
        });

        if (insertError) throw insertError;
      }

      await loadPhotos();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Erreur upload photo";
      alert(message);
    } finally {
      setUploading(false);
    }
  }

  async function launchAnalysis() {
    const { error } = await supabase.from("processphotojobs").insert({
      photopath: `inspection:${inspectionId}`,
      status: "pending",
    });

    if (error) {
      alert(error.message);
      return;
    }

    alert("Analyse lancée");
  }

  return (
    <SectionCard
      title="Photos"
      right={
        <button type="button" className="btn-secondary" onClick={() => void launchAnalysis()}>
          Lancer l’analyse
        </button>
      }
    >
      <label className="upload-box">
        <span>{uploading ? "Upload en cours…" : "Ajouter des photos"}</span>
        <input
          type="file"
          hidden
          multiple
          accept="image/*"
          onChange={(e) => void onUpload(e.target.files)}
        />
      </label>

      <div className="photo-grid">
        {photos.map((photo) => {
          const { data: pub } = supabase.storage.from("photos").getPublicUrl(photo.storage_path);
          return (
            <div className="photo-card" key={photo.id}>
              <img src={pub.publicUrl} alt="" />
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
}
