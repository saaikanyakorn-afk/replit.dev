import { useState, useEffect, ReactNode } from "react";
import { createPortal } from "react-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Building2, MapPin, CheckCircle2, Search, Loader2 } from "lucide-react";

export interface RdBranch {
  name: string;
  address: string;
  branch: string;
  branchNumber: number;
  source: string;
}

interface BranchSelectState {
  open: boolean;
  branches: RdBranch[];
  hasMore: boolean;
  taxId: string;
  resolve: ((b: RdBranch | null) => void) | null;
}

let _setState: ((s: BranchSelectState) => void) | null = null;

export function selectBranch(
  branches: RdBranch[],
  hasMore = false,
  taxId = ""
): Promise<RdBranch | null> {
  return new Promise((resolve) => {
    _setState?.({ open: true, branches, hasMore, taxId, resolve });
  });
}

export function BranchSelectPortal() {
  const [state, setState] = useState<BranchSelectState>({
    open: false,
    branches: [],
    hasMore: false,
    taxId: "",
    resolve: null,
  });
  const [searchNum, setSearchNum] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");

  useEffect(() => {
    _setState = setState;
    return () => { _setState = null; };
  }, []);

  const handleSelect = (branch: RdBranch) => {
    state.resolve?.(branch);
    setState({ open: false, branches: [], hasMore: false, taxId: "", resolve: null });
    setSearchNum("");
    setSearchError("");
  };

  const handleCancel = () => {
    state.resolve?.(null);
    setState({ open: false, branches: [], hasMore: false, taxId: "", resolve: null });
    setSearchNum("");
    setSearchError("");
  };

  const handleSearchBranch = async () => {
    const num = parseInt(searchNum, 10);
    if (isNaN(num) || num < 0) {
      setSearchError("กรุณากรอกหมายเลขสาขาที่ถูกต้อง (เช่น 10, 25, 100)");
      return;
    }
    setSearching(true);
    setSearchError("");
    try {
      const res = await fetch(`/api/dbd-branch-lookup/${state.taxId}/${num}`, { credentials: "include" });
      if (res.ok) {
        const branch: RdBranch = await res.json();
        handleSelect(branch);
      } else {
        const data = await res.json().catch(() => ({}));
        setSearchError(data.message || `ไม่พบสาขาที่ ${num} ในระบบกรมสรรพากร`);
      }
    } catch {
      setSearchError("เกิดข้อผิดพลาดในการค้นหา กรุณาลองใหม่");
    } finally {
      setSearching(false);
    }
  };

  if (!state.open) return null;

  return createPortal(
    <Dialog open={state.open} onOpenChange={(open) => { if (!open) handleCancel(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Building2 className="h-5 w-5 text-[#fb9678]" />
            เลือกสาขา
          </DialogTitle>
          <DialogDescription className="text-sm text-gray-500">
            {state.hasMore
              ? `พบ ${state.branches.length} สาขาแรกในระบบกรมสรรพากร (อาจมีมากกว่านี้)`
              : `พบ ${state.branches.length} สาขาในระบบกรมสรรพากร กรุณาเลือกสาขาที่ต้องการ`}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2 mt-2 max-h-[45vh] overflow-y-auto pr-1">
          {state.branches.map((b) => (
            <button
              key={b.branchNumber}
              type="button"
              onClick={() => handleSelect(b)}
              data-testid={`branch-option-${b.branchNumber}`}
              className="text-left w-full rounded-lg border border-gray-200 hover:border-[#fb9678] hover:bg-orange-50 transition-colors p-3 group"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-semibold text-sm text-gray-800 truncate">{b.name}</span>
                  </div>
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                      b.branchNumber === 0
                        ? "bg-blue-100 text-blue-700"
                        : "bg-orange-100 text-orange-700"
                    }`}>
                      {b.branch}
                    </span>
                  </div>
                  {b.address && (
                    <div className="flex items-start gap-1 text-xs text-gray-500">
                      <MapPin className="h-3 w-3 mt-0.5 shrink-0" />
                      <span className="line-clamp-2">{b.address}</span>
                    </div>
                  )}
                </div>
                <CheckCircle2 className="h-4 w-4 text-[#fb9678] opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5" />
              </div>
            </button>
          ))}
        </div>

        {state.hasMore && (
          <div className="mt-3 pt-3 border-t space-y-2">
            <p className="text-xs text-gray-500 font-medium">ค้นหาสาขาเพิ่มเติม</p>
            <div className="flex gap-2">
              <Input
                type="number"
                min={0}
                placeholder="หมายเลขสาขา เช่น 10, 25, 100"
                value={searchNum}
                onChange={(e) => { setSearchNum(e.target.value); setSearchError(""); }}
                onKeyDown={(e) => { if (e.key === "Enter") handleSearchBranch(); }}
                data-testid="input-branch-number-search"
                className="flex-1 h-9 text-sm"
              />
              <Button
                type="button"
                size="sm"
                onClick={handleSearchBranch}
                disabled={searching || !searchNum}
                data-testid="button-search-branch-number"
                className="bg-[#fb9678] hover:bg-[#e8855f] text-white shrink-0"
              >
                {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                <span className="ml-1">ค้นหา</span>
              </Button>
            </div>
            {searchError && (
              <p className="text-xs text-red-500" data-testid="text-branch-search-error">{searchError}</p>
            )}
          </div>
        )}

        <div className="flex justify-end pt-2 border-t">
          <Button variant="outline" size="sm" onClick={handleCancel} data-testid="button-branch-cancel">
            ยกเลิก
          </Button>
        </div>
      </DialogContent>
    </Dialog>,
    document.body
  );
}

export function BranchSelectProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
