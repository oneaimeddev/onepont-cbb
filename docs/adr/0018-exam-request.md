# 0018 — Solicitação de exames como documento clínico

Exam requests are a third `clinical.documents.document_type`, `exam_request`, not a separate store. The same draft, version, author and audit path used by prescriptions and surgical orders applies. Signature, legal emission, laboratory integration and result upload stay out of this change.

Each document stores one canonical JSON object: optional attendance date, indication, justification, diagnostic hypothesis, priority, complementary instructions, and up to twelve exam items. An item has a name, a type (`laboratory`, `imaging` or `other`), region, laterality, technical details and notes. Empty fields stay empty. The server does not infer contrast, preparation, sedation or a catalog code. A later result or attachment can be linked by adding a field to this object; that link is not created now.

Only `clinical.can_author_documents` can create or read these drafts, and only the author sees them. Conversation confirmation reuses the spoken and card approval already used for the other document types. The utterance must name the exam request when another proposal is also open. Saving keeps the status `draft`.

The assistant may organize exams the physician named and may append them to the single open exam proposal. It does not choose exams, and it has no tool that writes the document. The original text shown in the chat is loaded again from `document_open` after the card is rendered.
