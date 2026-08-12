import * as React from "react";
import { Check, Images } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useLibraryFile, useLibraryImage, useUserLibrary } from "@/lib/hooks";
import type { LibraryItem } from "@/lib/types";
import { toastError } from "@/features/projects/lib/feedback";

function LibraryRow({ item, onSelect }: { item: LibraryItem; onSelect: (item: LibraryItem) => void }) {
  const src = useLibraryImage(item.id);
  return (
    <button type="button" onClick={() => onSelect(item)} className="flex w-full items-center gap-3 rounded-2 p-2 text-left hover:bg-raised">
      <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-1 border border-line-subtle bg-raised">
        {src ? <img src={src} alt="" className="size-full object-cover" /> : <Images className="size-4 text-fg-muted" aria-hidden />}
      </span>
      <span className="min-w-0 flex-1 truncate text-label">{item.name}</span>
      <Check className="size-4 text-fg-muted" aria-hidden />
    </button>
  );
}

export function SharedReferencePicker({ group, onPick }: {
  group: "style" | "mascot-reference";
  onPick: (file: File, item: LibraryItem) => void;
}) {
  const library = useUserLibrary();
  const file = useLibraryFile();
  const [open, setOpen] = React.useState(false);
  const items = (library.data?.items ?? []).filter((item) => item.kind === "reference" && item.group === group);

  if (items.length === 0) return null;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" size="sm" variant="secondary"><Images aria-hidden />Chọn từ thư viện</Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-2">
        <p className="px-2 pb-2 text-caption text-fg-muted">Ảnh dùng chung</p>
        <div className="max-h-72 overflow-y-auto">
          {items.map((item) => (
            <LibraryRow key={item.id} item={item} onSelect={(selected) => {
              file.mutate(selected, {
                onSuccess: (result) => {
                  onPick(result, selected);
                  setOpen(false);
                },
                onError: (error) => toastError(error, {}),
              });
            }} />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function SharedMascotPicker({ onPick }: {
  onPick: (file: File, item: LibraryItem) => void;
}) {
  const library = useUserLibrary();
  const file = useLibraryFile();
  const [open, setOpen] = React.useState(false);
  const items = (library.data?.items ?? []).filter((item) => item.kind === "mascot");

  if (items.length === 0) return null;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" size="sm" variant="secondary"><Images aria-hidden />Chọn mascot có sẵn</Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-2">
        <p className="px-2 pb-2 text-caption text-fg-muted">Mascot</p>
        <div className="max-h-72 overflow-y-auto">
          {items.map((item) => (
            <LibraryRow key={item.id} item={item} onSelect={(selected) => {
              file.mutate(selected, {
                onSuccess: (result) => {
                  onPick(result, selected);
                  setOpen(false);
                },
                onError: (error) => toastError(error, {}),
              });
            }} />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
