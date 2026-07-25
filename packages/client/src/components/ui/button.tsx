import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold transition-all duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:pointer-events-none disabled:opacity-50 cursor-pointer",
  {
    variants: {
      variant: {
        primary:
          "bg-brand-gradient text-white shadow-sm hover:shadow-md hover:brightness-110 active:scale-[0.98]",
        outline:
          "border border-[var(--color-gray-200)] bg-transparent text-[var(--color-gray-700)] hover:bg-[var(--color-gray-50)] hover:border-[var(--color-gray-300)] active:bg-[var(--color-gray-100)]",
        ghost:
          "text-[var(--color-gray-700)] hover:bg-[var(--color-gray-100)] hover:text-[var(--color-gray-900)] active:bg-[var(--color-gray-200)]",
        destructive:
          "bg-[var(--color-error)] text-white shadow-sm hover:brightness-110 active:scale-[0.98]",
      },
      size: {
        sm: "h-8 px-3 text-xs",
        md: "h-10 px-4",
        lg: "h-11 px-6 text-base",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  ),
);
Button.displayName = "Button";
