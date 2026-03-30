"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Database,
  Zap,
  Terminal,
  Table2,
  Search,
  Layers,
  ArrowRight,
  Github,
  Monitor,
  Globe,
  ChevronDown,
  Sparkles,
  Shield,
  Command,
} from "lucide-react";

const features = [
  {
    icon: Database,
    title: "Multi-Database Support",
    description:
      "Connect to PostgreSQL, MySQL, Redis, Pinecone, and more. Manage all your databases from one interface.",
  },
  {
    icon: Terminal,
    title: "Monaco Query Editor",
    description:
      "Full-powered SQL editor with syntax highlighting, autocomplete, and multi-tab support.",
  },
  {
    icon: Table2,
    title: "Schema Explorer",
    description:
      "Browse databases, schemas, tables, and columns in an intuitive tree view with live previews.",
  },
  {
    icon: Zap,
    title: "Blazing Fast Results",
    description:
      "Instant query execution with streaming results, pagination, sorting, and one-click export.",
  },
  {
    icon: Search,
    title: "Command Palette",
    description:
      "Jump to any table, connection, or saved query instantly with Ctrl+K. Everything is searchable.",
  },
  {
    icon: Shield,
    title: "Open Source & Local",
    description:
      "Your data never leaves your machine. Fully open source, self-hosted, and free forever.",
  },
];

const shortcuts = [
  { keys: "Ctrl+Enter", label: "Execute query" },
  { keys: "Ctrl+K", label: "Command palette" },
  { keys: "Ctrl+N", label: "New tab" },
  { keys: "Ctrl+S", label: "Save query" },
];

function AnimatedGridLine({ delay, horizontal }: { delay: number; horizontal?: boolean }) {
  return (
    <div
      className={`absolute ${horizontal ? "h-px w-full" : "w-px h-full"} bg-gradient-to-${horizontal ? "r" : "b"} from-transparent via-primary/20 to-transparent`}
      style={{
        animation: `pulse 4s ease-in-out ${delay}s infinite`,
        [horizontal ? "top" : "left"]: `${Math.random() * 100}%`,
      }}
    />
  );
}

export default function LandingPage() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handler);
    return () => window.removeEventListener("scroll", handler);
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      <nav
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          scrolled
            ? "bg-background/80 backdrop-blur-xl border-b shadow-sm"
            : "bg-transparent"
        }`}
      >
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-7 w-7 rounded-lg bg-primary flex items-center justify-center">
              <Database className="h-3.5 w-3.5 text-primary-foreground" />
            </div>
            <span className="font-bold text-base tracking-tight">Muzli</span>
          </div>
          <div className="flex items-center gap-6">
            <a
              href="#features"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors hidden sm:block"
            >
              Features
            </a>
            <a
              href="https://github.com/we-building-autonomously/muzli"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors hidden sm:block"
            >
              GitHub
            </a>
            <Link
              href="/app"
              className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors"
            >
              Launch App
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative pt-32 pb-20 px-6 overflow-hidden">
        {/* Background grid effect */}
        <div className="absolute inset-0 opacity-[0.03]">
          <div
            className="h-full w-full"
            style={{
              backgroundImage:
                "linear-gradient(hsl(var(--foreground)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--foreground)) 1px, transparent 1px)",
              backgroundSize: "60px 60px",
            }}
          />
        </div>

        {/* Gradient orbs */}
        <div className="absolute top-20 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute top-40 right-1/4 w-80 h-80 bg-primary/3 rounded-full blur-3xl" />

        <div className="max-w-4xl mx-auto text-center relative">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border bg-muted/50 text-xs text-muted-foreground mb-6">
            <Sparkles className="h-3 w-3 text-primary" />
            Open source database management
          </div>

          <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight leading-[1.1] mb-6">
            The database tool
            <br />
            <span className="text-primary">you&apos;ll actually enjoy</span>
          </h1>

          <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed">
            A modern, open-source alternative to DataGrip. Connect to any database,
            write queries with intelligent autocomplete, and explore your data — all
            from your browser.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-16">
            <Link
              href="/app"
              className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground font-medium rounded-xl hover:bg-primary/90 transition-all hover:shadow-lg hover:shadow-primary/20 text-sm"
            >
              Launch App
              <ArrowRight className="h-4 w-4" />
            </Link>
            <a
              href="https://github.com/we-building-autonomously/muzli"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-6 py-3 border rounded-xl hover:bg-muted/50 transition-all text-sm font-medium"
            >
              <Github className="h-4 w-4" />
              View on GitHub
            </a>
          </div>

          {/* App preview */}
          <div className="relative max-w-4xl mx-auto">
            <div className="rounded-xl border bg-card shadow-2xl shadow-black/20 overflow-hidden">
              {/* Window chrome */}
              <div className="flex items-center gap-2 px-4 py-2.5 bg-muted/50 border-b">
                <div className="flex gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-500/60" />
                  <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/60" />
                  <div className="w-2.5 h-2.5 rounded-full bg-green-500/60" />
                </div>
                <div className="flex-1 text-center">
                  <span className="text-[10px] text-muted-foreground font-mono">
                    muzli — localhost:3000
                  </span>
                </div>
              </div>
              {/* Mock IDE interface */}
              <div className="flex h-[340px] sm:h-[400px]">
                {/* Sidebar mock */}
                <div className="w-52 border-r bg-muted/20 p-3 hidden sm:block">
                  <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-3">
                    Connections
                  </div>
                  {["Production DB", "Staging DB", "Analytics"].map((name, i) => (
                    <div
                      key={name}
                      className={`flex items-center gap-2 px-2 py-1.5 rounded text-xs mb-1 ${
                        i === 0
                          ? "bg-primary/10 text-primary"
                          : "text-muted-foreground"
                      }`}
                    >
                      <Database className="h-3 w-3" />
                      {name}
                    </div>
                  ))}
                  <div className="mt-4 text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-2">
                    Tables
                  </div>
                  {["users", "orders", "products", "sessions", "analytics"].map(
                    (t) => (
                      <div
                        key={t}
                        className="flex items-center gap-2 px-2 py-1 text-xs text-muted-foreground"
                      >
                        <Table2 className="h-3 w-3" />
                        {t}
                      </div>
                    )
                  )}
                </div>
                {/* Editor + results mock */}
                <div className="flex-1 flex flex-col">
                  {/* Tab bar */}
                  <div className="flex items-center border-b bg-muted/30 px-1">
                    <div className="px-3 py-1.5 text-[10px] bg-background border-b-2 border-primary text-foreground">
                      Query 1
                    </div>
                    <div className="px-3 py-1.5 text-[10px] text-muted-foreground">
                      Query 2
                    </div>
                  </div>
                  {/* Editor */}
                  <div className="flex-1 p-4 font-mono text-xs leading-relaxed">
                    <div>
                      <span className="text-blue-400">SELECT</span>{" "}
                      <span className="text-foreground">u.name, u.email,</span>
                    </div>
                    <div>
                      {"  "}
                      <span className="text-blue-400">COUNT</span>
                      <span className="text-foreground">(o.id)</span>{" "}
                      <span className="text-blue-400">AS</span>{" "}
                      <span className="text-foreground">order_count</span>
                    </div>
                    <div>
                      <span className="text-blue-400">FROM</span>{" "}
                      <span className="text-emerald-400">users</span>{" "}
                      <span className="text-foreground">u</span>
                    </div>
                    <div>
                      <span className="text-blue-400">LEFT JOIN</span>{" "}
                      <span className="text-emerald-400">orders</span>{" "}
                      <span className="text-foreground">o</span>{" "}
                      <span className="text-blue-400">ON</span>{" "}
                      <span className="text-foreground">u.id = o.user_id</span>
                    </div>
                    <div>
                      <span className="text-blue-400">GROUP BY</span>{" "}
                      <span className="text-foreground">u.name, u.email</span>
                    </div>
                    <div>
                      <span className="text-blue-400">ORDER BY</span>{" "}
                      <span className="text-foreground">order_count</span>{" "}
                      <span className="text-blue-400">DESC</span>
                    </div>
                    <div>
                      <span className="text-blue-400">LIMIT</span>{" "}
                      <span className="text-amber-400">25</span>
                      <span className="text-foreground">;</span>
                    </div>
                  </div>
                  {/* Results bar */}
                  <div className="border-t">
                    <div className="flex items-center gap-3 px-3 py-1.5 text-[10px] text-muted-foreground bg-muted/30">
                      <span className="text-emerald-400">25 rows</span>
                      <span>12ms</span>
                      <span>Query 1 of 1</span>
                    </div>
                    {/* Results table mock */}
                    <div className="overflow-hidden">
                      <table className="w-full text-[10px]">
                        <thead>
                          <tr className="bg-muted/40 text-muted-foreground">
                            <th className="text-left px-3 py-1.5 font-medium">name</th>
                            <th className="text-left px-3 py-1.5 font-medium">email</th>
                            <th className="text-left px-3 py-1.5 font-medium">order_count</th>
                          </tr>
                        </thead>
                        <tbody>
                          {[
                            ["Alice Chen", "alice@example.com", "142"],
                            ["Bob Smith", "bob@example.com", "98"],
                            ["Carol Wu", "carol@example.com", "87"],
                          ].map(([name, email, count], i) => (
                            <tr key={i} className="border-t border-border/50">
                              <td className="px-3 py-1.5">{name}</td>
                              <td className="px-3 py-1.5 text-muted-foreground">{email}</td>
                              <td className="px-3 py-1.5 text-primary">{count}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Decorative glow under preview */}
            <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 w-3/4 h-16 bg-primary/10 blur-3xl rounded-full" />
          </div>
        </div>

        {/* Scroll indicator */}
        <div className="flex justify-center mt-16">
          <a href="#features" className="animate-bounce text-muted-foreground/50">
            <ChevronDown className="h-5 w-5" />
          </a>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-24 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
              Everything you need, nothing you don&apos;t
            </h2>
            <p className="text-muted-foreground text-lg max-w-xl mx-auto">
              Built for developers who want a fast, reliable database tool without the bloat.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="group p-6 rounded-xl border bg-card hover:bg-muted/30 transition-all hover:shadow-md hover:border-primary/20"
              >
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/15 transition-colors">
                  <feature.icon className="h-5 w-5 text-primary" />
                </div>
                <h3 className="font-semibold text-sm mb-2">{feature.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Keyboard shortcuts section */}
      <section className="py-24 px-6 border-t">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border bg-muted/50 text-xs text-muted-foreground mb-4">
                <Command className="h-3 w-3 text-primary" />
                Keyboard-first
              </div>
              <h2 className="text-3xl font-bold tracking-tight mb-4">
                Built for speed
              </h2>
              <p className="text-muted-foreground mb-8 leading-relaxed">
                Every action has a keyboard shortcut. Command palette for instant
                navigation. Multi-tab editing. Your hands never leave the keyboard.
              </p>
              <div className="space-y-3">
                {shortcuts.map((s) => (
                  <div key={s.keys} className="flex items-center gap-4">
                    <kbd className="inline-flex items-center px-2.5 py-1 bg-muted rounded-md text-xs font-mono min-w-[120px]">
                      {s.keys}
                    </kbd>
                    <span className="text-sm text-muted-foreground">{s.label}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="relative">
              <div className="rounded-xl border bg-card p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Search className="h-4 w-4 text-muted-foreground" />
                  <div className="flex-1 h-8 rounded-md bg-muted/50 flex items-center px-3">
                    <span className="text-xs text-muted-foreground">
                      Search tables, connections, queries...
                    </span>
                  </div>
                  <kbd className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded font-mono">
                    Ctrl+K
                  </kbd>
                </div>
                <div className="space-y-1">
                  {[
                    { icon: Database, label: "Production DB", type: "connection", color: "text-blue-400" },
                    { icon: Table2, label: "users", type: "table", color: "text-emerald-400" },
                    { icon: Table2, label: "user_sessions", type: "table", color: "text-emerald-400" },
                  ].map((item, i) => (
                    <div
                      key={i}
                      className={`flex items-center gap-3 px-3 py-2 rounded-md text-xs ${
                        i === 0 ? "bg-muted/50" : ""
                      }`}
                    >
                      <item.icon className={`h-3.5 w-3.5 ${item.color}`} />
                      <span className="flex-1">{item.label}</span>
                      <span className="text-[10px] text-muted-foreground">{item.type}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="absolute -bottom-4 -right-4 w-32 h-32 bg-primary/5 rounded-full blur-2xl" />
            </div>
          </div>
        </div>
      </section>

      {/* Platforms */}
      <section className="py-24 px-6 border-t">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl font-bold tracking-tight mb-4">
            Run it anywhere
          </h2>
          <p className="text-muted-foreground mb-12 text-lg">
            Web app in your browser, or native desktop app for Mac, Windows, and Linux.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-6">
            {[
              { icon: Globe, label: "Web App", desc: "No install needed" },
              { icon: Monitor, label: "Desktop App", desc: "Native performance" },
            ].map((platform) => (
              <div
                key={platform.label}
                className="flex items-center gap-4 px-6 py-4 rounded-xl border bg-card min-w-[220px]"
              >
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <platform.icon className="h-5 w-5 text-primary" />
                </div>
                <div className="text-left">
                  <div className="font-medium text-sm">{platform.label}</div>
                  <div className="text-xs text-muted-foreground">{platform.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 px-6 border-t">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
            Ready to try it?
          </h2>
          <p className="text-muted-foreground text-lg mb-8">
            No sign-up. No credit card. Just connect your database and go.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href="/app"
              className="inline-flex items-center gap-2 px-8 py-3 bg-primary text-primary-foreground font-medium rounded-xl hover:bg-primary/90 transition-all hover:shadow-lg hover:shadow-primary/20 text-sm"
            >
              Launch App
              <ArrowRight className="h-4 w-4" />
            </Link>
            <a
              href="https://github.com/we-building-autonomously/muzli"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-6 py-3 border rounded-xl hover:bg-muted/50 transition-all text-sm"
            >
              <Github className="h-4 w-4" />
              Star on GitHub
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-8 px-6">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded-md bg-primary flex items-center justify-center">
              <Database className="h-3 w-3 text-primary-foreground" />
            </div>
            <span className="text-sm font-medium">Muzli</span>
            <span className="text-xs text-muted-foreground">
              — Open source database management
            </span>
          </div>
          <div className="flex items-center gap-6 text-xs text-muted-foreground">
            <a
              href="https://github.com/we-building-autonomously/muzli"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground transition-colors"
            >
              GitHub
            </a>
            <a href="#features" className="hover:text-foreground transition-colors">
              Features
            </a>
            <span>MIT License</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
