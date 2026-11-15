import { WorkspaceShell } from "../../components/workspace-shell";
import { SubmitButton } from "../../components/submit-button";
import { availableSections } from "../../features/sections";
import { requireProfile } from "../../lib/profile";
import { logout } from "../login/actions";

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireProfile();
  const navigation = [
    { href: "/", title: "Chat" },
    ...availableSections(profile.can_read_audit).map(([slug, section]) => ({
      href: `/${slug}`, title: section.title,
    })),
  ];
  return (
    <WorkspaceShell navigation={navigation} session={
      <div className="account">
        <span><strong>{profile.display_name}</strong><small>{profile.profession}</small></span>
        <form action={logout}>
          <SubmitButton className="outline" pendingLabel="Saindo…">Sair</SubmitButton>
        </form>
      </div>
    }>
      {children}
    </WorkspaceShell>
  );
}
