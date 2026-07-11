import { requireAdmin } from "@/lib/authz";
import { getAppSettings } from "@/lib/settings";
import { getContributionGoal } from "@/lib/goals";
import { AdminSubNav } from "./AdminSubNav";
import { AdminSettingsCards } from "./settings-cards";

/**
 * The consolidated Admin area: seg sub-nav over four sub-views (Share
 * transactions · Expenses · Shareholders · Activity) with the two standing
 * admin controls (Contributions visibility, annual goal) always on top.
 * requireAdmin() here is the server-side gate for everything nested below.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();

  const currentYear = new Date().getUTCFullYear();
  const [settings, goal] = await Promise.all([getAppSettings(), getContributionGoal(currentYear)]);

  return (
    <div>
      <h1 className="mb-4 text-4xl">Admin</h1>
      <AdminSubNav />
      <AdminSettingsCards
        contributionsVisibleToAll={settings.contributionsVisibleToAll}
        currentYear={currentYear}
        goalAmount={goal ? Number(goal.amount) : null}
      />
      {children}
    </div>
  );
}
