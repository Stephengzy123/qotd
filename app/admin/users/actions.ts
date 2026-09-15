"use server";
import { createAccountAction } from "@/app/actions";

export async function addUserAction(formData: FormData) {
  const data = new FormData();
  data.set("username", String(formData.get("username") || ""));
  data.set("password", String(formData.get("password") || ""));
  data.set("role", "contributor");
  return createAccountAction(data);
}
