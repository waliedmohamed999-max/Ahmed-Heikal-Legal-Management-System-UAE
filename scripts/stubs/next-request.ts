/**
 * Stand-in for `next/headers` / `next/navigation` in the bundled worker and CLI tools.
 * Those run outside any HTTP request, so request APIs behave exactly like Next.js does
 * outside a request scope: they throw. Callers (e.g. audit IP capture) already handle that.
 */
const outside = (name: string) => () => {
  throw new Error(`${name}() is not available outside a web request`);
};
export const headers = outside("headers");
export const cookies = outside("cookies");
export const draftMode = outside("draftMode");
export const redirect = outside("redirect");
export const notFound = outside("notFound");
export const permanentRedirect = outside("permanentRedirect");
