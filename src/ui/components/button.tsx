// Adapted from shadcn/ui new-york-v4 registry (MIT); local imports and project theme.
import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "../lib/utils.js"
import { LiquidMetalSurface, type MetalTone } from "./materials.js"
import { Slot } from "@radix-ui/react-slot"

const buttonVariants = cva("plot-button", {
 variants: {
  variant: { default:"button-primary", destructive:"button-destructive", outline:"button-outline", secondary:"button-secondary", ghost:"button-ghost", link:"button-link" },
  size: {default:"button-md",xs:"button-xs",sm:"button-sm",lg:"button-lg",icon:"button-icon","icon-xs":"button-icon button-xs","icon-sm":"button-icon button-sm","icon-lg":"button-icon button-lg"}
 }, defaultVariants:{variant:"default",size:"default"}
})

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  loading = false,
  tone = "neutral",
  disabled,
  children,
  onPointerEnter, onPointerLeave, onFocus, onBlur,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    tone?: MetalTone
    loading?: boolean
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot : "button"
  const [active,setActive]=React.useState(false)
  const metal=variant==='default'&&!asChild&&!disabled&&!loading

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      data-tone={tone}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
      onPointerEnter={e=>{setActive(true);onPointerEnter?.(e)}}
      onPointerLeave={e=>{setActive(false);onPointerLeave?.(e)}}
      onFocus={e=>{setActive(true);onFocus?.(e)}}
      onBlur={e=>{setActive(false);onBlur?.(e)}}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
    >{asChild ? children : <>{metal&&<LiquidMetalSurface active={active} tone={tone}/>}<span className="plot-button-content">{loading && <span className="plot-spinner" aria-hidden="true"/>}{children}</span></>}</Comp>
  )
}

export { Button, buttonVariants }
