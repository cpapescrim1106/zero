import type { ReactNode } from "react";
import Header from "../../components/layout/Header";
import MobileNav from "../../components/layout/MobileNav";
import Sidebar from "../../components/layout/Sidebar";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 px-4 py-5 lg:px-6">
        <MobileNav />
        <div className="mt-2 flex flex-col gap-4">
          {children}
        </div>
      </main>
    </div>
  );
}
