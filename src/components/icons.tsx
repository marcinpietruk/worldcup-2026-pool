// The brand soccer ball (no good Lucide equivalent). Everything else uses
// lucide-react directly with className="ic-svg".
export function Ball({ className = "ic-svg" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
      <circle cx="12" cy="12" r="9.2" />
      <path d="M12 7.2l3.4 2.5-1.3 4h-4.2l-1.3-4z" fill="currentColor" stroke="none" />
      <path d="M12 7.2V3.2M15.4 9.7l3.6-1.4M14.1 13.7l2.3 3.2M9.9 13.7l-2.3 3.2M8.6 9.7L5 8.3" />
    </svg>
  );
}
