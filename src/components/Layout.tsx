import { Sidebar } from "./Sidebar";
import type { AppScreen } from "../types";

interface LayoutProps {
  activeScreen: AppScreen;
  onNavigate: (screen: AppScreen) => void;
  children: React.ReactNode;
}

export function Layout({ activeScreen, onNavigate, children }: LayoutProps) {
  return (
    <div className="h-screen flex bg-bg-primary">
      <Sidebar activeScreen={activeScreen} onNavigate={onNavigate} />
      <main className="flex-1 min-w-0 overflow-hidden">{children}</main>
    </div>
  );
}
