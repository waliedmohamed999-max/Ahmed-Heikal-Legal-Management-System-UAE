"use client";

/**
 * Last-resort boundary (errors in the root layout). Renders its own document with inline
 * styles because global CSS is not loaded here. No error details are shown.
 */
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="ar" dir="rtl">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#f7f7f5", color: "#1a1a1a" }}>
        <title>AH Legal OS</title>
        <main role="alert" style={{ maxWidth: 440, margin: "18vh auto", padding: 24, textAlign: "center" }}>
          <h1 style={{ fontSize: 20 }}>حدث خطأ غير متوقع · Something went wrong</h1>
          <p style={{ color: "#555", lineHeight: 1.6 }}>بياناتك محفوظة. أعد المحاولة. — Your data is safe. Please try again.</p>
          <button type="button" onClick={() => retry()} style={{ marginTop: 12, padding: "8px 16px", borderRadius: 6, border: 0, background: "#1f2a44", color: "#fff", cursor: "pointer" }}>
            إعادة المحاولة · Try again
          </button>
          {error.digest && <p style={{ marginTop: 24, fontFamily: "monospace", fontSize: 12, color: "#777" }} dir="ltr">Ref: {error.digest}</p>}
        </main>
      </body>
    </html>
  );
}
