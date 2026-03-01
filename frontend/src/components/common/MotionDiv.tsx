import { useEffect, useState, type HTMLAttributes, type ReactNode } from 'react'

interface MotionTarget {
  opacity?: number
  x?: number
  y?: number
  scale?: number
}

interface MotionTransition {
  duration?: number
  delay?: number
}

interface MotionDivProps extends HTMLAttributes<HTMLDivElement> {
  children?: ReactNode
  initial?: MotionTarget
  animate?: MotionTarget
  transition?: MotionTransition
}

function buildTransform(target: MotionTarget | undefined) {
  const x = target?.x ?? 0
  const y = target?.y ?? 0
  const scale = target?.scale ?? 1
  return `translate3d(${x}px, ${y}px, 0) scale(${scale})`
}

export function MotionDiv({ children, initial, animate, transition, style, ...rest }: MotionDivProps) {
  const [isActive, setIsActive] = useState(false)

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setIsActive(true))
    return () => window.cancelAnimationFrame(frame)
  }, [])

  const current = isActive ? (animate ?? {}) : (initial ?? {})
  const duration = transition?.duration ?? 0.3
  const delay = transition?.delay ?? 0

  const motionStyle = {
    opacity: current.opacity ?? 1,
    transform: buildTransform(current),
    transition: `opacity ${duration}s ease ${delay}s, transform ${duration}s ease ${delay}s`,
    willChange: 'opacity, transform',
  }

  return (
    <div {...rest} style={{ ...motionStyle, ...style }}>
      {children}
    </div>
  )
}
