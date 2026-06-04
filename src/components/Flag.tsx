// Country flag as a rounded "sticker" rectangle (flagcdn SVG). Falls back to a
// "?" placeholder for unresolved knockout slots.
export function Flag({
  iso2,
  name,
  size,
}: {
  iso2: string | null | undefined;
  name?: string | null;
  size?: "sm" | "lg";
}) {
  const cls = `flag${size === "sm" ? " flag--sm" : size === "lg" ? " flag--lg" : ""}`;
  if (!iso2) return <span className={`${cls} flag--tbd`} role="img" aria-label={name ?? "To be decided"} />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img className={cls} src={`https://flagcdn.com/${iso2}.svg`} alt={name ?? iso2} loading="lazy" />
  );
}
