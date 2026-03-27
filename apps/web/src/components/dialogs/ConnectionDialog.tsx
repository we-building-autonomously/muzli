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
    formData.name && formData.host && formData.database && formData.username;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>New Connection</DialogTitle>
          <DialogDescription>
            Create a new PostgreSQL database connection.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="name">Connection Name</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, name: e.target.value }))
              }
              placeholder="My PostgreSQL DB"
            />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2">
              <Label htmlFor="host">Host</Label>
              <Input
                id="host"
                value={formData.host}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, host: e.target.value }))
                }
                placeholder="localhost"
              />
            </div>
            <div>
              <Label htmlFor="port">Port</Label>
              <Input
                id="port"
                type="number"
                value={formData.port}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    port: parseInt(e.target.value) || 5432,
                  }))
                }
                placeholder="5432"
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="database">Database</Label>
            <Input
              id="database"
              value={formData.database}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, database: e.target.value }))
              }
              placeholder="myapp"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                value={formData.username}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, username: e.target.value }))
                }
                placeholder="postgres"
              />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={formData.password}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, password: e.target.value }))
                }
                placeholder="password"
              />
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <Switch
              id="ssl"
              checked={formData.ssl}
              onCheckedChange={(checked) =>
                setFormData((prev) => ({ ...prev, ssl: checked }))
              }
            />
            <Label htmlFor="ssl">Use SSL</Label>
          </div>

          {testResult.status && (
            <div
              className={`flex items-center gap-2 p-3 rounded-lg ${
                testResult.status === "success"
                  ? "bg-green-500/10 text-green-500 border border-green-500/20"
                  : "bg-red-500/10 text-red-500 border border-red-500/20"
              }`}
            >
              {testResult.status === "success" ? (
                <CheckCircle className="h-4 w-4" />
              ) : (
                <XCircle className="h-4 w-4" />
              )}
              <span className="text-sm">{testResult.message}</span>
            </div>
          )}
        </div>

        <DialogFooter>
          <div className="flex gap-2 w-full justify-between">
            <Button
              type="button"
              variant="outline"
              onClick={handleTest}
              disabled={!isFormValid || testMutation.isPending}
            >
              {testMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
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
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleCreate}
                disabled={
                  !isFormValid ||
                  createMutation.isPending ||
                  testResult.status !== "success"
                }
              >
                {createMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
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
