import { useEffect, useRef } from 'react'

export default function useScrollAnimation(options = {}) {
  const ref = useRef(null)

  useEffect(() => {
    const node = ref.current
    if (!node) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          node.classList.add('is-visible')
          observer.unobserve(node)
        }
      },
      {
        threshold: options.threshold ?? 0.15,
        rootMargin: options.rootMargin ?? '0px 0px -40px 0px'
      }
    )

    observer.observe(node)
    return () => observer.disconnect()
  }, [options.rootMargin, options.threshold])

  return ref
}
