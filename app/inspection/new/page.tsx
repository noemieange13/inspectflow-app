import { redirect } from "next/navigation";

export default function LegacyNewInspectionRedirect() {
  redirect("/dashboard/simple?new=1");
}
