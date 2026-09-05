import { useState, type ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { Film, LogOut, Menu, Palette, X } from "lucide-react";

import { useAuth } from "../context/AuthContext";
import { Button } from "./ui/button";
import { cn } from "@/lib/utils";

const mainNav = [
  { to: "/", label: "Pipeline", icon: Film, end: true },
];

const secondaryNav = [
  { to: "/style", label: "Design System", icon: Palette, end: true },
];

export default function AppShell({ children }: { children: ReactNode }) {
  const { logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex min-h-screen flex-col sm:flex-row bg-background">
      {/* Mobile Top Bar */}
      <header className="flex items-center justify-between border-b border-border bg-card px-4 py-3 sm:hidden sticky top-0 z-20">
        <div className="flex items-center gap-2">
          <span className="font-display text-base font-semibold tracking-tight text-foreground">
            Guigas Studio
          </span>
          <span className="rounded bg-accent/15 px-1.5 py-0.5 text-[10px] font-mono font-medium text-accent">
            v2
          </span>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setMobileOpen(true)}
          aria-label="Abrir navegação"
          className="h-8 w-8 p-0"
        >
          <Menu className="h-5 w-5 text-foreground" />
        </Button>
      </header>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex sm:hidden" role="dialog" aria-modal="true">
          <div
            className="fixed inset-0 bg-ink/40 backdrop-blur-xs transition-opacity"
            onClick={() => setMobileOpen(false)}
          />
          <div className="relative flex w-64 max-w-[80%] flex-col border-r border-border bg-card p-5 shadow-xl">
            <div className="flex items-center justify-between pb-4 border-b border-border">
              <span className="font-display text-lg font-semibold text-foreground">
                Guigas Studio
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setMobileOpen(false)}
                aria-label="Fechar navegação"
                className="h-8 w-8 p-0"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <nav className="mt-6 flex flex-col gap-1" aria-label="Navegação móvel">
              {mainNav.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    onClick={() => setMobileOpen(false)}
                    className={({ isActive }) =>
                      cn(
                        "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                        isActive
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      )
                    }
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span>{item.label}</span>
                  </NavLink>
                );
              })}

              <div className="mt-6 pt-4 border-t border-border">
                <span className="px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                  Ferramentas
                </span>
                <div className="mt-2 flex flex-col gap-1">
                  {secondaryNav.map((item) => {
                    const Icon = item.icon;
                    return (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        end={item.end}
                        onClick={() => setMobileOpen(false)}
                        className={({ isActive }) =>
                          cn(
                            "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                            isActive
                              ? "bg-primary text-primary-foreground"
                              : "text-muted-foreground hover:bg-muted hover:text-foreground"
                          )
                        }
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        <span>{item.label}</span>
                      </NavLink>
                    );
                  })}
                </div>
              </div>
            </nav>

            <div className="mt-auto border-t border-border pt-4">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setMobileOpen(false);
                  logout();
                }}
                className="w-full justify-start gap-2 text-xs text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              >
                <LogOut className="h-4 w-4" />
                <span>Encerrar sessão</span>
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Desktop Sidebar */}
      <aside className="hidden w-56 shrink-0 flex-col border-r border-border bg-card p-4 sm:flex">
        <div className="flex items-center gap-2 px-2 py-1">
          <span className="font-display text-lg font-semibold tracking-tight text-foreground">
            Guigas Studio
          </span>
          <span className="rounded bg-accent/15 px-1.5 py-0.5 text-[10px] font-mono font-medium text-accent">
            v2
          </span>
        </div>

        {/* Main Navigation */}
        <nav className="mt-7 flex flex-col gap-1" aria-label="Navegação principal">
          {mainNav.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-primary text-primary-foreground shadow-xs"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )
                }
              >
                <Icon className="h-4 w-4 shrink-0 opacity-80" />
                <span>{item.label}</span>
              </NavLink>
            );
          })}

          {/* Secondary Tools Section */}
          <div className="mt-6 pt-4 border-t border-border">
            <span className="px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
              Ferramentas
            </span>
            <div className="mt-2 flex flex-col gap-1">
              {secondaryNav.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) =>
                      cn(
                        "flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                        isActive
                          ? "bg-primary text-primary-foreground shadow-xs"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      )
                    }
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0 opacity-80" />
                    <span>{item.label}</span>
                  </NavLink>
                );
              })}
            </div>
          </div>
        </nav>

        {/* Sidebar Footer: User & Logout */}
        <div className="mt-auto border-t border-border pt-4">
          <div className="flex items-center justify-between px-2 pb-3">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-accent/15 text-accent text-xs font-bold font-mono">
                GS
              </div>
              <div className="flex flex-col text-left">
                <span className="text-xs font-medium text-foreground leading-tight">
                  Criador
                </span>
                <span className="text-[10px] text-muted-foreground leading-tight">
                  Sessão ativa
                </span>
              </div>
            </div>
          </div>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={logout}
            className="w-full justify-start gap-2 text-xs text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span>Encerrar sessão</span>
          </Button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
    </div>
  );
}
