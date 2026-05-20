import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MailCheck, Loader2 } from "lucide-react";

interface SendEmailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultEmail: string;
  docLabel: string;
  docNo: string;
  onConfirm: (email: string) => Promise<void>;
}

export default function SendEmailDialog({ open, onOpenChange, defaultEmail, docLabel, docNo, onConfirm }: SendEmailDialogProps) {
  const [email, setEmail] = useState(defaultEmail);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) setEmail(defaultEmail);
  }, [open, defaultEmail]);

  async function handleSend() {
    if (!email.trim()) return;
    setLoading(true);
    try {
      await onConfirm(email.trim());
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MailCheck className="h-5 w-5 text-[var(--theme-primary)]" />
            ส่งอีเมล{docLabel}
          </DialogTitle>
        </DialogHeader>
        <div className="py-2 space-y-3">
          <p className="text-sm text-muted-foreground">เอกสารเลขที่ <span className="font-medium text-foreground">{docNo}</span></p>
          <div className="space-y-1.5">
            <Label htmlFor="send-email-input">อีเมลผู้รับ</Label>
            <Input
              id="send-email-input"
              data-testid="input-send-email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="กรอกอีเมลผู้รับ"
              onKeyDown={e => { if (e.key === "Enter" && !loading) handleSend(); }}
              autoFocus
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading} data-testid="button-cancel-email">
            ยกเลิก
          </Button>
          <Button
            onClick={handleSend}
            disabled={loading || !email.trim()}
            data-testid="button-confirm-send-email"
            style={{ background: "var(--theme-primary)", color: "white" }}
          >
            {loading ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> กำลังส่ง...</> : <><MailCheck className="h-4 w-4 mr-1.5" /> ส่งอีเมล</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
