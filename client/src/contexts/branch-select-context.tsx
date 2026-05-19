import { createContext, useContext, useState, useCallback, ReactNode } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Building2, MapPin, CheckCircle2 } from "lucide-react";

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
  resolve: ((b: RdBranch | null) => void) | null;
}

interface BranchSelectContextValue {
  selectBranch: (branches: RdBranch[]) => Promise<RdBranch | null>;
}

const BranchSelectContext = createContext<BranchSelectContextValue | null>(null);

export function BranchSelectProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<BranchSelectState>({ open: false, branches: [], resolve: null });

  const selectBranch = useCallback((branches: RdBranch[]): Promise<RdBranch | null> => {
    return new Promise((resolve) => {
      setState({ open: true, branches, resolve });
    });
  }, []);

  const handleSelect = (branch: RdBranch) => {
    state.resolve?.(branch);
    setState({ open: false, branches: [], resolve: null });
  };

  const handleCancel = () => {
    state.resolve?.(null);
    setState({ open: false, branches: [], resolve: null });
  };

  return (
    <BranchSelectContext.Provider value={{ selectBranch }}>
      {children}
      <Dialog open={state.open} onOpenChange={(open) => { if (!open) handleCancel(); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Building2 className="h-5 w-5 text-[#fb9678]" />
              เลือกสาขา
            </DialogTitle>
            <DialogDescription className="text-sm text-gray-500">
              พบ {state.branches.length} สาขาในระบบกรมสรรพากร กรุณาเลือกสาขาที่ต้องการ
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2 mt-2 max-h-[60vh] overflow-y-auto pr-1">
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
          <div className="flex justify-end pt-2 border-t">
            <Button variant="outline" size="sm" onClick={handleCancel} data-testid="button-branch-cancel">
              ยกเลิก
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </BranchSelectContext.Provider>
  );
}

export function useBranchSelect() {
  const ctx = useContext(BranchSelectContext);
  if (!ctx) throw new Error("useBranchSelect must be used within BranchSelectProvider");
  return ctx;
}
