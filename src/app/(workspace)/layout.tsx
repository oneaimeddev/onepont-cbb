import { WorkspaceShell } from "../../components/workspace-shell";
import { SubmitButton } from "../../components/submit-button";
import { AccountMenu } from "../../components/account-menu";
import { chatFonts } from "../../features/chat/fonts";
import { navigationSections } from "../../features/sections";
import { requireProfile } from "../../lib/profile";
import { logout } from "../login/actions";

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireProfile();
  const navigation = [
    { href: "/", title: "CBB Intelligence", icon: "chat" as const },
    ...navigationSections(profile.can_read_audit).map(([slug, section]) => ({
      href: `/${slug}`, title: section.title, isAvailable: section.isAvailable, icon: section.icon,
    })),
  ];
  return (
    <WorkspaceShell fonts={chatFonts} navigation={navigation} session={
      <AccountMenu profile={{ displayName: profile.display_name, profession: profile.profession, canReadAudit: profile.can_read_audit }} signOut={
        <form action={logout} role="none">
          <SubmitButton role="menuitem" className="ghost" pendingLabel="Saindo…">Sair</SubmitButton>
        </form>
      } />
    }>
      {children}
    </WorkspaceShell>
  );
}
