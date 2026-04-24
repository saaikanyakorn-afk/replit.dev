import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Send, MessageSquare, Users, User, Pencil, Check, X, Plus, Trash2, Building2, Globe } from "lucide-react";

type FormType = "tax_invoice" | "tax_invoice_receipt" | "receipt";

const FORM_OPTIONS: { key: FormType; label: string }[] = [
  { key: "tax_invoice", label: "ใบกำกับภาษี" },
  { key: "tax_invoice_receipt", label: "ใบเสร็จรับเงิน/ใบกำกับภาษี" },
  { key: "receipt", label: "ใบเสร็จรับเงิน" },
];

interface LineSendDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shareUrl: string;
  docType: string;
  docNo: string;
  customerName?: string;
  companyId?: number;
  showFormTypeSelector?: boolean;
}

interface LineRecipient {
  id: number;
  lineId: string;
  type: string;
  displayName: string | null;
  companyId: number | null;
}

export default function LineSendDialog({ open, onOpenChange, shareUrl, docType, docNo, customerName, companyId, showFormTypeSelector }: LineSendDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [to, setTo] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [formType, setFormType] = useState<FormType>("tax_invoice");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [newLineId, setNewLineId] = useState("");
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<"group" | "user">("group");
  const [addingForCompany, setAddingForCompany] = useState(true);

  const { data: rawRecipients = [] } = useQuery<LineRecipient[]>({
    queryKey: ["/api/line/recipients", companyId],
    queryFn: async () => {
      const url = companyId ? `/api/line/recipients?companyId=${companyId}` : "/api/line/recipients";
      const res = await fetch(url, { credentials: "include", cache: "no-store" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: open,
    staleTime: 0,
  });

  const { data: mappedGroups = [] } = useQuery<any[]>({
    queryKey: ["/api/line-documents/groups"],
    queryFn: async () => {
      const res = await fetch("/api/line-documents/groups", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: open,
    staleTime: 0,
  });

  const recipients: LineRecipient[] = (() => {
    const fromMappings: LineRecipient[] = mappedGroups
      .filter((g: any) => g.active && g.lineGroupId)
      .map((g: any) => ({
        id: g.id + 100000,
        lineId: g.lineGroupId,
        type: "group",
        displayName: g.groupName || g.lineGroupId,
        companyId: g.companyId ?? null,
      }));
    const combined = [...fromMappings, ...rawRecipients];
    return combined.filter((r, i, arr) => arr.findIndex((x) => x.lineId === r.lineId) === i);
  })();

  const formLabel = showFormTypeSelector ? (FORM_OPTIONS.find(o => o.key === formType)?.label || docType) : docType;
  const resolvedUrl = showFormTypeSelector && formType !== "tax_invoice"
    ? `${shareUrl}${shareUrl.includes("?") ? "&" : "?"}printType=${formType}`
    : shareUrl;
  const defaultMessage = `${formLabel}: ${docNo}${customerName ? `\nลูกค้า: ${customerName}` : ""}\n\nดูเอกสาร:\n${resolvedUrl}`;

  useEffect(() => {
    if (!open) {
      setTo("");
      setMessage("");
      setShowAddForm(false);
      setEditingId(null);
      return;
    }
  }, [open]);

  useEffect(() => {
    if (open && recipients.length > 0 && !to) {
      const companyRecipients = recipients.filter(r => r.companyId === companyId);
      const groups = companyRecipients.filter(r => r.type === "group");
      if (groups.length > 0) {
        setTo(groups[0].lineId);
      } else if (companyRecipients.length > 0) {
        setTo(companyRecipients[0].lineId);
      } else {
        const allGroups = recipients.filter(r => r.type === "group");
        if (allGroups.length > 0) setTo(allGroups[0].lineId);
        else setTo(recipients[0].lineId);
      }
    }
  }, [open, recipients]);

  const handleSend = async () => {
    if (!to.trim()) {
      toast({ title: "กรุณาระบุหรือเลือกผู้รับ", variant: "destructive" });
      return;
    }
    setSending(true);
    try {
      const res = await apiRequest("POST", "/api/line/send", {
        to: to.trim(),
        message: message.trim() || defaultMessage,
      });
      const data = await res.json();
      if (data.success) {
        toast({ title: "ส่งข้อความ LINE สำเร็จ" });
        onOpenChange(false);
      } else {
        toast({ title: "ส่งไม่สำเร็จ", description: data.message, variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "เกิดข้อผิดพลาด", description: err.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const handleSaveName = async (id: number) => {
    try {
      await apiRequest("PATCH", `/api/line/recipients/${id}`, { displayName: editName.trim() });
      queryClient.invalidateQueries({ queryKey: ["/api/line/recipients", companyId] });
      setEditingId(null);
      setEditName("");
      toast({ title: "บันทึกชื่อสำเร็จ" });
    } catch (err: any) {
      toast({ title: "เกิดข้อผิดพลาด", description: err.message, variant: "destructive" });
    }
  };

  const handleAdd = async () => {
    if (!newLineId.trim()) {
      toast({ title: "กรุณาระบุ LINE ID", variant: "destructive" });
      return;
    }
    try {
      await apiRequest("POST", "/api/line/recipients", {
        lineId: newLineId.trim(),
        type: newType,
        displayName: newName.trim() || null,
        companyId: addingForCompany && companyId ? companyId : null,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/line/recipients", companyId] });
      setShowAddForm(false);
      setNewLineId("");
      setNewName("");
      setTo(newLineId.trim());
      toast({ title: "เพิ่มผู้รับสำเร็จ" });
    } catch (err: any) {
      toast({ title: "เกิดข้อผิดพลาด", description: err.message, variant: "destructive" });
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await apiRequest("DELETE", `/api/line/recipients/${id}`);
      queryClient.invalidateQueries({ queryKey: ["/api/line/recipients", companyId] });
      toast({ title: "ลบผู้รับสำเร็จ" });
    } catch (err: any) {
      toast({ title: "เกิดข้อผิดพลาด", description: err.message, variant: "destructive" });
    }
  };

  const startEdit = (r: LineRecipient) => {
    setEditingId(r.id);
    setEditName(r.displayName || "");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-green-600">
            <MessageSquare className="h-5 w-5" />
            ส่งเอกสารผ่าน LINE
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          {showFormTypeSelector && (
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1.5 block">รูปแบบเอกสาร</label>
              <div className="flex gap-1.5 flex-wrap">
                {FORM_OPTIONS.map(opt => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setFormType(opt.key)}
                    className={`px-2.5 py-1.5 rounded-md border text-xs transition-colors ${
                      formType === opt.key
                        ? "bg-green-50 border-green-400 text-green-700 font-medium"
                        : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                    }`}
                    data-testid={`btn-line-form-type-${opt.key}`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-slate-600">เลือกผู้รับ</label>
              <button
                onClick={() => setShowAddForm(!showAddForm)}
                className="flex items-center gap-1 text-[11px] text-[#03c9d7] hover:text-[#02a8b5] font-medium"
                data-testid="btn-add-recipient"
              >
                <Plus className="h-3 w-3" />
                เพิ่มผู้รับ
              </button>
            </div>

            {showAddForm && (
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg mb-2 space-y-2">
                <div className="flex gap-2">
                  <button
                    onClick={() => setNewType("group")}
                    className={`flex-1 py-1.5 text-xs rounded-md border transition-colors ${newType === "group" ? "bg-[#03c9d7]/10 border-[#03c9d7] text-[#03c9d7]" : "border-slate-200 text-slate-500"}`}
                    data-testid="btn-type-group"
                  >
                    <Users className="h-3 w-3 inline mr-1" />กลุ่ม
                  </button>
                  <button
                    onClick={() => setNewType("user")}
                    className={`flex-1 py-1.5 text-xs rounded-md border transition-colors ${newType === "user" ? "bg-[#03c9d7]/10 border-[#03c9d7] text-[#03c9d7]" : "border-slate-200 text-slate-500"}`}
                    data-testid="btn-type-user"
                  >
                    <User className="h-3 w-3 inline mr-1" />ผู้ใช้
                  </button>
                </div>
                <Input
                  value={newLineId}
                  onChange={e => setNewLineId(e.target.value)}
                  placeholder={newType === "group" ? "C... (Group ID)" : "U... (User ID)"}
                  className="text-sm h-8"
                  data-testid="input-new-line-id"
                />
                <Input
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="ชื่อ (ไม่บังคับ)"
                  className="text-sm h-8"
                  data-testid="input-new-name"
                />
                {companyId && (
                  <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={addingForCompany}
                      onChange={e => setAddingForCompany(e.target.checked)}
                      className="rounded border-slate-300"
                    />
                    <Building2 className="h-3 w-3" />
                    เฉพาะบริษัทนี้
                  </label>
                )}
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setShowAddForm(false)} className="flex-1 h-7 text-xs" data-testid="btn-cancel-add">
                    ยกเลิก
                  </Button>
                  <Button size="sm" onClick={handleAdd} className="flex-1 h-7 text-xs bg-[#03c9d7] hover:bg-[#02a8b5]" data-testid="btn-confirm-add">
                    <Plus className="h-3 w-3 mr-1" />เพิ่ม
                  </Button>
                </div>
              </div>
            )}

            {recipients.length > 0 ? (
              <div className="grid gap-1.5 max-h-40 overflow-y-auto">
                {recipients.map(r => (
                  <div key={r.id} className="flex items-center gap-1">
                    {editingId === r.id ? (
                      <div className="flex items-center gap-1 flex-1 px-2 py-1.5 rounded-md border border-[#03c9d7]/30 bg-[#e5f9fa]">
                        {r.type === "group" ? <Users className="h-3.5 w-3.5 text-[#03c9d7] shrink-0" /> : <User className="h-3.5 w-3.5 text-slate-400 shrink-0" />}
                        <Input
                          value={editName}
                          onChange={e => setEditName(e.target.value)}
                          placeholder="ใส่ชื่อ..."
                          className="h-7 text-sm border-0 bg-transparent p-0 focus-visible:ring-0 flex-1"
                          autoFocus
                          onKeyDown={e => { if (e.key === "Enter") handleSaveName(r.id); if (e.key === "Escape") setEditingId(null); }}
                        />
                        <button onClick={() => handleSaveName(r.id)} className="p-0.5 text-green-600 hover:text-green-700" data-testid={`save-name-${r.id}`}>
                          <Check className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => setEditingId(null)} className="p-0.5 text-slate-400 hover:text-slate-600" data-testid={`cancel-name-${r.id}`}>
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <button
                          data-testid={`line-recipient-${r.id}`}
                          onClick={() => setTo(r.lineId)}
                          className={`flex items-center gap-2 px-3 py-2 rounded-md border text-left text-sm transition-colors flex-1 min-w-0 ${to === r.lineId ? "bg-green-50 border-green-300 text-green-700" : "bg-white border-slate-200 hover:bg-slate-50"}`}
                        >
                          {r.type === "group" ? <Users className="h-3.5 w-3.5 text-[#03c9d7] shrink-0" /> : <User className="h-3.5 w-3.5 text-slate-400 shrink-0" />}
                          <span className="truncate">{r.displayName || r.lineId}</span>
                          <span className="ml-auto flex items-center gap-1 shrink-0">
                            {r.companyId ? (
                              <span className="text-[9px] px-1 py-0.5 bg-blue-50 text-blue-500 rounded" title="เฉพาะบริษัทนี้"><Building2 className="h-2.5 w-2.5 inline" /></span>
                            ) : (
                              <span className="text-[9px] px-1 py-0.5 bg-slate-50 text-slate-400 rounded" title="ใช้ได้ทุกบริษัท"><Globe className="h-2.5 w-2.5 inline" /></span>
                            )}
                            <span className="text-[10px] text-slate-400">{r.type === "group" ? "กลุ่ม" : "ผู้ใช้"}</span>
                          </span>
                        </button>
                        <button
                          onClick={() => startEdit(r)}
                          className="p-1 text-slate-400 hover:text-[#03c9d7] hover:bg-[#e5f9fa] rounded transition-colors shrink-0"
                          title="แก้ไขชื่อ"
                          data-testid={`edit-name-${r.id}`}
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                        <button
                          onClick={() => handleDelete(r.id)}
                          className="p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors shrink-0"
                          title="ลบ"
                          data-testid={`delete-recipient-${r.id}`}
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-4 text-sm text-slate-400 border border-dashed border-slate-200 rounded-lg">
                ยังไม่มีผู้รับ กดปุ่ม "เพิ่มผู้รับ" ด้านบน
              </div>
            )}
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 mb-1 block">LINE User ID / Group ID</label>
            <Input
              data-testid="input-line-to"
              value={to}
              onChange={e => setTo(e.target.value)}
              placeholder="U... หรือ C..."
              className="text-sm"
            />
            <p className="text-[10px] text-slate-400 mt-1">เลือกจากรายการด้านบน หรือใส่ ID ใหม่ได้โดยตรง</p>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 mb-1 block">ข้อความ</label>
            <Textarea
              data-testid="input-line-message"
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder={defaultMessage}
              rows={5}
              className="text-sm"
            />
            <p className="text-[10px] text-slate-400 mt-1">ถ้าเว้นว่างจะใช้ข้อความเริ่มต้น</p>
          </div>
          <Button
            data-testid="button-line-send"
            onClick={handleSend}
            disabled={sending}
            className="w-full"
          >
            <Send className="h-4 w-4 mr-2" />
            {sending ? "กำลังส่ง..." : "ส่งผ่าน LINE"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
