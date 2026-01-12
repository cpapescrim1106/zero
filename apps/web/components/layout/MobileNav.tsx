import Link from "next/link";

const items = [
  { href: "/bots", label: "Bots" },
  { href: "/bots/new", label: "New" },
  { href: "/account", label: "Account" }
];

export default function MobileNav() {
  return (
    <div className="flex items-center justify-between gap-2 rounded-2xl border border-border bg-panel/80 px-4 py-3 lg:hidden">
      <span className="text-sm font-semibold">zero</span>
      <div className="flex gap-2 text-xs">
        {items.map((item) => (
          <Link key={item.href} href={item.href} className="rounded-full border border-border px-3 py-1">
            {item.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
