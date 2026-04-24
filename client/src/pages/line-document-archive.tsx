import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo, useEffect, useRef } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { FileArchive, Plus, Trash2, Download, Search, Image, FileText, Film, Music, File, Settings, MessageCircle, Loader2, Eye, ArrowLeft, Building2, Calendar, Sparkles, PackageOpen, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { useCompany } from "@/lib/company-context";
import Layout from "@/components/layout";

export default function LineDocumentArchive() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const { selectedCompanyId } = useCompany();

  const urlParams = new URLSearchParams(window.location.search);
  const urlFirmClientId = urlParams.get("firmClientId");
  const urlClientName = urlParams.get("name") ? decodeURIComponent(urlParams.get("name")!) : null;

  const [showGroupDialog, setShowGroupDialog] = useState(false);
  const [groupForm, setGroupForm] = useState({ lineGroupId: "", groupName: "", firmClientId: urlFirmClientId || "" });
  const [claimSearch, setClaimSearch] = useState<Record<number, string>>({});
  const [claimDropdownOpen, setClaimDropdownOpen] = useState<Record<number, boolean>>({});
  const pendingRef = useRef<HTMLDivElement>(null);
  const [filterCategory, setFilterCategory] = useState("all");

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (pendingRef.current && !pendingRef.current.contains(e.target as Node)) {
        setClaimDropdownOpen({});
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);
  const [filterGroupId, setFilterGroupId] = useState("all");
  const [filterFirmClientId, setFilterFirmClientId] = useState(urlFirmClientId || "all");
  const [searchText, setSearchText] = useState("");
  const [filterDocMonth, setFilterDocMonth] = useState("all");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [isDownloadingZip, setIsDownloadingZip] = useState(false);

  const { data: groups = [] } = useQuery<any[]>({
    queryKey: ["/api/line-documents/groups"],
    queryFn: async () => {
      const r = await fetch(`/api/line-documents/groups`, { credentials: "include" });
      if (!r.ok) return [];
      return r.json();
    },
  });

  const { data: documents = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/line-documents", filterCategory, filterGroupId, filterFirmClientId, selectedCompanyId],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filterCategory !== "all") params.set("category", filterCategory);
      if (filterGroupId !== "all") params.set("lineGroupId", filterGroupId);
      if (filterFirmClientId !== "all") params.set("firmClientId", filterFirmClientId);
      if (selectedCompanyId) params.set("companyId", String(selectedCompanyId));
      const r = await fetch(`/api/line-documents?${params}`, { credentials: "include" });
      if (!r.ok) return [];
      return r.json();
    },
  });

  const { data: firmClients = [] } = useQuery<any[]>({
    queryKey: ["/api/firm-clients"],
    queryFn: async () => {
      const r = await fetch("/api/firm-clients", { credentials: "include" });
      if (!r.ok) return [];
      return r.json();
    },
  });

  const { data: pendingGroups = [] } = useQuery<any[]>({
    queryKey: ["/api/line-documents/groups/pending"],
    queryFn: async () => {
      const r = await fetch("/api/line-documents/groups/pending", { credentials: "include" });
      if (!r.ok) return [];
      return r.json();
    },
  });

  const { data: availableGroups = [] } = useQuery<any[]>({
    queryKey: ["/api/line-documents/available-groups"],
    queryFn: async () => {
      const r = await fetch("/api/line-documents/available-groups", { credentials: "include" });
      if (!r.ok) return [];
      return r.json();
    },
  });

  const [clientSearch, setClientSearch] = useState("");
  const [claimClientId, setClaimClientId] = useState<Record<number, string>>({});

  const createGroupMutation = useMutation({
    mutationFn: async (data: any) => {
      const r = await apiRequest("POST", "/api/line-documents/groups", data);
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "เพิ่มกลุ่มสำเร็จ" });
      setShowGroupDialog(false);
      setGroupForm({ lineGroupId: "", groupName: "", firmClientId: "" });
      queryClient.invalidateQueries({ queryKey: ["/api/line-documents/groups"] });
    },
    onError: (err: any) => {
      toast({ title: "เกิดข้อผิดพลาด", description: err.message, variant: "destructive" });
    },
  });

  const toggleGroupMutation = useMutation({
    mutationFn: async ({ id, active }: { id: number; active: boolean }) => {
      const r = await apiRequest("PATCH", `/api/line-documents/groups/${id}`, { active });
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/line-documents/groups"] });
    },
  });

  const deleteGroupMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await apiRequest("DELETE", `/api/line-documents/groups/${id}`);
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "ลบกลุ่มสำเร็จ" });
      queryClient.invalidateQueries({ queryKey: ["/api/line-documents/groups"] });
    },
  });

  const claimGroupMutation = useMutation({
    mutationFn: async ({ id, firmClientId }: { id: number; firmClientId: string }) => {
      const r = await apiRequest("POST", `/api/line-documents/groups/${id}/claim`, {
        firmClientId: firmClientId && firmClientId !== "none" ? Number(firmClientId) : null,
      });
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "เชื่อมโยงกลุ่มสำเร็จ", description: "กลุ่ม LINE ถูกเชื่อมโยงกับระบบแล้ว" });
      queryClient.invalidateQueries({ queryKey: ["/api/line-documents/groups"] });
      queryClient.invalidateQueries({ queryKey: ["/api/line-documents/groups/pending"] });
    },
    onError: (err: any) => {
      toast({ title: "เกิดข้อผิดพลาด", description: err.message, variant: "destructive" });
    },
  });

  const deleteDocMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await apiRequest("DELETE", `/api/line-documents/${id}`);
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "ลบเอกสารสำเร็จ" });
      queryClient.invalidateQueries({ queryKey: ["/api/line-documents"] });
    },
  });

  const extractDateMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await apiRequest("POST", `/api/line-documents/${id}/extract-date`);
      return r.json();
    },
    onSuccess: (data: any) => {
      toast({ title: data.documentDate ? `พบวันที่เอกสาร: ${formatDocDate(data.documentDate)}` : "ไม่พบวันที่ในเอกสาร" });
      queryClient.invalidateQueries({ queryKey: ["/api/line-documents"] });
    },
    onError: (err: any) => {
      toast({ title: "เกิดข้อผิดพลาด", description: err.message, variant: "destructive" });
    },
  });

  const docMonths = useMemo(() => {
    const months = new Set<string>();
    documents.forEach((d: any) => {
      if (d.documentDate) {
        months.add(d.documentDate.substring(0, 7));
      }
      if (d.sentAt) {
        const sent = new Date(d.sentAt);
        if (!isNaN(sent.getTime())) {
          months.add(`${sent.getFullYear()}-${(sent.getMonth() + 1).toString().padStart(2, "0")}`);
        }
      }
    });
    return Array.from(months).sort().reverse();
  }, [documents]);

  const filteredDocs = useMemo(() => {
    let filtered = documents;
    if (filterDocMonth !== "all") {
      filtered = filtered.filter((d: any) => {
        if (d.documentDate?.startsWith(filterDocMonth)) return true;
        if (d.sentAt) {
          const sent = new Date(d.sentAt);
          if (!isNaN(sent.getTime())) {
            const sentMonth = `${sent.getFullYear()}-${(sent.getMonth() + 1).toString().padStart(2, "0")}`;
            return sentMonth === filterDocMonth;
          }
        }
        return false;
      });
    }
    if (searchText) {
      const s = searchText.toLowerCase();
      filtered = filtered.filter((d: any) =>
        d.originalFilename?.toLowerCase().includes(s) ||
        d.senderName?.toLowerCase().includes(s) ||
        d.category?.toLowerCase().includes(s)
      );
    }
    return filtered;
  }, [documents, searchText, filterDocMonth]);

  const getCategoryIcon = (cat: string) => {
    switch (cat) {
      case "image": return <Image className="w-4 h-4 text-blue-500" />;
      case "document": return <FileText className="w-4 h-4 text-red-500" />;
      case "video": return <Film className="w-4 h-4 text-purple-500" />;
      case "audio": return <Music className="w-4 h-4 text-green-500" />;
      default: return <File className="w-4 h-4 text-gray-500" />;
    }
  };

  const getCategoryLabel = (cat: string) => {
    switch (cat) {
      case "image": return "รูปภาพ";
      case "document": return "เอกสาร";
      case "video": return "วิดีโอ";
      case "audio": return "เสียง";
      case "file": return "ไฟล์";
      default: return "อื่นๆ";
    }
  };

  const formatFileSize = (bytes: number) => {
    if (!bytes) return "-";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDocDate = (dateStr: string | null) => {
    if (!dateStr) return "-";
    const parts = dateStr.split("-");
    if (parts.length !== 3) return dateStr;
    const year = parseInt(parts[0]) + 543;
    return `${parts[2]}/${parts[1]}/${year}`;
  };

  const formatMonthLabel = (ym: string) => {
    const thMonths = ["", "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
    const [y, m] = ym.split("-");
    return `${thMonths[parseInt(m)]} ${parseInt(y) + 543}`;
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return "-";
    const d = new Date(dateStr);
    const day = d.getDate().toString().padStart(2, "0");
    const month = (d.getMonth() + 1).toString().padStart(2, "0");
    const year = d.getFullYear() + 543;
    const time = d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
    return `${day}/${month}/${year} ${time}`;
  };

  const stats = useMemo(() => {
    const total = documents.length;
    const images = documents.filter((d: any) => d.category === "image").length;
    const docs = documents.filter((d: any) => d.category === "document").length;
    const others = total - images - docs;
    const totalSize = documents.reduce((sum: number, d: any) => sum + (d.fileSize || 0), 0);
    return { total, images, docs, others, totalSize };
  }, [documents]);

  const getGroupName = (groupId: string) => {
    const g = groups.find((g: any) => g.lineGroupId === groupId);
    return g?.groupName || groupId;
  };

  const getClientName = (id: number) => {
    const fc = firmClients.find((c: any) => c.id === id);
    return fc?.name || "";
  };

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredDocs.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredDocs.map((d: any) => d.id)));
    }
  };

  const handleBatchDownload = async () => {
    if (selectedIds.size === 0) return;
    setIsDownloadingZip(true);
    try {
      const res = await fetch("/api/line-documents/batch-download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "เกิดข้อผิดพลาด" }));
        toast({ title: "ดาวน์โหลดไม่สำเร็จ", description: err.message, variant: "destructive" });
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `line-documents-${new Date().toISOString().slice(0, 10)}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "ดาวน์โหลดสำเร็จ", description: `${selectedIds.size} ไฟล์ถูกรวมเป็น ZIP แล้ว` });
    } catch (err: any) {
      toast({ title: "เกิดข้อผิดพลาด", description: err.message, variant: "destructive" });
    } finally {
      setIsDownloadingZip(false);
    }
  };

  return (
    <Layout>
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate(urlFirmClientId ? "/firm-mgmt/clients" : "/")} data-testid="button-back">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <Settings className="w-7 h-7 text-[#05b187]" />
          <div>
            <h1 className="text-xl font-bold text-gray-800">
              ตั้งค่ากลุ่ม LINE
            </h1>
            <p className="text-sm text-gray-500">
              จัดการกลุ่ม LINE ที่เชื่อมโยงกับลูกค้าสำนักงานบัญชี
            </p>
          </div>
          {groups.length > 0 && (
            <Badge className="bg-[#05b187] text-white ml-2">{groups.length} กลุ่มเชื่อมโยงแล้ว</Badge>
          )}
          {pendingGroups.length > 0 && (
            <Badge className="bg-yellow-500 text-white ml-2">{pendingGroups.length} กลุ่มใหม่รออนุมัติ</Badge>
          )}
        </div>
      </div>

      {false && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="bg-blue-50 border-blue-200">
              <CardContent className="p-3 text-center">
                <div className="text-2xl font-bold text-blue-700">{stats.total}</div>
                <div className="text-xs text-blue-600">ทั้งหมด</div>
              </CardContent>
            </Card>
            <Card className="bg-green-50 border-green-200">
              <CardContent className="p-3 text-center">
                <div className="text-2xl font-bold text-green-700">{stats.images}</div>
                <div className="text-xs text-green-600">รูปภาพ</div>
              </CardContent>
            </Card>
            <Card className="bg-red-50 border-red-200">
              <CardContent className="p-3 text-center">
                <div className="text-2xl font-bold text-red-700">{stats.docs}</div>
                <div className="text-xs text-red-600">เอกสาร</div>
              </CardContent>
            </Card>
            <Card className="bg-purple-50 border-purple-200">
              <CardContent className="p-3 text-center">
                <div className="text-2xl font-bold text-purple-700">{formatFileSize(stats.totalSize)}</div>
                <div className="text-xs text-purple-600">ขนาดรวม</div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardContent className="p-4">
              <div className="flex flex-wrap gap-3 items-end">
                <div className="flex-1 min-w-[200px]">
                  <Label className="text-xs text-gray-500">ค้นหา</Label>
                  <div className="relative">
                    <Search className="absolute left-2 top-2.5 w-4 h-4 text-gray-400" />
                    <Input
                      placeholder="ชื่อไฟล์, ผู้ส่ง..."
                      value={searchText}
                      onChange={e => setSearchText(e.target.value)}
                      className="pl-8"
                      data-testid="input-search-documents"
                    />
                  </div>
                </div>
                <div className="min-w-[150px]">
                  <Label className="text-xs text-gray-500">ประเภท</Label>
                  <Select value={filterCategory} onValueChange={setFilterCategory}>
                    <SelectTrigger data-testid="select-category-filter">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">ทั้งหมด</SelectItem>
                      <SelectItem value="image">รูปภาพ</SelectItem>
                      <SelectItem value="document">เอกสาร</SelectItem>
                      <SelectItem value="video">วิดีโอ</SelectItem>
                      <SelectItem value="audio">เสียง</SelectItem>
                      <SelectItem value="file">ไฟล์</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="min-w-[200px]">
                  <Label className="text-xs text-gray-500">กลุ่ม LINE</Label>
                  <Select value={filterGroupId} onValueChange={setFilterGroupId}>
                    <SelectTrigger data-testid="select-group-filter">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">ทุกกลุ่ม</SelectItem>
                      {groups.map((g: any) => (
                        <SelectItem key={g.lineGroupId} value={g.lineGroupId}>{g.groupName || g.lineGroupId}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="min-w-[150px]">
                  <Label className="text-xs text-gray-500">เดือนเอกสาร</Label>
                  <Select value={filterDocMonth} onValueChange={setFilterDocMonth}>
                    <SelectTrigger data-testid="select-doc-month-filter">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">ทุกเดือน</SelectItem>
                      {docMonths.map(m => (
                        <SelectItem key={m} value={m}>{formatMonthLabel(m)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {!urlFirmClientId && (
                  <div className="min-w-[200px]">
                    <Label className="text-xs text-gray-500">ลูกค้า</Label>
                    <Select value={filterFirmClientId} onValueChange={setFilterFirmClientId}>
                      <SelectTrigger data-testid="select-firm-client-filter">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">ทุกราย</SelectItem>
                        {firmClients.map((fc: any) => (
                          <SelectItem key={fc.id} value={String(fc.id)}>{fc.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                </div>
              ) : filteredDocs.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <FileArchive className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>ยังไม่มีเอกสาร</p>
                  <p className="text-xs mt-1">เอกสารจะถูกบันทึกอัตโนมัติเมื่อมีคนส่งไฟล์ในกลุ่ม LINE ที่เชื่อมโยง</p>
                </div>
              ) : (
                <>
                {selectedIds.size > 0 && (
                  <div className="flex items-center gap-3 px-4 py-2 bg-blue-50 border-b border-blue-200">
                    <span className="text-sm font-medium text-blue-700">เลือกแล้ว {selectedIds.size} รายการ</span>
                    <Button
                      size="sm"
                      className="h-7 text-xs bg-[#05b187] hover:bg-[#049a76]"
                      onClick={handleBatchDownload}
                      disabled={isDownloadingZip}
                      data-testid="button-batch-download"
                    >
                      {isDownloadingZip ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <PackageOpen className="w-3 h-3 mr-1" />}
                      ดาวน์โหลด ZIP
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-gray-500"
                      onClick={() => setSelectedIds(new Set())}
                      data-testid="button-clear-selection"
                    >
                      ยกเลิกเลือก
                    </Button>
                  </div>
                )}
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[40px]">
                        <Checkbox
                          checked={filteredDocs.length > 0 && selectedIds.size === filteredDocs.length}
                          onCheckedChange={toggleSelectAll}
                          data-testid="checkbox-select-all"
                        />
                      </TableHead>
                      <TableHead className="w-[40px]">#</TableHead>
                      <TableHead>ไฟล์</TableHead>
                      <TableHead>ประเภท</TableHead>
                      <TableHead>กลุ่ม</TableHead>
                      {!urlFirmClientId && <TableHead>ลูกค้า</TableHead>}
                      <TableHead>ผู้ส่ง</TableHead>
                      <TableHead>ขนาด</TableHead>
                      <TableHead>วันที่เอกสาร</TableHead>
                      <TableHead>วันที่ส่ง</TableHead>
                      <TableHead className="w-[120px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredDocs.map((doc: any, idx: number) => (
                      <TableRow key={doc.id} data-testid={`row-document-${doc.id}`}>
                        <TableCell>
                          <Checkbox
                            checked={selectedIds.has(doc.id)}
                            onCheckedChange={() => toggleSelect(doc.id)}
                            data-testid={`checkbox-select-${doc.id}`}
                          />
                        </TableCell>
                        <TableCell className="text-gray-400 text-sm">{idx + 1}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {getCategoryIcon(doc.category)}
                            <span className="text-sm font-medium truncate max-w-[200px]" title={doc.originalFilename}>
                              {doc.originalFilename || "ไม่ทราบชื่อ"}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">{getCategoryLabel(doc.category)}</Badge>
                        </TableCell>
                        <TableCell className="text-sm text-gray-600">{getGroupName(doc.lineGroupId)}</TableCell>
                        {!urlFirmClientId && (
                          <TableCell className="text-sm">
                            {doc.firmClientId ? (
                              <Badge variant="outline" className="text-xs" style={{ borderColor: "#03c9d7", color: "#03c9d7" }}>
                                <Building2 className="w-3 h-3 mr-1" />
                                {getClientName(doc.firmClientId)}
                              </Badge>
                            ) : "-"}
                          </TableCell>
                        )}
                        <TableCell className="text-sm">{doc.senderName || "-"}</TableCell>
                        <TableCell className="text-sm text-gray-500">{formatFileSize(doc.fileSize)}</TableCell>
                        <TableCell className="text-sm">
                          {doc.documentDate ? (
                            <div className="flex items-center gap-1">
                              <Calendar className="w-3 h-3 text-green-500" />
                              <span className="text-green-700 font-medium">{formatDocDate(doc.documentDate)}</span>
                            </div>
                          ) : (
                            (doc.category === "image" || doc.category === "document") ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 text-xs text-amber-600 hover:text-amber-800 px-1"
                                onClick={() => extractDateMutation.mutate(doc.id)}
                                disabled={extractDateMutation.isPending}
                                data-testid={`button-extract-date-${doc.id}`}
                              >
                                <Sparkles className="w-3 h-3 mr-1" />
                                AI อ่านวันที่
                              </Button>
                            ) : <span className="text-gray-400">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-gray-500">{formatDate(doc.sentAt)}</TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {(doc.category === "image" || doc.category === "document") && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => window.open(`/api/line-documents/${doc.id}/download`, "_blank")}
                                data-testid={`button-view-${doc.id}`}
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => {
                                const a = document.createElement("a");
                                a.href = `/api/line-documents/${doc.id}/download`;
                                a.download = doc.originalFilename || "file";
                                a.click();
                              }}
                              data-testid={`button-download-${doc.id}`}
                            >
                              <Download className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-red-500 hover:text-red-700"
                              onClick={() => { if (confirm("ลบเอกสารนี้?")) deleteDocMutation.mutate(doc.id); }}
                              data-testid={`button-delete-doc-${doc.id}`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                </>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {true && (
        <>
        {pendingGroups.length > 0 && (
          <Card className="border-2 border-yellow-300 bg-yellow-50" ref={pendingRef}>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse" />
                <CardTitle className="text-base text-yellow-800">กลุ่มใหม่ที่รอเชื่อมโยง ({pendingGroups.length})</CardTitle>
              </div>
              <p className="text-xs text-yellow-600 mt-1">Bot ถูกเชิญเข้ากลุ่มเหล่านี้แล้ว กรุณาเลือกลูกค้าที่ต้องการเชื่อมโยง</p>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {pendingGroups.map((g: any) => {
                  const searchTerm = (claimSearch[g.id] || "").toLowerCase();
                  const filteredClients = searchTerm
                    ? firmClients.filter((fc: any) => fc.name?.toLowerCase().includes(searchTerm) || fc.taxId?.includes(searchTerm))
                    : firmClients;
                  const isOpen = claimDropdownOpen[g.id] || false;
                  const selectedClient = claimClientId[g.id] ? firmClients.find((fc: any) => String(fc.id) === claimClientId[g.id]) : null;

                  return (
                    <div key={g.id} className="p-4 border border-yellow-200 rounded-lg bg-white space-y-3" data-testid={`pending-group-${g.id}`}>
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full flex items-center justify-center bg-yellow-100 flex-shrink-0">
                          <MessageCircle className="w-5 h-5 text-yellow-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm">{g.groupName || "กลุ่มไม่มีชื่อ"}</div>
                          <div className="text-xs text-gray-400 font-mono truncate">{g.lineGroupId}</div>
                          <div className="text-xs text-yellow-600 mt-0.5">รอเชื่อมโยงกับลูกค้า</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="relative flex-1">
                          <Input
                            placeholder={selectedClient ? selectedClient.name : "พิมพ์ค้นหาลูกค้า..."}
                            value={claimSearch[g.id] || ""}
                            onChange={e => {
                              setClaimSearch(prev => ({ ...prev, [g.id]: e.target.value }));
                              setClaimDropdownOpen(prev => ({ ...prev, [g.id]: true }));
                            }}
                            onFocus={() => setClaimDropdownOpen(prev => ({ ...prev, [g.id]: true }))}
                            className={`h-8 text-sm ${selectedClient ? "border-green-300 bg-green-50" : ""}`}
                            data-testid={`search-claim-client-${g.id}`}
                          />
                          {selectedClient && !claimSearch[g.id] && (
                            <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                              <span className="text-sm text-green-700 font-medium">{selectedClient.name}</span>
                            </div>
                          )}
                          {isOpen && (
                            <div className="absolute z-50 mt-1 w-full max-h-48 overflow-y-auto bg-white border rounded-md shadow-lg">
                              <button
                                className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 text-gray-500"
                                onClick={() => {
                                  setClaimClientId(prev => ({ ...prev, [g.id]: "none" }));
                                  setClaimSearch(prev => ({ ...prev, [g.id]: "" }));
                                  setClaimDropdownOpen(prev => ({ ...prev, [g.id]: false }));
                                }}
                                data-testid={`claim-option-none-${g.id}`}
                              >
                                ไม่ระบุลูกค้า
                              </button>
                              {filteredClients.map((fc: any) => (
                                <button
                                  key={fc.id}
                                  className="w-full text-left px-3 py-2 text-sm hover:bg-[#fb9678]/10 border-t border-gray-50"
                                  onClick={() => {
                                    setClaimClientId(prev => ({ ...prev, [g.id]: String(fc.id) }));
                                    setClaimSearch(prev => ({ ...prev, [g.id]: "" }));
                                    setClaimDropdownOpen(prev => ({ ...prev, [g.id]: false }));
                                  }}
                                  data-testid={`claim-option-${fc.id}-${g.id}`}
                                >
                                  <div className="font-medium">{fc.name}</div>
                                  {fc.taxId && <div className="text-xs text-gray-400">{fc.taxId}</div>}
                                </button>
                              ))}
                              {filteredClients.length === 0 && (
                                <div className="px-3 py-2 text-sm text-gray-400">ไม่พบลูกค้าที่ตรงกัน</div>
                              )}
                            </div>
                          )}
                        </div>
                        <Button
                          size="sm"
                          className="bg-[#05b187] hover:bg-[#049a76] h-8 text-xs"
                          onClick={() => claimGroupMutation.mutate({ id: g.id, firmClientId: claimClientId[g.id] || "" })}
                          disabled={claimGroupMutation.isPending}
                          data-testid={`button-claim-${g.id}`}
                        >
                          {claimGroupMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "เชื่อมโยง"}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                กลุ่ม LINE ที่เชื่อมโยง
                {groups.length > 0 && (
                  <span className="text-sm font-normal text-[#05b187] bg-[#05b187]/10 px-2 py-0.5 rounded-full">{groups.length} กลุ่ม</span>
                )}
              </CardTitle>
              <Dialog open={showGroupDialog} onOpenChange={setShowGroupDialog}>
                <DialogTrigger asChild>
                  <Button size="sm" className="bg-[#05b187] hover:bg-[#049a76]" data-testid="button-add-group">
                    <Plus className="w-4 h-4 mr-1" /> เพิ่มกลุ่ม
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>เชื่อมโยงกลุ่ม LINE</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 mt-2">
                    <div>
                      <Label>เลือกกลุ่ม LINE *</Label>
                      {availableGroups && availableGroups.length > 0 ? (
                        <>
                          <Select
                            value={groupForm.lineGroupId}
                            onValueChange={v => {
                              const grp = availableGroups.find((g: any) => g.lineId === v);
                              setGroupForm(f => ({ ...f, lineGroupId: v, groupName: grp?.displayName || "" }));
                            }}
                          >
                            <SelectTrigger data-testid="select-group-id">
                              <SelectValue placeholder="เลือกกลุ่ม LINE..." />
                            </SelectTrigger>
                            <SelectContent>
                              {availableGroups.map((g: any) => (
                                <SelectItem key={g.lineId} value={g.lineId}>
                                  {g.displayName || g.lineId}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <p className="text-xs text-gray-400 mt-1">แสดงกลุ่มที่ Bot เข้าร่วมแล้ว — ถ้ายังไม่เห็นกลุ่ม ให้เชิญ Bot เข้ากลุ่มก่อน</p>
                        </>
                      ) : (
                        <div className="p-3 bg-amber-50 border border-amber-200 rounded text-sm text-amber-700">
                          ยังไม่มีกลุ่มที่ Bot เข้าร่วม — เชิญ Bot เข้ากลุ่ม LINE ก่อน แล้วกลุ่มจะปรากฏที่นี่
                        </div>
                      )}
                    </div>
                    <div>
                      <Label>ชื่อกลุ่ม</Label>
                      <Input
                        value={groupForm.groupName}
                        onChange={e => setGroupForm(f => ({ ...f, groupName: e.target.value }))}
                        placeholder="กลุ่มลูกค้า ABC"
                        data-testid="input-group-name"
                      />
                      <p className="text-xs text-gray-400 mt-1">ดึงอัตโนมัติจาก LINE — แก้ไขได้ถ้าต้องการ</p>
                    </div>
                    <div>
                      <Label>เชื่อมกับลูกค้า (ไม่บังคับ)</Label>
                      <Select
                        value={groupForm.firmClientId}
                        onValueChange={v => { setGroupForm(f => ({ ...f, firmClientId: v })); setClientSearch(""); }}
                      >
                        <SelectTrigger data-testid="select-firm-client">
                          <SelectValue placeholder="เลือกลูกค้า..." />
                        </SelectTrigger>
                        <SelectContent>
                          <div className="px-2 pb-2 sticky top-0 bg-white z-10">
                            <Input
                              placeholder="ค้นหาชื่อลูกค้า..."
                              value={clientSearch}
                              onChange={e => setClientSearch(e.target.value)}
                              className="h-8 text-sm"
                              data-testid="input-search-client"
                              onKeyDown={e => e.stopPropagation()}
                            />
                          </div>
                          <SelectItem value="none">ไม่ระบุ</SelectItem>
                          <SelectItem value="self">🏢 สำนักงานของเรา</SelectItem>
                          {firmClients
                            .filter((fc: any) => !clientSearch || fc.name?.toLowerCase().includes(clientSearch.toLowerCase()))
                            .map((fc: any) => (
                              <SelectItem key={fc.id} value={String(fc.id)}>{fc.name}</SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-gray-400 mt-1">เลือก "สำนักงานของเรา" สำหรับเอกสารของอีแท็กเอง</p>
                    </div>
                    <Button
                      onClick={() => {
                        createGroupMutation.mutate({
                          lineGroupId: groupForm.lineGroupId,
                          groupName: groupForm.groupName || null,
                          firmClientId: groupForm.firmClientId && groupForm.firmClientId !== "none" && groupForm.firmClientId !== "self" ? Number(groupForm.firmClientId) : null,
                          isSelf: groupForm.firmClientId === "self" ? true : undefined,
                        });
                      }}
                      disabled={!groupForm.lineGroupId || createGroupMutation.isPending}
                      className="w-full bg-[#05b187] hover:bg-[#049a76]"
                      data-testid="button-save-group"
                    >
                      {createGroupMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <MessageCircle className="w-4 h-4 mr-1" />}
                      บันทึก
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </CardHeader>
          <CardContent>
            {(() => {
              const filteredGroups = urlFirmClientId
                ? groups.filter((g: any) => g.firmClientId === Number(urlFirmClientId))
                : groups;
              return filteredGroups.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <MessageCircle className="w-10 h-10 mx-auto mb-2 opacity-50" />
                <p>ยังไม่มีกลุ่มที่เชื่อมโยง{urlClientName ? ` สำหรับ ${urlClientName}` : ""}</p>
                <p className="text-xs mt-1">เพิ่มกลุ่ม LINE เพื่อเริ่มบันทึกเอกสารอัตโนมัติ</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredGroups.map((g: any) => {
                  const client = firmClients.find((fc: any) => fc.id === g.firmClientId);
                  return (
                    <div key={g.id} className="flex items-center justify-between p-3 border rounded-lg" data-testid={`group-item-${g.id}`}>
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${g.active ? "bg-green-100" : "bg-gray-100"}`}>
                          <MessageCircle className={`w-5 h-5 ${g.active ? "text-green-600" : "text-gray-400"}`} />
                        </div>
                        <div>
                          <div className="font-medium text-sm">{g.groupName || "กลุ่มไม่มีชื่อ"}</div>
                          <div className="text-xs text-gray-400 font-mono">{g.lineGroupId}</div>
                          {client ? (
                            <Badge variant="outline" className="text-xs mt-1">{client.name}</Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs mt-1 border-blue-200 text-blue-600">🏢 สำนักงานของเรา</Badge>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-500">{g.active ? "เปิด" : "ปิด"}</span>
                          <Switch
                            checked={g.active}
                            onCheckedChange={(checked) => toggleGroupMutation.mutate({ id: g.id, active: checked })}
                            data-testid={`switch-active-${g.id}`}
                          />
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-red-500"
                          onClick={() => { if (confirm("ลบการเชื่อมโยงกลุ่มนี้?")) deleteGroupMutation.mutate(g.id); }}
                          data-testid={`button-delete-group-${g.id}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
            })()}

            <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
              <h4 className="font-medium text-sm text-blue-800 mb-2">วิธีใช้งาน</h4>
              <ol className="text-xs text-blue-700 space-y-1 list-decimal pl-4">
                <li>เชิญ LINE Bot เข้ากลุ่มที่ต้องการบันทึกเอกสาร</li>
                <li>เมื่อ Bot เข้ากลุ่ม ระบบจะจับ Group ID อัตโนมัติ และแสดงเป็น "กลุ่มรอเชื่อมโยง" ด้านบน</li>
                <li>เลือกลูกค้าที่ต้องการเชื่อมโยง แล้วกด "เชื่อมโยง" เพื่อเปิดใช้งาน</li>
                <li>เมื่อมีคนส่งรูป ไฟล์ วิดีโอ หรือเสียงในกลุ่ม ระบบจะบันทึกอัตโนมัติ</li>
                <li>เอกสารจะถูกเก็บอย่างถาวร ไม่หมดอายุเหมือนใน LINE</li>
              </ol>
            </div>
          </CardContent>
        </Card>
        </>
      )}
    </div>
    </Layout>
  );
}
