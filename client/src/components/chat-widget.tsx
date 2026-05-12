import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MessageCircle, X, Send, Loader2, Bot, ChevronUp, Phone, CircleHelp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth";
import { formatDate as formatDateShared } from "@/lib/format";
import { useLocation } from "wouter";

interface ChatMessage {
  id: number;
  tenantId: number | null;
  senderId: number;
  senderName: string;
  senderRole: string;
  body: string;
  readAt: string | null;
  createdAt: string;
}

function formatTime(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return "วันนี้";
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "เมื่อวาน";
  return formatDateShared(d.toISOString(), "CE");
}

function ContactIcons() {
  return (
    <>
      <a href="https://www.facebook.com/etaxcenter" target="_blank" rel="noopener noreferrer" className="w-11 h-11 flex items-center justify-center bg-[#1877F2] text-white rounded-full shadow-lg hover:scale-110 hover:shadow-xl transition-all" data-testid="contact-facebook" title="Facebook">
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
      </a>
      <a href="https://line.me/ti/p/@etaxcenter" target="_blank" rel="noopener noreferrer" className="w-11 h-11 flex items-center justify-center bg-[#06C755] text-white rounded-full shadow-lg hover:scale-110 hover:shadow-xl transition-all" data-testid="contact-line" title="LINE">
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314"/></svg>
      </a>
      <a href="tel:+6621234567" className="w-11 h-11 flex items-center justify-center bg-[#fec90f] text-white rounded-full shadow-lg hover:scale-110 hover:shadow-xl transition-all" data-testid="contact-phone" title="โทรหาเรา">
        <Phone className="w-5 h-5" />
      </a>
    </>
  );
}

function ScrollToTopButton() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > 400);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  if (!show) return null;
  return (
    <button
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      className="w-10 h-10 rounded-full text-white shadow-lg hover:shadow-xl hover:scale-110 transition-all flex items-center justify-center opacity-90 hover:opacity-100"
      style={{ background: "#fb9678" }}
      data-testid="btn-scroll-to-top"
      title="กลับไปด้านบน"
    >
      <ChevronUp className="w-5 h-5" />
    </button>
  );
}

export default function ChatWidget() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [pastHero, setPastHero] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    const onScroll = () => setPastHero(window.scrollY > window.innerHeight * 0.6);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const [location] = useLocation();
  const pathname = location;
  const isPublicPage = pathname === "/" || pathname === "/landing" || pathname === "/about" || pathname === "/register" || pathname === "/login" || pathname.startsWith("/pricing") || pathname.startsWith("/ecommerce-pricing") || pathname.startsWith("/food-delivery-pricing") || pathname.startsWith("/accounting-pricing");
  const isLanding = pathname === "/" || pathname === "/landing";
  const isPosTerminal = pathname === "/pos/terminal" || pathname === "/restaurant-pos";
  const isDashboard = pathname === "/dashboard" || pathname.startsWith("/dashboard/");
  const isSysAdmin = pathname.startsWith("/sys-k7x9");
  const showButtons = user
    ? (isDashboard && !isPosTerminal)
    : (isLanding ? pastHero : !isPosTerminal);
  const showContactIcons = isPublicPage && (!isLanding || pastHero);
  const showChatButton = user ? isDashboard : (!isLanding || pastHero);

  const { data: messages = [] } = useQuery<ChatMessage[]>({
    queryKey: ["/api/chat/messages"],
    queryFn: async () => {
      const res = await fetch("/api/chat/messages", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    refetchInterval: open ? 8000 : false,
    enabled: !!user && open,
    staleTime: 5000,
  });

  const { data: unreadData } = useQuery<{ count: number }>({
    queryKey: ["/api/chat/unread-count"],
    queryFn: async () => {
      const res = await fetch("/api/chat/unread-count", { credentials: "include" });
      if (!res.ok) return { count: 0 };
      return res.json();
    },
    refetchInterval: false,
    enabled: !!user,
    staleTime: 120000,
  });

  const [aiTyping, setAiTyping] = useState(false);
  const aiTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    return () => {
      aiTimersRef.current.forEach(clearTimeout);
    };
  }, []);

  const sendMutation = useMutation({
    mutationFn: async (body: string) => {
      const res = await fetch("/api/chat/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ body }),
      });
      if (!res.ok) throw new Error("Failed to send");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/chat/messages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/chat/unread-count"] });
      aiTimersRef.current.forEach(clearTimeout);
      aiTimersRef.current = [];
      setAiTyping(true);
      aiTimersRef.current.push(setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["/api/chat/messages"] });
        setAiTyping(false);
      }, 5000));
      aiTimersRef.current.push(setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["/api/chat/messages"] });
      }, 10000));
    },
  });

  const markReadMutation = useMutation({
    mutationFn: async () => {
      await fetch("/api/chat/messages/read", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({}),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/chat/unread-count"] });
    },
  });

  useEffect(() => {
    if (open) {
      queryClient.invalidateQueries({ queryKey: ["/api/chat/messages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/chat/unread-count"] });
    }
  }, [open]);

  useEffect(() => {
    if (open && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [open, messages]);

  const currentUnread = unreadData?.count || 0;
  useEffect(() => {
    if (open && currentUnread > 0) {
      markReadMutation.mutate();
    }
  }, [open, currentUnread]);

  const handleSend = () => {
    if (!message.trim()) return;
    sendMutation.mutate(message.trim());
    setMessage("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const unreadCount = unreadData?.count || 0;

  if (isSysAdmin) return null;

  let lastDate = "";

  return (
    <div className={`fixed bottom-4 right-4 z-40 print:!hidden flex flex-col items-center gap-3 transition-all duration-500 ${showButtons ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8 pointer-events-none"}`}>
      {showContactIcons && <ContactIcons />}
      {open && (
        <div
          data-testid="chat-panel"
          className="mb-3 w-80 sm:w-96 bg-white rounded-xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden"
          style={{ height: "min(480px, calc(100vh - 120px))" }}
        >
          <div className="text-white px-4 py-3 flex items-center justify-between flex-shrink-0" style={{ background: "#03c9d7" }}>
            <div className="flex items-center gap-2">
              <Bot className="w-5 h-5" />
              <div>
                <div className="font-semibold text-sm">AI ผู้ช่วยการใช้งาน</div>
                <div className="text-[10px] opacity-80">ถามได้เลย ตอบทันที 24 ชม.</div>
              </div>
            </div>
            <button
              data-testid="button-close-chat"
              onClick={() => setOpen(false)}
              className="p-1 hover:bg-white/20 rounded"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1 bg-slate-50">
            {messages.length === 0 && (
              <div className="text-center text-xs text-slate-500 py-4">
                <Bot className="h-10 w-10 mx-auto mb-2 text-[#03c9d7]" />
                <div className="font-medium text-slate-700 mb-1">สวัสดีค่ะ! ฉันคือ AI ผู้ช่วย</div>
                <div className="mb-3">ถามเกี่ยวกับการใช้งานระบบได้เลยค่ะ</div>
                <div className="flex flex-col gap-1.5 px-2">
                  {[
                    { id: "tax-invoice", text: "ออกใบกำกับภาษียังไง?" },
                    { id: "connect-shopee", text: "เชื่อมต่อ Shopee ยังไง?" },
                    { id: "vat-report", text: "ดูรายงาน ภ.พ.30 ตรงไหน?" },
                    { id: "pos-usage", text: "ระบบ POS ใช้ยังไง?" },
                  ].map((q) => (
                    <button
                      key={q.id}
                      data-testid={`quick-question-${q.id}`}
                      onClick={() => { sendMutation.mutate(q.text); }}
                      disabled={sendMutation.isPending}
                      className="text-left text-[11px] px-3 py-1.5 rounded-lg border border-[#03c9d7]/30 text-[#03c9d7] hover:bg-[#03c9d7]/5 transition-colors disabled:opacity-50"
                    >
                      {q.text}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((msg) => {
              const isMe = msg.senderId === user?.id;
              const isAdmin = msg.senderRole === "admin";
              const msgDate = formatDate(msg.createdAt);
              let showDate = false;
              if (msgDate !== lastDate) {
                showDate = true;
                lastDate = msgDate;
              }
              return (
                <div key={msg.id}>
                  {showDate && (
                    <div className="text-center text-[10px] text-slate-400 py-1.5">{msgDate}</div>
                  )}
                  <div className={`flex ${isMe ? "justify-end" : "justify-start"} mb-1`}>
                    <div
                      className={`max-w-[75%] rounded-xl px-3 py-1.5 text-xs leading-relaxed ${
                        isMe
                          ? "bg-[#03c9d7] text-white rounded-br-sm"
                          : (isAdmin || msg.senderRole === "ai")
                          ? "bg-amber-50 border border-amber-200 text-amber-900 rounded-bl-sm"
                          : "bg-white border border-slate-200 text-slate-800 rounded-bl-sm"
                      }`}
                    >
                      {!isMe && (
                        <div className={`text-[10px] font-medium mb-0.5 flex items-center gap-1 ${(isAdmin || msg.senderRole === "ai") ? "text-amber-600" : "text-slate-500"}`}>
                          {msg.senderRole === "ai" && <Bot className="h-3 w-3" />}
                          {msg.senderRole === "ai" ? "AI ฝ่ายสนับสนุน" : isAdmin ? "ฝ่ายสนับสนุน" : msg.senderName}
                        </div>
                      )}
                      <div className="whitespace-pre-wrap break-words">{msg.body}</div>
                      <div className={`text-[9px] mt-0.5 ${isMe ? "text-white/70" : "text-slate-400"}`}>
                        {formatTime(msg.createdAt)}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
            {aiTyping && (
              <div className="flex justify-start mb-1">
                <div className="max-w-[75%] rounded-xl px-3 py-2 text-xs bg-amber-50 border border-amber-200 text-amber-900 rounded-bl-sm">
                  <div className="text-[10px] font-medium mb-0.5 flex items-center gap-1 text-amber-600">
                    <Bot className="h-3 w-3" />
                    AI ฝ่ายสนับสนุน
                  </div>
                  <div className="flex items-center gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    <span>กำลังพิมพ์...</span>
                  </div>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <div className="p-2.5 border-t bg-white flex items-center gap-2 flex-shrink-0">
            <Input
              data-testid="input-chat-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="ถามเกี่ยวกับการใช้งาน..."
              className="flex-1 text-xs h-8"
              disabled={sendMutation.isPending}
            />
            <Button
              data-testid="button-send-chat"
              size="icon"
              className="h-8 w-8 bg-[#03c9d7] hover:bg-[#02a8b3] flex-shrink-0"
              onClick={handleSend}
              disabled={!message.trim() || sendMutation.isPending}
            >
              {sendMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>
        </div>
      )}

      {showChatButton && user && (
        <a
          href="/user-guide"
          target="_blank"
          rel="noopener noreferrer"
          data-testid="btn-help-guide"
          className="w-10 h-10 rounded-full text-white shadow-lg hover:shadow-xl hover:scale-110 transition-all flex items-center justify-center"
          style={{ background: "#fb9678" }}
          title="คู่มือการใช้งาน (เปิดหน้าต่างใหม่)"
        >
          <CircleHelp className="w-5 h-5" />
        </a>
      )}

      {showChatButton && (
        <button
          data-testid="button-open-chat"
          onClick={() => setOpen(!open)}
          className="relative w-12 h-12 rounded-full text-white shadow-lg hover:shadow-xl transition-all flex items-center justify-center hover:scale-105 active:scale-95" style={{ background: "#03c9d7" }}
          title={open ? "ปิดแชท" : "แชทกับฝ่ายสนับสนุน"}
        >
          {open ? <X className="h-5 w-5" /> : <MessageCircle className="h-5 w-5" />}
          {!open && unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
      )}

      <ScrollToTopButton />
    </div>
  );
}
