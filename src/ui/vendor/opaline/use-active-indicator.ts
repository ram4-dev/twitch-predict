"use client"

import * as React from "react"

type IndicatorRect = { left: number; top: number; width: number; height: number }

/**
 * Tracks the element matching `selector` inside `containerRef` and returns its
 * box relative to the container — used to slide a glass bubble between items.
 */
export function useActiveIndicator(
  containerRef: React.RefObject<HTMLElement | null>,
  selector = '[data-state="active"]'
) {
  const [rect, setRect] = React.useState<IndicatorRect | null>(null)

  React.useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) return

    const update = () => {
      const el = container.querySelector<HTMLElement>(selector)
      if (!el) return setRect(null)
      const next = {
        left: el.offsetLeft,
        top: el.offsetTop,
        width: el.offsetWidth,
        height: el.offsetHeight,
      }
      setRect((prev) =>
        prev &&
        prev.left === next.left &&
        prev.top === next.top &&
        prev.width === next.width &&
        prev.height === next.height
          ? prev
          : next
      )
    }

    update()
    const mo = new MutationObserver(update)
    mo.observe(container, {
      subtree: true,
      attributes: true,
      attributeFilter: ["data-state", "aria-selected", "aria-current"],
    })
    const ro = new ResizeObserver(update)
    ro.observe(container)
    return () => {
      mo.disconnect()
      ro.disconnect()
    }
  }, [containerRef, selector])

  return rect
}
