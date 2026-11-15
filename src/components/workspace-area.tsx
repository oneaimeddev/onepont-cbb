export function WorkspaceArea({ children, context }: {
  children: React.ReactNode;
  context?: React.ReactNode;
}) {
  return (
    <div className={context ? "workspace-area has-context" : "workspace-area"}>
      {children}
      {context && <aside className="context-panel" aria-label="Contexto da tarefa">{context}</aside>}
    </div>
  );
}
