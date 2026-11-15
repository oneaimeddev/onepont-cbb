import { Icon, type IconName } from "./icon";

export function EmptyState({ icon, title, children }: {
  icon: IconName;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-state-icon"><Icon name={icon} size={22} /></span>
      <p className="empty-state-title">{title}</p>
      {children}
    </div>
  );
}
