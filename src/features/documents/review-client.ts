export async function reviewCommand(
  action: string,
  payload: Record<string, unknown>,
) {
  const response = await fetch("/api/documents/review", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, payload }),
  });
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error(
      "Não foi possível concluir. Seu preenchimento foi preservado; tente novamente.",
    );
  }
  if (!response.ok || data.error)
    throw Object.assign(
      new Error(
        (
          {
            incomplete:
              "Preencha os campos essenciais indicados antes de revisar.",
            invalid:
              "Confira os campos e seus limites. Seu preenchimento foi preservado.",
            stale:
              "O documento ou os dados da revisão mudaram. Volte ao editor e revise novamente. Seu preenchimento foi preservado.",
            expired:
              "Esta revisão expirou. Volte ao editor e revise novamente.",
            unavailable:
              "Não foi possível concluir. Confira seu acesso e a conexão demonstrativa. Seu preenchimento foi preservado.",
            conflict:
              "A solicitação já foi usada com outra escolha. Consulte a tentativa anterior ou revise novamente.",
            in_progress:
              "Já existe uma tentativa em andamento para esta versão. Consulte o resultado anterior.",
            confirmation_required:
              "Selecione uma identidade e confirme a autorização desta revisão.",
          } as Record<string, string>
        )[data.error] ??
          "Não foi possível concluir. Seu preenchimento foi preservado; tente novamente.",
      ),
      { code: data.error },
    );
  return data;
}
