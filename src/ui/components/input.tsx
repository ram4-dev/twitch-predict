// Adapted from shadcn/ui new-york-v4 registry (MIT); local imports and project theme.
import * as React from "react"
import { cn } from "../lib/utils.js"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn("plot-input", className)}
      {...props}
    />
  )
}

export { Input }
