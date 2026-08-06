import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { LoginForm } from "@/components/LoginForm";
import { Logo } from "@/components/Logo";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ next?: string }>;

export default async function LoginPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const user = await getCurrentUser();
  if (user) redirect("/");

  const sp = await searchParams;

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <Logo />
        </div>
        <div className="rounded-lg border border-border bg-surface p-6 sm:p-8">
          <h1 className="text-lg font-semibold text-foreground">Logowanie</h1>
          <p className="mt-1 text-sm text-muted">
            Dostęp tylko dla zespołu Trinity Trust.
          </p>
          <div className="mt-6">
            <LoginForm next={sp.next ?? "/"} />
          </div>
        </div>
      </div>
    </div>
  );
}
