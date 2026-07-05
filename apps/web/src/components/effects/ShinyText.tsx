import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';

import './ShinyText.css';

type ShinyTextProps = {
  text: string;
  disabled?: boolean;
  speed?: number;
  className?: string;
  color?: string;
  shineColor?: string;
  spread?: number;
  yoyo?: boolean;
  pauseOnHover?: boolean;
  direction?: 'left' | 'right';
  delay?: number;
};

export function ShinyText({
  text,
  disabled = false,
  speed = 2,
  className = '',
  color = '#b5b5b5',
  shineColor = '#ffffff',
  spread = 120,
  yoyo = false,
  pauseOnHover = false,
  direction = 'left',
  delay = 0,
}: ShinyTextProps) {
  const textRef = useRef<HTMLSpanElement>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  const animationDuration = Math.max(speed, 0.1) * 1000;
  const delayDuration = Math.max(delay, 0) * 1000;

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const syncPreference = () => setPrefersReducedMotion(mediaQuery.matches);

    syncPreference();
    mediaQuery.addEventListener('change', syncPreference);
    return () => mediaQuery.removeEventListener('change', syncPreference);
  }, []);

  useEffect(() => {
    const element = textRef.current;
    if (!element) return undefined;

    let animationFrame = 0;
    let elapsed = 0;
    let lastTime: number | null = null;
    const directionMultiplier = direction === 'left' ? 1 : -1;

    const setProgress = (progress: number) => {
      element.style.backgroundPosition = `${150 - progress * 2}% center`;
    };

    setProgress(directionMultiplier === 1 ? 0 : 100);

    const update = (time: number) => {
      animationFrame = requestAnimationFrame(update);

      if (disabled || isPaused || prefersReducedMotion) {
        lastTime = null;
        return;
      }

      if (lastTime === null) {
        lastTime = time;
        return;
      }

      elapsed += time - lastTime;
      lastTime = time;

      const cycleDuration = animationDuration + delayDuration;

      if (yoyo) {
        const fullCycle = cycleDuration * 2;
        const cycleTime = elapsed % fullCycle;

        if (cycleTime < animationDuration) {
          const progress = (cycleTime / animationDuration) * 100;
          setProgress(directionMultiplier === 1 ? progress : 100 - progress);
        } else if (cycleTime < cycleDuration) {
          setProgress(directionMultiplier === 1 ? 100 : 0);
        } else if (cycleTime < cycleDuration + animationDuration) {
          const reverseTime = cycleTime - cycleDuration;
          const progress = 100 - (reverseTime / animationDuration) * 100;
          setProgress(directionMultiplier === 1 ? progress : 100 - progress);
        } else {
          setProgress(directionMultiplier === 1 ? 0 : 100);
        }
        return;
      }

      const cycleTime = elapsed % cycleDuration;
      if (cycleTime < animationDuration) {
        const progress = (cycleTime / animationDuration) * 100;
        setProgress(directionMultiplier === 1 ? progress : 100 - progress);
      } else {
        setProgress(directionMultiplier === 1 ? 100 : 0);
      }
    };

    animationFrame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(animationFrame);
  }, [animationDuration, delayDuration, direction, disabled, isPaused, prefersReducedMotion, yoyo]);

  const handleMouseEnter = useCallback(() => {
    if (pauseOnHover) setIsPaused(true);
  }, [pauseOnHover]);

  const handleMouseLeave = useCallback(() => {
    if (pauseOnHover) setIsPaused(false);
  }, [pauseOnHover]);

  const gradientStyle = useMemo(
    () =>
      ({
        backgroundImage: `linear-gradient(${spread}deg, ${color} 0%, ${color} 35%, ${shineColor} 50%, ${color} 65%, ${color} 100%)`,
        backgroundPosition: direction === 'left' ? '150% center' : '-50% center',
      }) satisfies CSSProperties,
    [color, direction, shineColor, spread],
  );

  return (
    <span ref={textRef} className={`shiny-text ${className}`.trim()} style={gradientStyle} onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
      {text}
    </span>
  );
}
