import * as React from "react"
import { Info } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from './tooltip'
import { cn } from '@/lib/utils'

interface InfoIconProps {
  content: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export function InfoIcon({ content, size = 'sm', className }: InfoIconProps) {
  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-5 w-5',
    lg: 'h-6 w-6'
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Info
          className={cn(
            sizeClasses[size],
            'text-muted-foreground hover:text-primary cursor-help transition-colors',
            className
          )}
        />
      </TooltipTrigger>
      <TooltipContent>
        <p>{content}</p>
      </TooltipContent>
    </Tooltip>
  )
}
