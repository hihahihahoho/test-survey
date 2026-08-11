import * as React from "react";
import { cn } from "@/lib/utils";

const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        "flex min-h-[80px] w-full rounded-2 border border-line bg-raised px-3 py-2 text-body text-fg-strong",
        "transition-colors duration-fast placeholder:text-fg-muted-raised",
        "focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-0 focus-visible:ring-offset-canvas",
        "disabled:cursor-not-allowed disabled:border-line-subtle disabled:bg-raised disabled:text-fg-muted",
        "disabled:placeholder:text-fg-muted aria-[invalid=true]:border-danger",
        className
      )}
      {...props}
    />
  )
);
Textarea.displayName = "Textarea";

export { Textarea };
