import { useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * A scroll container with a fade-out gradient at the top when scrolled.
 */
export function FadeScrollArea({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const [scrolled, setScrolled] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  return (
    <div className={cn("relative overflow-hidden", className)}>
      <div
        className={cn(
          "pointer-events-none absolute inset-x-0 top-0 z-10 h-6 bg-gradient-to-b from-background to-transparent transition-opacity duration-200",
          scrolled ? "opacity-100" : "opacity-0",
        )}
      />
      <div
        ref={ref}
        className="h-full overflow-y-auto"
        onScroll={() => setScrolled((ref.current?.scrollTop ?? 0) > 0)}
      >
        {children}
      </div>
    </div>
  );
}
