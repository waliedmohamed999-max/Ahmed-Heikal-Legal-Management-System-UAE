/** Typed boundaries for scalar lists stored as JSON on MySQL/MariaDB. */
export function stringList(value: unknown): string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new TypeError("Expected a JSON string array");
  }
  return value;
}

export function numberList(value: unknown): number[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "number" && Number.isFinite(item))) {
    throw new TypeError("Expected a JSON number array");
  }
  return value;
}
