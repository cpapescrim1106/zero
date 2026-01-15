"use client";

import Link from "next/link";
import { useState } from "react";

const navItems = [
  { href: "/bots", label: "Bots", icon: "🤖" },
  { href: "/bots/new", label: "Create Bot", icon: "➕" },
  { href: "/perps/settings", label: "Perps Settings", icon: "⚙️" },
  { href: "/account", label: "Account", icon: "👤" }
];

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={`hidden h-full flex-col border-r border-border bg-panel/80 lg:flex ${
        collapsed ? "w-14 px-2 py-3" : "w-48 px-3 py-4"
      }`}
    >
      <div className="flex items-start justify-between gap-2 border-b border-border pb-2">
        <div className="leading-tight">
          <p className="text-[10px] uppercase tracking-[0.24em] text-muted">{collapsed ? "Z" : "Zero"}</p>
          {collapsed ? null : <p className="text-xs font-semibold text-text">Neutral Automations</p>}
        </div>
        <button
          type="button"
          onClick={() => setCollapsed((prev) => !prev)}
          className="rounded border border-border px-1.5 py-0.5 text-[10px] font-semibold text-muted"
        >
          {collapsed ? ">>" : "<<"}
        </button>
      </div>

      <nav className={`flex flex-col gap-1 ${collapsed ? "mt-3" : "mt-4"}`}>
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`rounded border border-transparent py-1 text-xs font-semibold text-text transition hover:border-border hover:bg-white/70 ${
              collapsed ? "px-2 text-center" : "px-3 text-left"
            }`}
            title={item.label}
          >
            {collapsed ? item.icon : item.label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
