import * as React from "react"
import { cn } from "@/lib/utils"

interface PageIntroProps {
  title: string
  description: string
  icon?: React.ReactNode
  className?: string
}

export function PageIntro({ title, description, icon, className }: PageIntroProps) {
  return (
    <div className={cn("mb-6 pb-4 border-b border-border", className)}>
      <div className="flex items-center gap-3 mb-2">
        {icon && <div className="text-primary">{icon}</div>}
        <h1 className="text-2xl font-bold text-foreground">{title}</h1>
      </div>
      <p className="text-sm text-muted-foreground max-w-3xl">{description}</p>
    </div>
  )
}
