import Link from "next/link";

export function Logo({ className = "" }: { className?: string }) {
  return (
    <Link href="/" className={`inline-flex flex-col leading-none group ${className}`}>
      <span className="font-brand text-[1.35rem] tracking-[0.03em] text-foreground group-hover:opacity-70 transition-opacity">
        Trinity Trust
      </span>
      <span className="text-[0.6rem] font-sans font-medium tracking-[0.28em] text-muted uppercase mt-0.5">
        Corporate Counsel
      </span>
    </Link>
  );
}
