export async function command(
  endpoint: "signing" | "professional",
  action: string,
  payload: Record<string, unknown> = {},
) {
  const response = await fetch(`/api/${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, payload }),
  });
  const data = await response.json();
  if (!response.ok || data.error)
    throw Object.assign(
      new Error(
        (
          {
            stale:
              "O conteúdo mudou. Volte ao editor e prepare a versão atual.",
            expired: "A preparação expirou. Prepare novamente.",
            incomplete:
              "Preencha os campos essenciais no editor antes de preparar.",
            in_progress:
              "Já existe uma tentativa em andamento. Consulte a tentativa anterior.",
            confirmation_required:
              "Revise e confirme a versão e a identidade selecionadas.",
            conflict:
              "Esta tentativa já foi registrada com outra escolha. Consulte o resultado ou prepare novamente.",
            invalid: "Confira os campos e tente novamente.",
            unavailable:
              "Operação indisponível. Confira a conexão demonstrativa e seus acessos.",
          } as Record<string, string>
        )[data.error] ?? "Não foi possível concluir. Tente novamente.",
      ),
      { code: data.error },
    );
  return data;
}
