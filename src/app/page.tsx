import { redirect } from "next/navigation";
import { getCurrentActor } from "@/lib/auth";

export default async function HomePage() {
  const actor = await getCurrentActor();
  if (!actor) {
    redirect("/login");
  }
  redirect("/dashboard");
}

