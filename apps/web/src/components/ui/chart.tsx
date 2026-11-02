"use client"

import * as React from "react"
import {
  ResponsiveContainer as ResponsiveContainerPrimitive,
  Tooltip as TooltipPrimitive,
  Legend as LegendPrimitive,
} from "recharts"
import { cn } from "@/lib/utils"

interface TooltipPayload {
  value: number | string
  dataKey: string
  name?: string
  color?: string
}

interface CustomTooltipProps {
  formatter?: (value: number, name: string) => [string, string]
  active?: boolean
  payload?: TooltipPayload[]
  label?: string
  className?: string
}

const ChartContainer = React.forwardRef<
  React.ElementRef<typeof ResponsiveContainerPrimitive>,
  React.ComponentPropsWithoutRef<typeof ResponsiveContainerPrimitive> & {
    config?: Record<string, { label: string; color: string }>
  }
>(({ className, children, ...props }, ref) => (
  <ResponsiveContainerPrimitive
    ref={ref}
    className={cn("w-full h-full", className)}
    {...props}
  >
    {children}
  </ResponsiveContainerPrimitive>
))
ChartContainer.displayName = ResponsiveContainerPrimitive.displayName

type TooltipProps = Omit<React.ComponentPropsWithoutRef<typeof TooltipPrimitive>, 'formatter'> & {
  formatter?: (value: number, name: string) => [string, string]
}

const ChartTooltip = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive>,
  TooltipProps
>(({ formatter, ...props }, ref) => (
  <TooltipPrimitive
    ref={ref}
    content={<CustomTooltipContent formatter={formatter} />}
    {...props}
  />
))
ChartTooltip.displayName = TooltipPrimitive.displayName

const CustomTooltipContent = React.forwardRef<
  HTMLDivElement,
  CustomTooltipProps
>(({ className, active, payload, label, formatter, ...props }, ref) => {
  if (!active || !payload?.length) return null

  return (
    <div
      ref={ref}
      className={cn(
        "grid min-w-[8rem] gap-1 rounded-lg border bg-background p-2.5 shadow-lg",
        className
      )}
      {...props}
    >
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      {payload.map((item, index) => (
        <div
          key={`${item.dataKey}-${index}`}
          className="flex items-center gap-2 text-xs"
          style={{ color: item.color }}
        >
          {item.value !== undefined && (
            <>
              {formatter ? (
                formatter(Number(item.value), item.dataKey).map((v, i) => (
                  <span key={i}>{v}</span>
                ))
              ) : (
                <>
                  <span>{item.name || item.dataKey}: </span>
                  <span className="font-medium">{item.value}</span>
                </>
              )}
            </>
          )}
        </div>
      ))}
    </div>
  )
})
CustomTooltipContent.displayName = "CustomTooltipContent"

const ChartLegend = ({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof LegendPrimitive>) => (
  <LegendPrimitive
    className={cn("flex flex-wrap gap-4", className)}
    {...props}
  />
)
ChartLegend.displayName = LegendPrimitive.displayName

export {
  ChartContainer,
  ChartTooltip,
  ChartLegend,
}