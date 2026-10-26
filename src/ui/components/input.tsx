// Adapted from shadcn/ui new-york-v4 registry (MIT); local imports and project theme.
import * as React from "react"
import { cn } from "../lib/utils.js"

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(({ className, type, ...props }, ref) => {
  return (
    <input
      ref={ref}
      type={type}
      data-slot="input"
      className={cn("plot-input", className)}
      {...props}
    />
  )
});
Input.displayName = "Input";

export { Input }
