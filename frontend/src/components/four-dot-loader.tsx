export function FourDotLoader({ className = "text-current" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 ${className}`} aria-hidden="true">
      {[0, 1, 2, 3].map((dot) => (
        <span
          key={dot}
          className="size-1.5 animate-bounce rounded-full bg-current"
          style={{ animationDelay: `${dot * 140}ms` }}
        />
      ))}
    </span>
  );
}
