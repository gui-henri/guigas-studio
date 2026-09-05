import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";

import { useAuth } from "../context/AuthContext";
import { Button } from "./ui/button";
import { cn } from "@/lib/utils";

const navItems = [
  { to: "/", label: "Dashboard", enabled: true },
  { to: "/style", label: "Style", enabled: true },
  { to: "/studio", label: "Estúdio", enabled: false },
  { to: "/releases", label: "Releases", enabled: false },
];

export default function AppShell({ children }: { children: ReactNode }) {
  const { logout } = useAuth();

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-52 shrink-0 flex-col border-r border-border bg-card p-4 sm:flex">
        <span className="font-display text-lg font-semibold">Guigas Studio</span>
        <nav className="mt-8 flex flex-col gap-1" aria-label="Navegação principal">
          {navItems.map((item) =>
            item.enabled ? (
              <NavLink
                key={item.to}
                to={item.to}
                end
                className={({ isActive }) =>
                  cn(
                    "rounded px-3 py-2 text-sm",
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted"
                  )
                }
              >
                {item.label}
              </NavLink>
            ) : (
              <span
                key={item.to}
                title="Disponível em sprint futuro"
                className="cursor-not-allowed rounded px-3 py-2 text-sm text-muted-foreground/50"
                aria-disabled
              >
                {item.label}
              </span>
            )
          )}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-border bg-card px-6 py-3">
          <span className="text-sm font-medium sm:hidden">Guigas Studio</span>
          <div />
          <Button type="button" variant="outline" size="sm" onClick={logout}>
            Sair
          </Button>
        </header>
        <main className="min-w-0 flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
