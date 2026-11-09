import { redirect } from "next/navigation";

/** `/admin/reports` has no page of its own: open the sales report. */
export default function ReportsIndexPage() {
  redirect("/admin/reports/sales");
}
