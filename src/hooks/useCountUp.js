import { useEffect, useMemo, useState } from 'react'

export default function useCountUp(target, duration = 900) {
  const numericTarget = useMemo(() => Number(target) || 0, [target])
  const [value, setValue] = useState(0)

  useEffect(() => {
    let rafId
    const start = performance.now()

    const tick = (now) => {
      const elapsed = now - start
      const progress = Math.min(elapsed / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setValue(Math.round(numericTarget * eased))
      if (progress < 1) {
        rafId = requestAnimationFrame(tick)
      }
    }

    setValue(0)
    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [numericTarget, duration])

  return value
}
