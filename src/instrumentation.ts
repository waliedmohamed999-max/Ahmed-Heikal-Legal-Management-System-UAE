import type { Instrumentation } from "next";

/** Server boot hook: Node-only checks live in instrumentation-node.ts (see there). */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { registerNode } = await import("./instrumentation-node");
    await registerNode();
  }
}

/** Server-side errors → structured log (+ optional monitoring). Only route and digest, never request data. */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  const { logger } = await import("./server/log");
  logger("request").error(err instanceof Error ? err.message : String(err), {
    digest: typeof err === "object" && err && "digest" in err ? String((err as { digest: unknown }).digest) : undefined,
    method: request.method,
    route: context.routePath,
    routeType: context.routeType,
  });
};
