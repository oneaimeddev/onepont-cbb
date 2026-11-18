# 0019 — Análise longitudinal como leitura autorizada

The longitudinal analysis is a paged read of the records and documents the professional can already open. It does not add a permission, a second chart, or a vector index.

`clinical_history_page` returns identifiers, clinical dates, status, specialty and a label. It uses the same visibility rule as the timeline: a finalized care-team evolution, or a record the author themselves can see. Another professional's private evolution is omitted, including from the count. Medical documents are included only when `clinical.can_author_documents` is true and the caller is the author. A specialty filter returns evolutions only.

The chat calls `POST /api/inteligencia/historico` for the phrases it can classify. Voice uses that same route. The agent tool `analyzeAthleteHistory` exists for a paraphrase and receives counts, dates and identifiers, not the record body. The card loads the original text again through the existing reading route, so a revoked record disappears when it is opened.

The executive sentence states who was examined, the period and whether the read finished. It does not diagnose, compare cause, or treat a prescription, an exam request or a surgical order as something that was administered, resulted or performed. A failed or capped page stays partial.

The transcript stores the scope and the identifiers. Titles and document bodies are removed before the row is saved.
