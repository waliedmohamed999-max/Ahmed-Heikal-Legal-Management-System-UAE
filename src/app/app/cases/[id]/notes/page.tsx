import { notFound } from "next/navigation";
import { requireStaff } from "@/server/auth/session";
import { getT } from "@/i18n/server";
import { loadWorkspace, type Workspace } from "@/server/services/workspace";
import { listComments, listNotes } from "@/server/services/collab";
import { NotesView } from "./view";

export default async function NotesPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireStaff();
  const { id } = await params;
  const { locale } = await getT();
  const ws = (await loadWorkspace(ctx, id)) as Workspace;
  if (!ws.caps.includes("notes.view")) notFound();
  const [notes, comments] = await Promise.all([listNotes(ctx, id), listComments(ctx, { matterId: id })]);
  const L = (en: string, ar: string | null) => (locale === "ar" ? ar || en : en);
  const map = (n: { id: string; body: string; createdAt: Date; author: { id: string; name: string; nameAr: string | null; photoUrl: string | null } }) => ({
    id: n.id, body: n.body, createdAt: n.createdAt.toISOString(), author: L(n.author.name, n.author.nameAr), authorId: n.author.id, photoUrl: n.author.photoUrl,
  });
  return (
    <NotesView
      matterId={id}
      meId={ctx.user.id}
      canCreate={ws.caps.includes("notes.create")}
      canShare={ws.caps.includes("notes.shareClient")}
      canModerate={ws.caps.includes("matters.edit")}
      notes={notes.map((n) => ({ ...map(n), visibility: n.visibility, pinned: n.pinned }))}
      comments={comments.map(map)}
    />
  );
}
