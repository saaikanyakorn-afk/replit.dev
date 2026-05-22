import { useState } from "react";
import { useToast } from "./use-toast";
import { selectBranch, RdBranch } from "@/contexts/branch-select-context";

interface DBDResult {
  name: string;
  address: string;
  branch: string;
  source?: string;
  contactId?: number;
  phone?: string;
  email?: string;
}

interface ApiResponse extends DBDResult {
  branches?: RdBranch[];
  hasMore?: boolean;
}

async function serverDBDLookup(taxId: string): Promise<{ result: ApiResponse | null; status: "found" | "not_found" | "error" }> {
  try {
    const res = await fetch(`/api/dbd-lookup/${taxId}`, { credentials: "include" });
    if (res.ok) {
      const data = await res.json();
      return { result: data, status: "found" };
    }
    if (res.status === 404) {
      return { result: null, status: "not_found" };
    }
    return { result: null, status: "error" };
  } catch {
    return { result: null, status: "error" };
  }
}

async function serverDBDSearch(query: string): Promise<DBDResult[]> {
  try {
    const res = await fetch(`/api/dbd-search?q=${encodeURIComponent(query)}`, { credentials: "include" });
    if (res.ok) {
      const data = await res.json();
      return data.results || [];
    }
    return [];
  } catch {
    return [];
  }
}

export function useDbdLookup() {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const lookup = async (taxId: string): Promise<DBDResult | null> => {
    const cleanId = taxId.replace(/\D/g, "");
    if (!cleanId || cleanId.length !== 13) {
      toast({ title: "เลขนิติบุคคลต้องมี 13 หลัก", variant: "destructive" });
      return null;
    }
    setLoading(true);
    try {
      toast({ title: "กำลังค้นหาข้อมูล..." });
      const { result, status } = await serverDBDLookup(cleanId);

      if (result) {
        const src = result.source === "local" ? "จากรายชื่อในระบบ"
          : result.source === "rd" ? "จากกรมสรรพากร" : "จากระบบ";

        const hasMore = result.hasMore ?? false;
        if (result.branches && (result.branches.length > 1 || hasMore)) {
          toast({ title: hasMore ? `พบ ${result.branches.length}+ สาขา กรุณาเลือกสาขา` : `พบ ${result.branches.length} สาขา กรุณาเลือกสาขา` });
          const chosen = await selectBranch(result.branches, hasMore, cleanId);
          if (!chosen) return null;
          toast({ title: `เลือกสาขา: ${chosen.branch}` });
          return { name: chosen.name, address: chosen.address, branch: chosen.branch, source: chosen.source };
        }

        toast({ title: `พบข้อมูล${src}: ${result.name}` });
        return result;
      }

      if (status === "not_found") {
        toast({ title: "ไม่พบข้อมูลในระบบกรมสรรพากร", variant: "destructive" });
      } else {
        toast({ title: "ไม่สามารถค้นหาได้ กรุณาลองใหม่", variant: "destructive" });
      }
      return null;
    } catch {
      toast({ title: "เกิดข้อผิดพลาดในการค้นหา", variant: "destructive" });
      return null;
    } finally {
      setLoading(false);
    }
  };

  const search = async (query: string): Promise<DBDResult[]> => {
    if (!query || query.length < 2) return [];
    setLoading(true);
    try {
      return await serverDBDSearch(query);
    } catch {
      return [];
    } finally {
      setLoading(false);
    }
  };

  return { lookup, search, loading };
}
