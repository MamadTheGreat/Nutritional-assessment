import { Outlet, createFileRoute } from "@tanstack/react-router";
import { AuthGateError, requireSignedIn } from "@/components/auth/AuthGate";
import FollowUpAlert from "@/components/patients/FollowUpAlert";
import NavShell from "@/components/NavShell";
import { dueReviews } from "@/lib/server-fns";

export const Route = createFileRoute("/_authed")({
  ssr: false,
  beforeLoad: requireSignedIn,
  loader: async () => ({ due: await dueReviews() }),
  errorComponent: AuthGateError,
  component: AuthedLayout,
});

function AuthedLayout() {
  const { due } = Route.useLoaderData();

  return (
    <NavShell dueCount={due.length}>
      <FollowUpAlert patients={due} />
      <Outlet />
    </NavShell>
  );
}
