"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ClinicalDocument } from "../documents/data";
import { DocumentReviewPanel } from "../documents/review-panel";
import { reviewCommand } from "../documents/review-client";
import type {
  DocumentReviewRecord,
  DemoDelivery,
  DeliveryEligibility,
} from "../documents/review-types";
import {
  signingStateLabels,
  type SigningAttempt,
  type SigningInventory,
} from "./contracts";
import type { PreparedSnapshot } from "./snapshot-types";
export type { PreparedSnapshot } from "./snapshot-types";
export function SigningJourney({
  document,
  athleteName,
  inventory,
  initialSnapshot,
  initialAttempt,
  history,
  initialReview,
  initialDelivery,
  demoEnabled,
  deliveryEligibility,
}: {
  document: ClinicalDocument;
  athleteName: string;
  inventory: SigningInventory | null;
  initialSnapshot: PreparedSnapshot | null;
  initialAttempt: SigningAttempt | null;
  initialReview: DocumentReviewRecord | null;
  initialDelivery?: DemoDelivery;
  demoEnabled: boolean;
  deliveryEligibility?:DeliveryEligibility|null;
  history: {
    id: string;
    state: SigningAttempt["state"];
    snapshot_id: string;
    version: number;
    label: string;
    confirmed_at: string;
  }[];
}) {
  const router = useRouter();
  const editor = `/atletas/${document.athlete_id}/documentos/${document.id}`;
  const initial = initialReview ?? {
    id: "",
    document_id: document.id,
    athlete_id: document.athlete_id,
    expected_version: document.version,
    saved_version: document.version,
    content_hash: initialSnapshot?.content_hash ?? "",
    material: initialSnapshot?.material ?? {
      ...document,
      athlete_name: athleteName,
    },
    recipient: {
      name: null,
      relation: "Não solicitado",
      category: "unavailable" as const,
      minor: null,
      phone_masked: null,
      available: false,
      authorized: false as const,
      reason: "",
    },
    template_version: "cbb-clinical-review-v1",
    expires_at: initialSnapshot?.expires_at ?? "",
  };
  return (
    <>
      <DocumentReviewPanel
        initial={initial}
        deliveryEligibility={deliveryEligibility}
        inventory={inventory}
        demoEnabled={demoEnabled}
        initialAttempt={initialAttempt}
        initialDelivery={initialDelivery}
        onBack={() => {
          router.push(editor);
        }}
        onPersisted={() => {}}
        onRetry={async () => {
          const result = await reviewCommand("open", {
            athlete_id: document.athlete_id,
            document_id: document.id,
            version: document.version,
            kind: document.document_type,
            content: document.content,
            idempotency_key: crypto.randomUUID(),
          });
          return result.review;
        }}
      />
      {!!history.length && (
        <section aria-labelledby="signing-history">
          <h2 id="signing-history">Tentativas demonstrativas recentes</h2>
          <p>Últimas 10 tentativas deste documento.</p>
          <ul className="signing-list">
            {history.map((h) => (
              <li key={h.id}>
                <Link
                  href={`${editor}/assinatura?preparacao=${h.snapshot_id}&tentativa=${h.id}`}
                  prefetch={false}
                >
                  {signingStateLabels[h.state]} · Versão {h.version} · {h.label}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
