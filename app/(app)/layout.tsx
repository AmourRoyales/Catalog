import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/mongo";
import Sidebar from "@/components/Sidebar";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  const db = await getDb();
  const profile = user ? await db.collection("users").findOne({ _id: user.id as any }) : null;

  return (
    <div className="flex h-screen bg-[#F5F8FB]">
      <Sidebar name={profile?.name ?? "User"} />

      {/* Main area — pushed below the mobile top bar on phones (pt-14),
          normal on desktop (md:pt-0) where there is no top bar. */}
      <main className="flex-1 overflow-y-auto pt-14 md:pt-0">{children}</main>
    </div>
  );
}
