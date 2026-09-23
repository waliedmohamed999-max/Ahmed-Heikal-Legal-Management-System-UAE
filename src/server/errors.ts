/** Error codes are translated in the UI (errors.<code>). Never leak internals to the client. */
export class AppError extends Error {
  constructor(
    public code: string,
    public status = 400,
    public fieldErrors?: Record<string, string>,
  ) {
    super(code);
  }
}
export const forbidden = () => new AppError("forbidden", 403);
export const notFound = () => new AppError("notFound", 404);
