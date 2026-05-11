import { toast as sonnerToast } from "sonner";

type ToastOptions = {
  title?: string;
  description?: string;
  variant?: "default" | "destructive";
};

function toast(opts: ToastOptions) {
  const message = opts.title ?? "";
  const description = opts.description;
  if (opts.variant === "destructive") {
    sonnerToast.error(message, { description });
  } else {
    sonnerToast.success(message, { description });
  }
}

export function useToast() {
  return { toast };
}
