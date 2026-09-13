/** Remounts on every navigation, so the page-enter animation plays each time. */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="page-enter">{children}</div>;
}
