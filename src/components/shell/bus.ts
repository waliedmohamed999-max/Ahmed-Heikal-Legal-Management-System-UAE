export type QuickType = "case" | "client" | "task" | "appointment" | "hearing" | "deadline" | "document" | "invoice" | "note";

/** Global quick-create bus: the QuickCreateHost (and pages) listen for this event. */
export function quickCreate(type: QuickType, detail?: Record<string, string>) {
  window.dispatchEvent(new CustomEvent("ahl:quick-create", { detail: { type, ...detail } }));
}

export function openCommandPalette() {
  window.dispatchEvent(new Event("ahl:command"));
}
