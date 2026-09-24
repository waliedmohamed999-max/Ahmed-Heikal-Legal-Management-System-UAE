# AI Data Policy

This policy describes exactly what the AI features send outside the office, and the controls around it.
An administrator must acknowledge it in **Settings → AI** before AI can be enabled.

## 1. Off by default
AI is disabled unless **all** of these hold: a provider key is configured on the server (`AI_PROVIDER`,
`ANTHROPIC_API_KEY`), an administrator acknowledged this policy, and an administrator enabled AI. Document text is
sent only if "Allow document processing" is also switched on.

## 2. What is sent (per request)
- **Case facts** the requesting lawyer can already see: numbers, title, parties' names, court, status texts, open
  deadlines and tasks (titles and dates), hearing notes, confirmed timeline. **Never** private notes.
- **Document text**, only for documents the lawyer selected **and** is permitted to open **and** that passed malware
  scanning — filtered *before* retrieval, never filtered after the answer.
- The lawyer's own instructions.
- Optional masking (on by default): Emirates ID, UAE IBAN, card numbers and labelled passport numbers are replaced by
  `[… •••• 1234]` before sending.

Not sent: passwords, secrets, session data, other cases, documents the user cannot open, private notes, audit data.

## 3. Provider handling
- Provider: Anthropic (Claude API). Retention and training terms are those of the office's API agreement with the
  provider — the office must review them (commercial API terms and any zero-retention arrangement) before enabling.
- Every request is recorded as an `AIJob` and in the audit log (`ai.request`): who, which case, which document ids,
  provider and model — **without** the content.

## 4. What the AI can do
Draft, summarise, extract, translate and suggest. It **cannot** send e-mails, submit, approve, delete, share
documents, invite users, change permissions, change deadlines or close cases. Every output is a proposal a person
must review; extracted deadlines become *Needs verification* and require a lawyer's confirmation.

## 5. Prompt-injection safeguards
Document text is framed as untrusted data. The system prompt instructs the model to ignore instructions found inside
documents and to flag them instead, and the application gives the model no tools or actions.

## 6. Availability
If the provider is unavailable, AI shows "unavailable" (an optional `AI_FALLBACK_MODEL` is tried first) and every other
feature keeps working. AI requests are rate-limited (20 per user per 10 minutes).

## 7. Status
**NOT VERIFIED WITH LIVE PROVIDER** in this project: all AI code paths are covered by permission / gating tests, but no
request was made with a real key during Phase 11.
