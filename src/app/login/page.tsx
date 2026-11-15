import Link from "next/link";
import { SubmitButton } from "../../components/submit-button";
import { Brand } from "../../components/brand";
import { login, logout } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string; perfil?: string; saida?: string }>;
}) {
  const { erro, perfil, saida } = await searchParams;
  return (
    <main className="login-page">
      <div className="login-brand"><Brand /></div>
      <section className="login-panel">
        <h1>Acesso profissional</h1>
        <p>Entre com sua conta individual de demonstração.</p>
        {erro && <p id="login-error" role="alert">Não foi possível entrar. Confira seu e-mail e sua senha.</p>}
        {perfil && <p role="alert">Sua conta ainda não possui um perfil profissional.</p>}
        {saida && <p role="alert">Não foi possível encerrar a sessão. Tente novamente.</p>}
        {saida ? (
          <form action={logout}><SubmitButton pendingLabel="Saindo…">Tentar sair</SubmitButton> <Link href="/">Voltar</Link></form>
        ) : (
          <form action={login} className="login-form">
            <label htmlFor="email">E-mail</label>
            <input id="email" name="email" type="email" spellCheck={false} autoCapitalize="none" aria-describedby={erro ? "login-error" : undefined} autoComplete="username" maxLength={254} required />
            <label htmlFor="password">Senha</label>
            <input id="password" name="password" type="password" aria-describedby={erro ? "login-error" : undefined} autoComplete="current-password" maxLength={256} required />
            <SubmitButton pendingLabel="Entrando…">Entrar</SubmitButton>
          </form>
        )}
        <small className="muted">Ambiente de demonstração</small>
      </section>
    </main>
  );
}
