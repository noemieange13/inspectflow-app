import InspectionForm from "../components/InspectionForm";
import DocumentUploader from "../components/DocumentUploader";
import PhotoUploader from "../components/PhotoUploader";
import ReportPanel from "../components/ReportPanel";
import BrandingPanel from "../components/BrandingPanel";

type Inspection = {
  id: string;
  address?: string | null;
  clientname?: string | null;
};

type Props = {
  inspection: Inspection;
  userId: string;
  onBack: () => void;
};

export default function InspectionPage({ inspection, userId, onBack }: Props) {
  return (
    <div className="page">
      <div className="topbar">
        <button type="button" className="btn-secondary" onClick={onBack}>
          ← Retour
        </button>
        <div>
          <h1 className="title-inline">{inspection.address || "Inspection"}</h1>
          <div className="muted">{inspection.clientname || "Client non défini"}</div>
        </div>
      </div>

      <div className="inspection-layout">
        <div className="main-column">
          <InspectionForm inspectionId={inspection.id} />
          <DocumentUploader inspectionId={inspection.id} />
          <PhotoUploader inspectionId={inspection.id} userId={userId} />
        </div>

        <aside className="side-column">
          <BrandingPanel userId={userId} />
          <ReportPanel inspectionId={inspection.id} />
        </aside>
      </div>
    </div>
  );
}
