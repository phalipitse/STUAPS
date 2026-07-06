import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "../lib/api";

export interface Institution {
  id: number;
  name: string;
  invoicePrefix: string;
}

interface InstitutionState {
  institutions: Institution[];
  selectedId: number | null;
  setSelectedId: (id: number) => void;
  refresh: () => Promise<void>;
  loading: boolean;
}

const InstitutionContext = createContext<InstitutionState | undefined>(undefined);

export function InstitutionProvider({ children }: { children: ReactNode }) {
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    const rows = await api.get<Institution[]>("/institutions");
    setInstitutions(rows);
    setSelectedId((current) => current ?? rows[0]?.id ?? null);
  }

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, []);

  return (
    <InstitutionContext.Provider value={{ institutions, selectedId, setSelectedId, refresh, loading }}>
      {children}
    </InstitutionContext.Provider>
  );
}

export function useInstitutions() {
  const ctx = useContext(InstitutionContext);
  if (!ctx) throw new Error("useInstitutions must be used within InstitutionProvider");
  return ctx;
}
