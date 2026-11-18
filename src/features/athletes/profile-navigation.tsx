"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

export function ProfileTabs({
  tabs,
  active,
}: {
  tabs: { id: string; label: string; href: string }[];
  active: string;
}) {
  const list = useRef<HTMLElement>(null);
  const [edges, setEdges] = useState({ before: false, after: false });
  useEffect(() => {
    const nav = list.current;
    if (!nav) return;
    const selected = nav.querySelector<HTMLElement>('[aria-current="page"]');
    if (selected) nav.scrollLeft = selected.offsetLeft - nav.offsetLeft - 8;
    const measure = () =>
      setEdges({
        before: nav.scrollLeft > 1,
        after: nav.scrollLeft + nav.clientWidth < nav.scrollWidth - 1,
      });
    measure();
    nav.addEventListener("scroll", measure, { passive: true });
    const observer = new ResizeObserver(() => {
      if (selected && nav.scrollWidth > nav.clientWidth) {
        const a = selected.getBoundingClientRect(),
          b = nav.getBoundingClientRect();
        if (a.right > b.right) nav.scrollLeft += a.right - b.right + 8;
        else if (a.left < b.left) nav.scrollLeft -= b.left - a.left + 8;
      }
      measure();
    });
    observer.observe(nav);
    return () => {
      nav.removeEventListener("scroll", measure);
      observer.disconnect();
    };
  }, [active]);
  return (
    <div className="profile-section-navigation">
      <nav ref={list} className="athlete-tabs" aria-label="Seções do atleta">
        {tabs.map((tab) => (
          <Link
            key={tab.id}
            href={tab.href}
            prefetch={false}
            aria-current={active === tab.id ? "page" : undefined}
          >
            {tab.label}
          </Link>
        ))}
      </nav>
      <div className="profile-tab-controls">
        <button
          type="button"
          className="outline"
          aria-label="Seções anteriores"
          disabled={!edges.before}
          onClick={() => list.current?.scrollBy({ left: -220 })}
        >
          ←
        </button>
        <span>Mais seções: deslize ou use as setas</span>
        <button
          type="button"
          className="outline"
          aria-label="Próximas seções"
          disabled={!edges.after}
          onClick={() => list.current?.scrollBy({ left: 220 })}
        >
          →
        </button>
      </div>
    </div>
  );
}
