import { redirect } from "next/navigation";
import { getCurrentActor } from "@/lib/auth";

export default async function HomePage() {
  const actor = await getCurrentActor();
  if (!actor) {
    redirect("/login");
  }
  if (actor.role === "CUSTOMER") {
    redirect("/customer-app");
  }
  if (actor.role === "CAD_DESIGNER") {
    redirect("/cad-dashboard");
  }
  redirect("/dashboard");
}

