"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Loader2, CheckCircle, XCircle } from "lucide-react";
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

  const dbTypes = [
    { value: "postgres" as const, label: "PostgreSQL", port: 5432 },
    { value: "mongodb" as const, label: "MongoDB", port: 27017 },
    { value: "mysql" as const, label: "MySQL", port: 3306 },
    { value: "sqlite" as const, label: "SQLite", port: 0 },
    { value: "redis" as const, label: "Redis", port: 6379 },
  ];

  const handleTypeChange = (type: "postgres" | "mongodb" | "mysql" | "sqlite" | "redis") => {
    const dbType = dbTypes.find((t) => t.value === type);
    setFormData((prev) => ({
      ...prev,
      type,
      port: dbType?.port ?? 5432,
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
      setTestResult({
        status: "error",
        message: error.message,
      });
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

  const isFormValid =
    formData.name && formData.host && (formData.type === "redis" || formData.database) && (formData.type === "sqlite" || formData.type === "redis" || formData.username);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader className="pb-2">
          <DialogTitle className="text-base">New Connection</DialogTitle>
          <DialogDescription className="text-xs">
            Create a new database connection.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 py-2">
          {/* Database Type Toggle */}
          <div className="grid gap-1.5">
            <Label className="text-xs">Database Type</Label>
            <div className="flex gap-1 p-0.5 bg-muted rounded-md w-fit flex-wrap">
              {dbTypes.map((dbType) => (
                <button
                  key={dbType.value}
                  type="button"
                  onClick={() => handleTypeChange(dbType.value)}
                  className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                    formData.type === dbType.value
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {dbType.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="name" className="text-xs">Connection Name</Label>
            <Input
              id="name"
              className="h-8 text-sm"
              value={formData.name}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, name: e.target.value }))
              }
              placeholder={formData.type === "sqlite" ? "My SQLite DB" : formData.type === "redis" ? "My Redis" : formData.type === "mysql" ? "My MySQL DB" : formData.type === "mongodb" ? "My MongoDB" : "My PostgreSQL DB"}
            />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2">
              <Label htmlFor="host" className="text-xs">Host</Label>
              <Input
                id="host"
                className="h-8 text-sm"
                value={formData.host}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, host: e.target.value }))
                }
                placeholder={formData.type === "sqlite" ? "/path/to/database.db" : "localhost"}
              />
            </div>
            {formData.type !== "sqlite" && (
            <div>
              <Label htmlFor="port" className="text-xs">Port</Label>
              <Input
                id="port"
                className="h-8 text-sm"
                type="number"
                value={formData.port}
                onChange={(e) => {
                  const defaultPort = dbTypes.find((t) => t.value === formData.type)?.port ?? 5432;
                  setFormData((prev) => ({
                    ...prev,
                    port: parseInt(e.target.value) || defaultPort,
                  }));
                }}
                placeholder={String(dbTypes.find((t) => t.value === formData.type)?.port ?? 5432)}
              />
            </div>
            )}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="database" className="text-xs">{formData.type === "redis" ? "Database (0-15)" : "Database"}</Label>
            <Input
              id="database"
              className="h-8 text-sm"
              value={formData.database}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, database: e.target.value }))
              }
              placeholder={formData.type === "mongodb" ? "mydb" : formData.type === "redis" ? "0" : formData.type === "sqlite" ? "main" : "myapp"}
            />
          </div>

          {formData.type !== "sqlite" && (
          <div className="grid grid-cols-2 gap-2">
            {formData.type !== "redis" && (
            <div>
              <Label htmlFor="username" className="text-xs">Username</Label>
              <Input
                id="username"
                className="h-8 text-sm"
                value={formData.username}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, username: e.target.value }))
                }
                placeholder={formData.type === "mongodb" ? "admin" : formData.type === "mysql" ? "root" : "postgres"}
              />
            </div>
            )}
            <div>
              <Label htmlFor="password" className="text-xs">Password</Label>
              <Input
                id="password"
                className="h-8 text-sm"
                type="password"
                value={formData.password}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, password: e.target.value }))
                }
                placeholder="password"
              />
            </div>
          </div>
          )}

          <div className="flex items-center space-x-2">
            <Switch
              id="ssl"
              checked={formData.ssl}
              onCheckedChange={(checked) =>
                setFormData((prev) => ({ ...prev, ssl: checked }))
              }
            />
            <Label htmlFor="ssl" className="text-xs">Use SSL</Label>
          </div>

          {testResult.status && (
            <div
              className={`flex items-center gap-2 p-2 rounded-md text-xs ${
                testResult.status === "success"
                  ? "bg-green-500/10 text-green-500 border border-green-500/20"
                  : "bg-red-500/10 text-red-500 border border-red-500/20"
              }`}
            >
              {testResult.status === "success" ? (
                <CheckCircle className="h-3.5 w-3.5" />
              ) : (
                <XCircle className="h-3.5 w-3.5" />
              )}
              <span>{testResult.message}</span>
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
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  Testing...
                </>
              ) : (
                "Test Connection"
              )}
            </Button>

            <div className="flex gap-2">
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
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    Creating...
                  </>
                ) : (
                  "Create Connection"
                )}
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
