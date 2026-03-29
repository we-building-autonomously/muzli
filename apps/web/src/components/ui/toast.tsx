"use client";

import { useState, useEffect, useCallback, createContext, useContext } from "react";
import { Check, X, AlertCircle, Info } from "lucide-react";

interface Toast {
  id: string;
  message: string;
  type: "success" | "error" | "info";
}

interface ToastContextValue {
  toast: (message: string, type?: Toast["type"]) => void;
}

const ToastContext = createContext<ToastContextValue>({ toast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((message: string, type: Toast["type"] = "success") => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 2500);
  }, []);

  return (
    <ToastContext.Provider value={{ toast: addToast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`flex items-center gap-2 px-3 py-2 rounded-md shadow-lg text-xs animate-in slide-in-from-right-5 ${
              t.type === "success" ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
              : t.type === "error" ? "bg-red-500/15 text-red-400 border border-red-500/30"
              : "bg-blue-500/15 text-blue-400 border border-blue-500/30"
            }`}
          >
            {t.type === "success" ? <Check className="h-3.5 w-3.5" />
              : t.type === "error" ? <AlertCircle className="h-3.5 w-3.5" />
              : <Info className="h-3.5 w-3.5" />}
            {t.message}
            <button onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}>
              <X className="h-3 w-3 opacity-50 hover:opacity-100" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
