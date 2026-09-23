import { redirect } from "next/navigation";

// Temporary until the public website module lands.
export default function Home() {
  redirect("/login");
}
