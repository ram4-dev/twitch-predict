// Adapted from shadcn/ui new-york-v4 registry (MIT); local imports and project theme.
import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "../lib/utils.js"
import { Slot } from "@radix-ui/react-slot"

const badgeVariants = cva("plot-badge", {
 variants:{variant:{default:"badge-primary",secondary:"badge-secondary",destructive:"badge-destructive",outline:"badge-outline",ghost:"badge-ghost",link:"badge-link"}},defaultVariants:{variant:"default"}
})

function Badge({
  className,
  variant = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "span"

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
