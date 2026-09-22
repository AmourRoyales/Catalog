"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import LogoutButton from "@/components/LogoutButton";

type NavItem = { href: string; label: string };
type NavGroup = { title: string; items: NavItem[] };

const CATALOGUE_ITEMS: NavItem[] = [
  { href: "/products", label: "◈ Products" },
  { href: "/catalogues", label: "◻ Catalogues" },
];

// Collapsible groups with sub-options.
const GROUPS: NavGroup[] = [
  {
    title: "CAD Catalog",
    items: [
      { href: "/cad-catalogs", label: "CAD Catalogs" },
      { href: "/design-finder", label: "Design Finder" },
      { href: "/cad-catalogs/new", label: "Create Catalog" },
    ],
  },
  {
    title: "Diamonds",
    items: [
      { href: "/diamond-search", label: "View Diamonds" },
      { href: "/diamond-catalogs/new", label: "Create Catalog" },
      { href: "/diamond-catalogs", label: "Diamond Catalogs" },
      { href: "/diamond-stock", label: "Diamond Stock" },
    ],
  },
];

const ALL_HREFS = [...CATALOGUE_ITEMS, ...GROUPS.flatMap((g) => g.items), { href: "/settings", label: "" }].map((i) => i.href);

export default function Sidebar({
  name,
}: {
  name: string;
}) {
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const pathname = usePathname();

  // The most specific matching href wins, so /cad-catalogs/new doesn't also
  // light up "CAD Catalogs".
  const activeHref = ALL_HREFS
    .filter((h) => pathname === h || pathname.startsWith(h + "/"))
    .sort((a, b) => b.length - a.length)[0];

  const linkClass = (href: string, indent = false) =>
    `block ${indent ? "pl-9 pr-5" : "px-5"} py-2.5 text-sm transition ${
      activeHref === href ? "text-white bg-white/10" : "text-white/60 hover:text-white hover:bg-white/5"
    }`;

  return (
    <>
      {/* Mobile top bar — only shows on small screens */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-30 bg-[#16283A] flex items-center justify-between px-4 py-3">
        <button
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          className="text-white text-2xl leading-none w-9 h-9 flex items-center justify-center"
        >
          ☰
        </button>
        <span className="font-serif text-lg text-[#3E86C6]">JeniDiam</span>
        <span className="w-9" /> {/* spacer to keep title centered */}
      </div>

      {/* Dark backdrop when the mobile menu is open */}
      {open && (
        <div
          onClick={() => setOpen(false)}
          className="md:hidden fixed inset-0 z-30 bg-black/50"
        />
      )}

      {/* Sidebar itself.
          - On desktop (md+): always visible, static, exactly as before.
          - On mobile: slides in from the left only when `open` is true. */}
      <aside
        className={`
          bg-[#16283A] flex flex-col shrink-0 w-56
          fixed inset-y-0 left-0 z-40 transition-transform duration-200
          ${open ? "translate-x-0" : "-translate-x-full"}
          md:static md:translate-x-0
        `}
      >
        <div className="px-5 py-6 border-b border-white/10 flex items-center justify-between">
          <div>
            <h1 className="font-serif text-xl text-[#3E86C6]">JeniDiam</h1>
            <p className="text-[9px] tracking-[2px] text-white/30 uppercase mt-0.5">
              Product Vault
            </p>
          </div>
          {/* Close button — mobile only */}
          <button
            onClick={() => setOpen(false)}
            aria-label="Close menu"
            className="md:hidden text-white/60 hover:text-white text-xl leading-none"
          >
            ×
          </button>
        </div>

        <nav className="flex-1 py-4 overflow-y-auto" onClick={() => setOpen(false)}>
          <p className="px-5 pb-2 text-[10px] tracking-wider text-white/25 uppercase">
            Catalogue
          </p>
          {CATALOGUE_ITEMS.map((i) => (
            <Link key={i.href} href={i.href} className={linkClass(i.href)}>
              {i.label}
            </Link>
          ))}

          {GROUPS.map((g) => {
            const isCollapsed = !!collapsed[g.title];
            return (
              <div key={g.title} className="pt-3">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation(); // don't close the mobile menu
                    setCollapsed((c) => ({ ...c, [g.title]: !c[g.title] }));
                  }}
                  aria-expanded={!isCollapsed}
                  className="w-full flex items-center justify-between px-5 py-2 text-[10px] tracking-wider text-white/25 hover:text-white/50 uppercase transition"
                >
                  {g.title}
                  <span className={`text-[9px] transition-transform ${isCollapsed ? "-rotate-90" : ""}`}>▾</span>
                </button>
                {!isCollapsed &&
                  g.items.map((i) => (
                    <Link key={i.href} href={i.href} className={linkClass(i.href, true)}>
                      {i.label}
                    </Link>
                  ))}
              </div>
            );
          })}

          <p className="px-5 pb-2 pt-5 text-[10px] tracking-wider text-white/25 uppercase">
            System
          </p>
          <Link href="/settings" className={linkClass("/settings")}>
            ◎ Brand Settings
          </Link>
        </nav>

        <div className="px-5 py-4 border-t border-white/10 flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-[#3E86C6] flex items-center justify-center text-xs font-bold text-white shrink-0">
            {name?.charAt(0).toUpperCase() ?? "?"}
          </div>
          <div>
            <p className="text-xs text-white/70">{name ?? "User"}</p>
            <LogoutButton />
          </div>
        </div>
      </aside>
    </>
  );
}