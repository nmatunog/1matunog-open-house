/** Render untrusted strings as text only (no HTML). */
export function SafeText({ value, as: Tag = 'span', className }: { value: string; as?: 'span' | 'p' | 'h1' | 'h2' | 'h3' | 'li' | 'td'; className?: string }) {
  return <Tag className={className}>{value}</Tag>;
}
