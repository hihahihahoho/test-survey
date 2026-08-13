import { Toaster as Sonner, toast } from "sonner";

/**
 * Shared Sonner host. Position and viewport offsets intentionally use Sonner's
 * defaults: a toast must not be pushed away from the browser edge to compensate
 * for a particular screen's controls.
 */
type ToasterProps = React.ComponentProps<typeof Sonner>;

/** Thời lượng chuẩn cho mọi call site. Mọi toast đều có đường tự thoát. */
const KG_TOAST_DURATION = {
  success: 4000,
  successWithUndo: 10_000,
  info: 5000,
  warning: 8000,
  error: 12_000,
} as const;

const Dot = ({ tone }: { tone: string }) => (
  <span aria-hidden className={`size-1.5 shrink-0 rounded-full ${tone}`} />
);

const Toaster = (props: ToasterProps) => (
  <Sonner
    visibleToasts={3}
    closeButton
    duration={KG_TOAST_DURATION.info}
    style={{
      "--toast-close-button-start": "unset",
      "--toast-close-button-end": "0",
      "--toast-close-button-transform": "translate(-50%, 50%)",
      "--toast-button-margin-end": "16px",
    } as React.CSSProperties}
    icons={{
      success: <Dot tone="bg-ok" />,
      info: <Dot tone="bg-accent" />,
      warning: <Dot tone="bg-warn" />,
      error: <Dot tone="bg-danger" />,
    }}
    toastOptions={{
      classNames: {
        toast: "group w-toast rounded-2 border !border-line-subtle !bg-overlay !text-fg-strong shadow-2 gap-3 p-4 text-body",
        title: "pr-6 text-body font-medium text-fg-strong",
        description: "text-caption !text-fg",
        actionButton: "!rounded-1 !bg-transparent px-0 h-ctl-sm text-label !text-accent-text underline underline-offset-4",
        cancelButton: "!rounded-1 !bg-raised border !border-line px-3 h-ctl-sm text-label !text-fg-strong",
        closeButton: "!border-line-subtle !bg-overlay !text-fg",
      },
    }}
    {...props}
  />
);

export { Toaster, toast, KG_TOAST_DURATION };
