import * as React from "react";
import { Check, Copy, Download, MoreHorizontal, RefreshCw } from "lucide-react";
import { FloatingToolbar } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { BTN } from "@/features/kitfile";

interface ResultActionsProps {
  disabledReason: string | null;
  downloading: boolean;
  onDownload: (includeRaw: boolean) => void;
  onRedraw: () => void;
  onDesign: () => void;
  onHistory: () => void;
  onReveal: () => void;
}

export function ResultActions(p: ResultActionsProps) {
  const [raw, setRaw] = React.useState(false);
  return (
    <div className="fixed inset-x-0 bottom-4 z-floatbar flex justify-center px-4">
      <FloatingToolbar
        aria-label="Hành động cho bộ kit"
        left={
          <Popover>
            <PopoverTrigger asChild><Button variant="primary" size="sm" disabled={p.disabledReason !== null} title={p.disabledReason ?? undefined}><Download aria-hidden />{BTN.DOWNLOAD_KIT}</Button></PopoverTrigger>
            <PopoverContent align="start" className="flex flex-col gap-4">
              <p className="text-subtitle">Tải những gì?</p>
              <div className="flex items-center gap-2"><Checkbox id="cut-items" checked disabled /><Label htmlFor="cut-items">Món đã tách nền</Label><Check aria-hidden className="ml-auto size-4 text-accent-text" /></div>
              <div className="flex items-center gap-2"><Checkbox id="raw-sheets" checked={raw} onCheckedChange={(v) => setRaw(v === true)} /><Label htmlFor="raw-sheets">Tấm gốc chưa cắt</Label></div>
              <Button onClick={() => p.onDownload(raw)} loading={p.downloading}>Tải .zip</Button>
            </PopoverContent>
          </Popover>
        }
        center={<Button size="sm" disabled title="Sắp có"><Copy aria-hidden />{BTN.COPY_FIGMA}<span className="text-caption">Sắp có</span></Button>}
        right={<><Button size="sm" disabled={p.disabledReason !== null} title={p.disabledReason ?? undefined} onClick={p.onRedraw}><RefreshCw aria-hidden />Vẽ lại cả tấm</Button><DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label={BTN.ADVANCED}><MoreHorizontal aria-hidden /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onSelect={p.onDesign}>Xem bản thiết kế</DropdownMenuItem><DropdownMenuItem onSelect={p.onHistory}>Lịch sử các lần vẽ</DropdownMenuItem><DropdownMenuItem onSelect={p.onReveal}>Mở thư mục trên máy</DropdownMenuItem><DropdownMenuItem>Chi tiết cho lập trình viên</DropdownMenuItem></DropdownMenuContent></DropdownMenu></>}
      />
    </div>
  );
}
