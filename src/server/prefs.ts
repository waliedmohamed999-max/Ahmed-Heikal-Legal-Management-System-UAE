import "server-only";
import { cookies } from "next/headers";

/** Table density preference (non-sensitive display cookie set by <DensityToggle/>). */
export async function getDensity(): Promise<"comfortable" | "compact"> {
  return (await cookies()).get("ahl_density")?.value === "compact" ? "compact" : "comfortable";
}
