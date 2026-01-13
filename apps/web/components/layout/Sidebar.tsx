import Link from "next/link";

const navItems = [
  { href: "/bots", label: "Bots" },
  { href: "/bots/new", label: "Create Bot" },
  { href: "/perps/settings", label: "Perps Settings" },
  { href: "/account", label: "Account" }
];

export default function Sidebar() {
  return (
    <aside className="hidden h-full w-64 flex-col gap-8 border-r border-border bg-panel/80 px-6 py-8 lg:flex">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-muted">zero</p>
        <h1 className="mt-2 text-2xl font-semibold">Neutral Automations</h1>
      </div>
      <nav className="flex flex-col gap-2">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="rounded-xl border border-transparent px-4 py-2 text-sm font-medium text-text transition hover:border-border hover:bg-white/70"
          >
            {item.label}
          </Link>
        ))}
      </nav>
      <div className="mt-auto rounded-xl border border-border bg-white/60 p-4 text-xs text-muted">
        <p className="font-medium text-text">Local runtime</p>
        <p className="mt-1">Cooldown-free iteration. Keys stay in bot-runner.</p>
      </div>
    </aside>
  );
}
