import Link from "next/link";
import { requireProfile } from "../../../lib/profile";
import { supabaseServer } from "../../../lib/supabase";
import { medicalCapability } from "../../../features/documents/data";
import { WorkspaceArea } from "../../../components/workspace-area";
import "./profile.css";

export default async function ProfessionalProfilePage() {
  const profile = await requireProfile();
  const client = await supabaseServer();
  const [{ data, error }, medical] = await Promise.all([client.auth.getUser(), medicalCapability()]);
  if (error || !data.user) throw new Error("Não foi possível consultar o perfil.");
  return <WorkspaceArea><main id="conteudo" tabIndex={-1} className="traditional-content clinical-page professional-profile">
    <Link href="/" prefetch={false} className="back-link">Voltar ao CBB Intelligence</Link>
    <header className="clinical-header"><div><h1>Meu perfil</h1><p>Seus dados profissionais e acessos disponíveis.</p></div></header>
    <section className="professional-section" aria-labelledby="professional-data"><h2 id="professional-data">Dados profissionais</h2>
      <dl className="professional-facts">
        <div><dt>Nome de exibição</dt><dd>{profile.display_name}</dd></div>
        <div><dt>Profissão informada</dt><dd>{profile.profession}</dd></div>
        <div><dt>E-mail de acesso</dt><dd>{data.user.email ?? "Não informado"}</dd></div>
        <div><dt>Identificação médica cadastrada</dt><dd>{medical.credential_label ?? "Não informada"}</dd></div>
      </dl>
      <p className="professional-help">A identificação cadastrada não representa verificação de conselho profissional. A edição de dados e o cadastro de múltiplas inscrições ainda estão indisponíveis.</p>
    </section>
    <section className="professional-section" aria-labelledby="professional-access"><h2 id="professional-access">Permissões operacionais</h2>
      <dl className="professional-facts">
        <div><dt>Auditoria</dt><dd>{profile.can_read_audit ? "Habilitada" : "Não habilitada"}</dd></div>
        <div><dt>Gestão de acessos</dt><dd>{profile.can_manage_access ? "Habilitada" : "Não habilitada"}</dd></div>
        <div><dt>Autoria de documentos médicos</dt><dd>{medical.enabled ? "Habilitada" : "Não habilitada"}</dd></div>
      </dl>
      <p className="professional-help">O acesso a registros e documentos também depende dos vínculos e da autorização de cada recurso.</p>
    </section>
    <section className="professional-section" aria-labelledby="professional-signature"><h2 id="professional-signature">Assinatura digital</h2>
      <p>Indisponível nesta versão.</p><p className="professional-help">Ainda não há conexão com provedores ou vínculo de certificados de assinatura digital.</p>
    </section>
  </main></WorkspaceArea>;
}
