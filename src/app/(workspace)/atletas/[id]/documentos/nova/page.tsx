import { randomUUID } from "node:crypto";
import { notFound } from "next/navigation";
import { getAthlete, uuidPattern } from "../../../../../../features/athletes/data";
import { documentNotice, DocumentScreen } from "../../../../../../features/documents/screen";
import { emptyExam, emptyPrescription, emptySurgical, kindFromSlug } from "../../../../../../features/documents/content";
import { medicalCapability } from "../../../../../../features/documents/data";
import { requireProfile } from "../../../../../../lib/profile";

export default async function NewDocumentPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tipo?: string; documento?: string; erro?: string; salvo?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const kind = kindFromSlug(query.tipo ?? "");
  if (!kind) notFound();
  const documentId = query.documento && uuidPattern.test(query.documento) ? query.documento : randomUUID();
  const [context, capability, profile] = await Promise.all([
    getAthlete(id, "profile"),
    medicalCapability(),
    requireProfile(),
  ]);
  if (!capability.enabled || !context.can_read_records) notFound();
  const now = new Date().toISOString();
  return (
    <DocumentScreen
      athleteId={id}
      athleteName={context.athlete.social_name || context.athlete.full_name}
      documentId={documentId}
      kind={kind}
      version={0}
      status="draft"
      authorName={profile.display_name}
      credential={capability.credential_label}
      content={kind === "prescription" ? emptyPrescription() : kind === "exam_request" ? emptyExam() : emptySurgical()}
      createdAt={now}
      updatedAt={now}
      saved={false}
      preview={false}
      notice={documentNotice(query.erro, query.salvo)}
    />
  );
}
