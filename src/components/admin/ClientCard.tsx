"use client";

import { toggleClientActive, updateClientDomains } from "@/app/panel-admina/klienci/actions";

type DomainOption = { id: string; name: string; color: string };

export type ClientCardData = {
  id: string;
  name: string;
  active: boolean;
  domainIds: string[];
};

export function ClientCard({
  client,
  domains,
}: {
  client: ClientCardData;
  domains: DomainOption[];
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-foreground">{client.name}</h3>
        <form action={toggleClientActive}>
          <input type="hidden" name="id" value={client.id} />
          <button
            type="submit"
            className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${
              client.active
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-zinc-200 bg-zinc-100 text-zinc-600"
            }`}
          >
            {client.active ? "Aktywny" : "Wyłączony"}
          </button>
        </form>
      </div>

      <form action={updateClientDomains} className="mt-4">
        <input type="hidden" name="clientId" value={client.id} />
        <p className="text-xs font-medium uppercase tracking-wide text-muted">
          Interesujące dziedziny
        </p>
        <div className="mt-2 flex flex-wrap gap-3">
          {domains.map((domain) => (
            <label key={domain.id} className="flex items-center gap-1.5 text-sm text-foreground">
              <input
                type="checkbox"
                name="domainIds"
                value={domain.id}
                defaultChecked={client.domainIds.includes(domain.id)}
                className="rounded border-border"
              />
              {domain.name}
            </label>
          ))}
        </div>
        <button
          type="submit"
          className="mt-3 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted hover:border-foreground/40 hover:text-foreground"
        >
          Zapisz dziedziny
        </button>
      </form>
    </div>
  );
}
