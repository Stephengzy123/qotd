import { requireRole } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function UsersPage() {
  await requireRole("admin");
  redirect("/admin#accounts");
}
