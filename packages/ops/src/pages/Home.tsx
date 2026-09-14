import type { WhoAmI } from "@/lib/api";

export function Home({ whoami }: { whoami: WhoAmI }) {
  const rows: Array<[string, string]> = [
    ["Signed in as", whoami.maintainer.email],
    ["Name", whoami.maintainer.displayName],
    ["Release", whoami.release ?? "unknown"],
    ["Server time", new Date(whoami.serverTime).toLocaleString()],
  ];

  return (
    <section className="rounded-lg border border-line bg-panel">
      <h1 className="border-b border-line px-5 py-3 text-base font-semibold">Session</h1>
      <dl className="divide-y divide-line">
        {rows.map(([label, value]) => (
          <div key={label} className="grid grid-cols-1 gap-1 px-5 py-3 sm:grid-cols-3">
            <dt className="text-sm text-muted">{label}</dt>
            <dd className="text-sm font-medium break-all sm:col-span-2">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
