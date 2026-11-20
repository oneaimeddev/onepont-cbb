import Link from "next/link";
import { requireProfile } from "../../../lib/profile";
import { supabaseServer } from "../../../lib/supabase";
import { medicalCapability } from "../../../features/documents/data";
import { WorkspaceArea } from "../../../components/workspace-area";
import "./profile.css";
import { ProfessionalPanel, SigningSettings } from "../../../features/signing/profile-panel";
import { signingCommand, signingDemoEnabled } from "../../../features/signing/server";

export default async function ProfessionalProfilePage() {
  const profile = await requireProfile();
  const client = await supabaseServer();
  const [{ data, error }, medical] = await Promise.all([client.auth.getUser(), medicalCapability()]);
  if (error || !data.user) throw new Error("Não foi possível consultar o perfil.");
  const { data: declared, error: declaredError } = await client.rpc("professional_profile_command", { action: "get", payload: {} });
  if (declaredError || declared?.error) throw new Error("Não foi possível consultar os dados profissionais.");
  const demo = signingDemoEnabled();
  const inventory = demo ? await signingCommand("list") : null;
  return <WorkspaceArea><main id="conteudo" tabIndex={-1} className="traditional-content clinical-page professional-profile">
    <Link href="/" prefetch={false} className="back-link">Voltar ao CBB Intelligence</Link>
    <header className="clinical-header"><div><h1 className="athlete-name">Meu perfil</h1><p>Seus dados profissionais e acessos disponíveis.</p></div></header>
    <ProfessionalPanel initial={declared} email={data.user.email ?? "Não informado"} />
    <section className="professional-section" aria-labelledby="professional-access"><h2 id="professional-access">Permissões operacionais</h2>
      <dl className="professional-facts">
        <div><dt>Auditoria</dt><dd>{profile.can_read_audit ? "Habilitada" : "Não habilitada"}</dd></div>
        <div><dt>Gestão de acessos</dt><dd>{profile.can_manage_access ? "Habilitada" : "Não habilitada"}</dd></div>
        <div><dt>Identificação médica cadastrada</dt><dd>{medical.credential_label ?? "Não informada"}</dd></div>
        <div><dt>Autoria de documentos médicos</dt><dd>{medical.enabled ? "Habilitada" : "Não habilitada"}</dd></div>
      </dl>
      <p className="professional-help">O acesso a registros e documentos também depende dos vínculos e da autorização de cada recurso.</p>
    </section>
    <SigningSettings enabled={demo && !inventory?.error} initial={inventory?.error ? null : inventory} />
  </main></WorkspaceArea>;
}
