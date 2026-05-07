import { useEffect, useState } from "react";
import Dashboard from "./pages/Dashboard";
import InspectionPage from "./pages/InspectionPage";
import { supabase } from "./lib/supabase";

type Inspection = {
  id: string;
  address?: string | null;
  clientname?: string | null;
};

export default function App() {
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [userId, setUserId] = useState("");

  useEffect(() => {
    void getUser();
  }, []);

  async function getUser() {
    const { data } = await supabase.auth.getUser();
    if (data.user) {
      setUserId(data.user.id);
      return;
    }

    const fallback = window.prompt("Entre temporairement ton userid Supabase (auth.users.id)");
    if (fallback) setUserId(fallback.trim());
  }

  if (!inspection) {
    return <Dashboard userId={userId} onOpen={setInspection} />;
  }

  return (
    <InspectionPage
      inspection={inspection}
      userId={userId}
      onBack={() => setInspection(null)}
    />
  );
}
