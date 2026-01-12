import type { ReactNode } from "react";
import Header from "../../components/layout/Header";
import MobileNav from "../../components/layout/MobileNav";
import Sidebar from "../../components/layout/Sidebar";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 px-6 py-8 lg:px-10">
        <MobileNav />
        <div className="mt-8 flex flex-col gap-8">
          <Header title="Control Center" subtitle="Single-machine bot ops, live risk, steady execution." />
          {children}
        </div>
      </main>
    </div>
  );
}
