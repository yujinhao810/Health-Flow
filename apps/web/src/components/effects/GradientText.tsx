import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';

import './GradientText.css';

type GradientDirection = 'horizontal' | 'vertical' | 'diagonal';

type GradientTextProps = {
  children: ReactNode;
  className?: string;
  colors?: string[];
  animationSpeed?: number;
  showBorder?: boolean;
  direction?: GradientDirection;
  pauseOnHover?: boolean;
  yoyo?: boolean;
};

export function GradientText({
  children,
  className = '',
  colors = ['#5227FF', '#FF9FFC', '#B497CF'],
  animationSpeed = 8,
  showBorder = false,
  direction = 'horizontal',
  pauseOnHover = false,
  yoyo = true,
}: GradientTextProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const animationDuration = Math.max(animationSpeed, 0.1) * 1000;

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const syncPreference = () => setPrefersReducedMotion(mediaQuery.matches);

    syncPreference();
    mediaQuery.addEventListener('change', syncPreference);
    return () => mediaQuery.removeEventListener('change', syncPreference);
  }, []);

  useEffect(() => {
    let animationFrame = 0;
    let elapsed = 0;
    let lastTime: number | null = null;

    const setBackgroundPosition = (progress: number) => {
      const position = direction === 'vertical' ? `50% ${progress}%` : `${progress}% 50%`;
      if (overlayRef.current) overlayRef.current.style.backgroundPosition = position;
      if (contentRef.current) contentRef.current.style.backgroundPosition = position;
    };

    setBackgroundPosition(0);

    const update = (time: number) => {
      animationFrame = requestAnimationFrame(update);

      if (isPaused || prefersReducedMotion) {
        lastTime = null;
        return;
      }

      if (lastTime === null) {
        lastTime = time;
        return;
      }

      elapsed += time - lastTime;
      lastTime = time;

      if (yoyo) {
        const fullCycle = animationDuration * 2;
        const cycleTime = elapsed % fullCycle;
        const progress =
          cycleTime < animationDuration
            ? (cycleTime / animationDuration) * 100
            : 100 - ((cycleTime - animationDuration) / animationDuration) * 100;
        setBackgroundPosition(progress);
        return;
      }

      setBackgroundPosition((elapsed / animationDuration) * 100);
    };

    animationFrame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(animationFrame);
  }, [animationDuration, direction, isPaused, prefersReducedMotion, yoyo]);

  const handleMouseEnter = useCallback(() => {
    if (pauseOnHover) setIsPaused(true);
  }, [pauseOnHover]);

  const handleMouseLeave = useCallback(() => {
    if (pauseOnHover) setIsPaused(false);
  }, [pauseOnHover]);

  const gradientStyle = useMemo(() => {
    const gradientAngle = direction === 'horizontal' ? 'to right' : direction === 'vertical' ? 'to bottom' : 'to bottom right';
    const gradientColors = [...colors, colors[0]].join(', ');

    return {
      backgroundImage: `linear-gradient(${gradientAngle}, ${gradientColors})`,
      backgroundSize: direction === 'horizontal' ? '300% 100%' : direction === 'vertical' ? '100% 300%' : '300% 300%',
      backgroundRepeat: 'repeat',
      backgroundPosition: '0% 50%',
    } satisfies CSSProperties;
  }, [colors, direction]);

  return (
    <span
      className={`animated-gradient-text ${showBorder ? 'with-border' : ''} ${className}`.trim()}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {showBorder ? <span ref={overlayRef} className="gradient-overlay" style={gradientStyle} /> : null}
      <span ref={contentRef} className="text-content" style={gradientStyle}>
        {children}
      </span>
    </span>
  );
}
