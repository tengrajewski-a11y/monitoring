"use client";

import { useState } from "react";
import { toggleUserActive, updateUserRole } from "@/app/panel-admina/uzytkownicy/actions";

type ClientOption = { id: string; name: string };

export type UserRowData = {
  id: string;
  email: string;
  name: string | null;
  role: string;
  clientId: string | null;
  active: boolean;
};

export function UserRow({ user, clients }: { user: UserRowData; clients: ClientOption[] }) {
  const [role, setRole] = useState(user.role);

  return (
    <tr className="border-b border-border last:border-0">
      <td className="py-3 pr-4">
        <p className="text-sm font-medium text-foreground">{user.name || "—"}</p>
        <p className="text-xs text-muted">{user.email}</p>
      </td>
      <td className="py-3 pr-4">
        <form action={updateUserRole} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="id" value={user.id} />
          <select
            name="role"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="rounded-md border border-border bg-background px-2 py-1 text-xs"
          >
            <option value="AGENCY">Zespół agencji</option>
            <option value="ADMIN">Administrator</option>
            <option value="CLIENT">Klient</option>
          </select>
          {role === "CLIENT" && (
            <select
              name="clientId"
              defaultValue={user.clientId ?? ""}
              className="rounded-md border border-border bg-background px-2 py-1 text-xs"
            >
              <option value="">— klient —</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
          <button
            type="submit"
            className="rounded-md border border-border px-2 py-1 text-xs font-medium text-muted hover:border-foreground/40 hover:text-foreground"
          >
            Zapisz
          </button>
        </form>
      </td>
      <td className="py-3 text-right">
        <form action={toggleUserActive}>
          <input type="hidden" name="id" value={user.id} />
          <button
            type="submit"
            className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${
              user.active
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-zinc-200 bg-zinc-100 text-zinc-600"
            }`}
          >
            {user.active ? "Aktywny" : "Wyłączony"}
          </button>
        </form>
      </td>
    </tr>
  );
}
