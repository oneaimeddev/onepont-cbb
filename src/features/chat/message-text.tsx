import type { ReactNode } from "react";

function safeHref(value: string) {
  if (!value.startsWith("https://")) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.href : null;
  } catch (error) {
    if (error instanceof TypeError) return null;
    throw error;
  }
}

function inline(source: string, key: string): ReactNode[] {
  const pattern = /(\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\((https:\/\/[^)\s]+)\))/g;
  const nodes: ReactNode[] = [];
  let last = 0;
  let index = 0;
  for (const match of source.matchAll(pattern)) {
    const start = match.index ?? 0;
    if (start > last) nodes.push(source.slice(last, start));
    if (match[2]) nodes.push(<strong key={`${key}-${index}`}>{match[2]}</strong>);
    else if (match[3]) nodes.push(<code key={`${key}-${index}`}>{match[3]}</code>);
    else if (match[4]) {
      const href = safeHref(match[5] ?? "");
      nodes.push(href
        ? <a key={`${key}-${index}`} href={href} rel="noreferrer">{match[4]}</a>
        : match[0]);
    }
    last = start + match[0].length;
    index += 1;
  }
  if (last < source.length) nodes.push(source.slice(last));
  return nodes;
}

export function MessageText({ text }: { text: string }) {
  const lines = text.split("\n");
  const blocks: ReactNode[] = [];
  let list: { kind: "ul" | "ol"; items: string[] } | null = null;

  function flush() {
    if (!list) return;
    const items = list.items;
    const kind = list.kind;
    const key = `list-${blocks.length}`;
    blocks.push(kind === "ul"
      ? <ul key={key}>{items.map((item, index) => <li key={`${key}-${index}`}>{inline(item, `${key}-${index}`)}</li>)}</ul>
      : <ol key={key}>{items.map((item, index) => <li key={`${key}-${index}`}>{inline(item, `${key}-${index}`)}</li>)}</ol>);
    list = null;
  }

  lines.forEach((line) => {
    const bullet = /^(?:-|\*)\s+(.+)$/.exec(line);
    const ordered = /^\d+\.\s+(.+)$/.exec(line);
    if (bullet) {
      if (list?.kind !== "ul") flush();
      list = list ?? { kind: "ul", items: [] };
      list.items.push(bullet[1]);
      return;
    }
    if (ordered) {
      if (list?.kind !== "ol") flush();
      list = list ?? { kind: "ol", items: [] };
      list.items.push(ordered[1]);
      return;
    }
    flush();
    if (!line.trim()) return;
    const heading = /^(#{2,3})\s+(.+)$/.exec(line);
    if (heading) {
      const content = inline(heading[2], `h-${blocks.length}`);
      blocks.push(heading[1].length === 2
        ? <h2 key={`h-${blocks.length}`}>{content}</h2>
        : <h3 key={`h-${blocks.length}`}>{content}</h3>);
      return;
    }
    blocks.push(<p key={`p-${blocks.length}`}>{inline(line, `p-${blocks.length}`)}</p>);
  });
  flush();
  if (blocks.length === 0) return null;
  return <div className="ia-prose">{blocks}</div>;
}
