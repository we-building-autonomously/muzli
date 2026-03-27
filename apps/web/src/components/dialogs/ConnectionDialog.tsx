"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Loader2, CheckCircle, XCircle, Database, Globe, Key, Server, HardDrive, Folder } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { apiClient } from "@/api/client";
import type { CreateConnectionData } from "@/types";

interface ConnectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConnectionCreated: () => void;
}

const DB_CONFIGS = {
  postgres: {
    label: "PostgreSQL",
    icon: "🐘",
    defaultPort: 5432,
    hostLabel: "Host",
    hostPlaceholder: "localhost",
    databaseLabel: "Database",
    databasePlaceholder: "myapp",
    usernamePlaceholder: "postgres",
    showHost: true,
    showPort: true,
    showDatabase: true,
    showUsername: true,
    showPassword: true,
    showSsl: true,
    passwordLabel: "Password",
  },
  mongodb: {
    label: "MongoDB",
    icon: "🍃",
    defaultPort: 27017,
    hostLabel: "Host",
    hostPlaceholder: "localhost",
    databaseLabel: "Database",
    databasePlaceholder: "mydb",
    usernamePlaceholder: "admin",
    showHost: true,
    showPort: true,
    showDatabase: true,
    showUsername: true,
    showPassword: true,
    showSsl: true,
    passwordLabel: "Password",
  },
  mysql: {
    label: "MySQL",
    icon: "🐬",
    defaultPort: 3306,
    hostLabel: "Host",
    hostPlaceholder: "localhost",
    databaseLabel: "Database",
    databasePlaceholder: "myapp",
    usernamePlaceholder: "root",
    showHost: true,
    showPort: true,
    showDatabase: true,
    showUsername: true,
    showPassword: true,
    showSsl: true,
    passwordLabel: "Password",
  },
  sqlite: {
    label: "SQLite",
    icon: "📄",
    defaultPort: 0,
    hostLabel: "File Path",
    hostPlaceholder: "/path/to/database.db",
    databaseLabel: "Database",
    databasePlaceholder: "main",
    usernamePlaceholder: "",
    showHost: true,
    showPort: false,
    showDatabase: false,
    showUsername: false,
    showPassword: false,
    showSsl: false,
    passwordLabel: "Password",
  },
  redis: {
    label: "Redis",
    icon: "⚡",
    defaultPort: 6379,
    hostLabel: "Host",
    hostPlaceholder: "localhost",
    databaseLabel: "Database (0-15)",
    databasePlaceholder: "0",
    usernamePlaceholder: "",
    showHost: true,
    showPort: true,
    showDatabase: true,
    showUsername: false,
    showPassword: true,
    showSsl: true,
    passwordLabel: "Password",
  },
  pinecone: {
    label: "Pinecone",
    icon: "🌲",
    defaultPort: 443,
    hostLabel: "Index Host (optional)",
    hostPlaceholder: "leave empty to auto-discover indexes",
    databaseLabel: "",
    databasePlaceholder: "",
    usernamePlaceholder: "",
    showHost: false,
    showPort: false,
    showDatabase: false,
    showUsername: false,
    showPassword: true,
    showSsl: false,
    passwordLabel: "API Key",
  },
  turbopuffer: {
    label: "Turbopuffer",
    icon: "🔮",
    defaultPort: 443,
    hostLabel: "API Host",
    hostPlaceholder: "api.turbopuffer.com",
    databaseLabel: "Namespace",
    databasePlaceholder: "my-namespace",
    usernamePlaceholder: "",
    showHost: true,
    showPort: false,
    showDatabase: true,
    showUsername: false,
    showPassword: true,
    showSsl: false,
    passwordLabel: "API Key",
  },
} as const;

type DbType = keyof typeof DB_CONFIGS;

export function ConnectionDialog({
  open,
  onOpenChange,
  onConnectionCreated,
}: ConnectionDialogProps) {
  const [formData, setFormData] = useState<CreateConnectionData>({
    name: "",
    type: "postgres",
    host: "localhost",
    port: 5432,
    database: "",
    username: "",
    password: "",
    ssl: false,
  });

  const [testResult, setTestResult] = useState<{
    status: "success" | "error" | null;
    message: string;
  }>({ status: null, message: "" });

  const config = DB_CONFIGS[formData.type as DbType] || DB_CONFIGS.postgres;

  const handleTypeChange = (type: DbType) => {
    const cfg = DB_CONFIGS[type];
    setFormData((prev) => ({
      ...prev,
      type,
      port: cfg.defaultPort,
      host: type === "sqlite" ? "" : type === "turbopuffer" ? "api.turbopuffer.com" : "localhost",
      username: "",
      password: "",
      database: "",
      ssl: type === "pinecone" || type === "turbopuffer",
    }));
    setTestResult({ status: null, message: "" });
  };

  const testMutation = useMutation({
    mutationFn: () => apiClient.testConnection(formData),
    onSuccess: (result) => {
      setTestResult({
        status: result.success ? "success" : "error",
        message: result.message,
      });
    },
    onError: (error: Error) => {
      setTestResult({ status: "error", message: error.message });
    },
  });

  const createMutation = useMutation({
    mutationFn: () => apiClient.createConnection(formData),
    onSuccess: () => {
      onConnectionCreated();
      setFormData({
        name: "",
        type: "postgres",
        host: "localhost",
        port: 5432,
        database: "",
        username: "",
        password: "",
        ssl: false,
      });
      setTestResult({ status: null, message: "" });
    },
  });

  const handleTest = () => {
    setTestResult({ status: null, message: "" });
    testMutation.mutate();
  };

  const handleCreate = () => {
    createMutation.mutate();
  };

  const isVectorDb = formData.type === "pinecone" || formData.type === "turbopuffer";
  const isFormValid =
    formData.name &&
    (isVectorDb || formData.host) &&
    (formData.type === "redis" || isVectorDb || formData.type === "sqlite" || formData.database) &&
    (formData.type === "sqlite" || formData.type === "redis" || isVectorDb || formData.username) &&
    (!isVectorDb || formData.password);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader className="pb-1">
          <DialogTitle>New Connection</DialogTitle>
          <DialogDescription>
            Connect to a database or vector store.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2.5 py-1">
          {/* Database Type Selector */}
          <div className="grid gap-1">
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Type</Label>
            <div className="grid grid-cols-4 gap-1">
              {(Object.keys(DB_CONFIGS) as DbType[]).map((type) => {
                const cfg = DB_CONFIGS[type];
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => handleTypeChange(type)}
                    className={`flex items-center gap-1.5 px-2 py-1.5 text-[11px] font-medium rounded-md transition-all ${
                      formData.type === type
                        ? "bg-primary/15 text-primary border border-primary/30 shadow-sm"
                        : "bg-muted/50 text-muted-foreground hover:text-foreground hover:bg-muted border border-transparent"
                    }`}
                  >
                    <span className="text-sm">{cfg.icon}</span>
                    <span className="truncate">{cfg.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Connection Name */}
          <div className="grid gap-1">
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Name</Label>
            <Input
              value={formData.name}
              onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
              placeholder={`My ${config.label}`}
            />
          </div>

          {/* Host + Port */}
          {config.showHost && (
            <div className={`grid gap-2 ${config.showPort ? "grid-cols-[1fr_80px]" : ""}`}>
              <div className="grid gap-1">
                <Label className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">{config.hostLabel}</Label>
                <Input
                  value={formData.host}
                  onChange={(e) => setFormData((prev) => ({ ...prev, host: e.target.value }))}
                  placeholder={config.hostPlaceholder}
                />
              </div>
              {config.showPort && (
                <div className="grid gap-1">
                  <Label className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Port</Label>
                  <Input
                    type="number"
                    value={formData.port}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        port: parseInt(e.target.value) || config.defaultPort,
                      }))
                    }
                    placeholder={String(config.defaultPort)}
                  />
                </div>
              )}
            </div>
          )}

          {/* Database */}
          {config.showDatabase && (
            <div className="grid gap-1">
              <Label className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">{config.databaseLabel}</Label>
              <Input
                value={formData.database}
                onChange={(e) => setFormData((prev) => ({ ...prev, database: e.target.value }))}
                placeholder={config.databasePlaceholder}
              />
            </div>
          )}

          {/* Username + Password */}
          {(config.showUsername || config.showPassword) && (
            <div className={`grid gap-2 ${config.showUsername && config.showPassword ? "grid-cols-2" : ""}`}>
              {config.showUsername && (
                <div className="grid gap-1">
                  <Label className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Username</Label>
                  <Input
                    value={formData.username}
                    onChange={(e) => setFormData((prev) => ({ ...prev, username: e.target.value }))}
                    placeholder={config.usernamePlaceholder}
                  />
                </div>
              )}
              {config.showPassword && (
                <div className="grid gap-1">
                  <Label className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">{config.passwordLabel}</Label>
                  <Input
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData((prev) => ({ ...prev, password: e.target.value }))}
                    placeholder={isVectorDb ? "sk-..." : "••••••••"}
                  />
                </div>
              )}
            </div>
          )}

          {/* SSL */}
          {config.showSsl && (
            <div className="flex items-center gap-2 pt-0.5">
              <Switch
                id="ssl"
                checked={formData.ssl}
                onCheckedChange={(checked) =>
                  setFormData((prev) => ({ ...prev, ssl: checked }))
                }
              />
              <Label htmlFor="ssl" className="text-xs text-muted-foreground">Use SSL / TLS</Label>
            </div>
          )}

          {/* Test Result */}
          {testResult.status && (
            <div
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] ${
                testResult.status === "success"
                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                  : "bg-red-500/10 text-red-400 border border-red-500/20"
              }`}
            >
              {testResult.status === "success" ? (
                <CheckCircle className="h-3 w-3 flex-shrink-0" />
              ) : (
                <XCircle className="h-3 w-3 flex-shrink-0" />
              )}
              <span className="truncate">{testResult.message}</span>
            </div>
          )}
        </div>

        <DialogFooter>
          <div className="flex gap-2 w-full justify-between">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleTest}
              disabled={!isFormValid || testMutation.isPending}
            >
              {testMutation.isPending ? (
                <>
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                  Testing…
                </>
              ) : (
                "Test"
              )}
            </Button>

            <div className="flex gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleCreate}
                disabled={
                  !isFormValid ||
                  createMutation.isPending ||
                  testResult.status !== "success"
                }
              >
                {createMutation.isPending ? (
                  <>
                    <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                    Creating…
                  </>
                ) : (
                  "Connect"
                )}
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
