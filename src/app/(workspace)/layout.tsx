import { WorkspaceShell } from "../../components/workspace-shell";
import { SubmitButton } from "../../components/submit-button";
import { Avatar } from "../../components/avatar";
import { Icon } from "../../components/icon";
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
      <div className="account">
        <Avatar name={profile.display_name} size="sm" />
        <span><strong>{profile.display_name}</strong><small>{profile.profession}</small></span>
        <form action={logout}>
          <SubmitButton className="ghost" pendingLabel="Saindo…"><Icon name="logout" size={18} />Sair</SubmitButton>
        </form>
      </div>
    }>
      {children}
    </WorkspaceShell>
  );
}
