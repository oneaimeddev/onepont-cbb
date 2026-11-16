const paths = {
  chat: <path d="M4 5.5h16v10.5H9.5L4 20z" />,
  search: <><circle cx="10.5" cy="10.5" r="6" /><path d="m15 15 5 5" /></>,
  note: <><path d="M6 3.5h8.5l3.5 3.5v13.5H6z" /><path d="M9 11.5h6M9 15.5h4" /></>,
  records: <path d="M3.5 6h6l2 2h9v11.5h-17z" />,
  audit: <><path d="M12 3.5 19.5 6v5.5c0 4.4-3.1 7.8-7.5 9-4.4-1.2-7.5-4.6-7.5-9V6z" /><path d="m8.75 12 2.25 2.25 4.25-4.5" /></>,
  logout: <><path d="M14.5 4.5h4.5v15h-4.5" /><path d="M10 8 6 12l4 4M6 12h9.5" /></>,
  send: <path d="M4 12 20 4.5 14 20l-2.75-5.75z" />,
  back: <path d="M19 12H5.5M11 6l-6 6 6 6" />,
  chevron: <path d="m9.5 6 6 6-6 6" />,
  plus: <path d="M12 5v14M5 12h14" />,
  lock: <><rect x="5" y="10.5" width="14" height="9.5" rx="2" /><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" /></>,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  rail: <><rect x="3.5" y="4.5" width="17" height="15" rx="2" /><path d="M9 4.5v15" /></>,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  info: <><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5M12 8h.01" /></>,
  clip: <path d="m15.5 8.5-6.2 6.2a2.2 2.2 0 0 1-3.1-3.1l6.4-6.4a3.4 3.4 0 0 1 4.8 4.8l-6.5 6.5a4.6 4.6 0 0 1-6.5-6.5L11 3.4" />,
  mic: <path d="M12 4.5a2.5 2.5 0 0 1 2.5 2.5v4a2.5 2.5 0 0 1-5 0V7A2.5 2.5 0 0 1 12 4.5ZM7 11a5 5 0 0 0 10 0M12 16v3.5" />,
} as const;

export type IconName = keyof typeof paths;

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {paths[name]}
    </svg>
  );
}
