let pending: { target: string | null; discard: () => void } | null = null;
export function registerPendingAttachment(
  target: string | null,
  discard: () => void,
) {
  const current = { target, discard };
  pending = current;
  return () => {
    if (pending === current) pending = null;
  };
}
export function hasPendingAttachment() {
  return Boolean(pending);
}
export function allowAttachmentContextChange(target: string | null) {
  if (!pending || pending.target === target) return true;
  if (
    !window.confirm(
      "Há um anexo pendente para o atleta confirmado. Para trocar de contexto, descarte esse envio e selecione o arquivo novamente para o novo atleta. Deseja descartar?",
    )
  )
    return false;
  pending.discard();
  return true;
}
