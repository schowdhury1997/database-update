import {
  Database,
  LayoutTemplate,
  Clock,
  Settings,
  HardDrive,
} from "lucide-react";
import type { AppScreen } from "../types";

interface SidebarProps {
  activeScreen: AppScreen;
  onNavigate: (screen: AppScreen) => void;
}

interface NavItem {
  id: AppScreen;
  icon: React.ReactNode;
  label: string;
}

const topItems: NavItem[] = [
  { id: "home", icon: <Database size={22} />, label: "Source" },
  { id: "templates", icon: <LayoutTemplate size={22} />, label: "Templates" },
  { id: "schedules", icon: <Clock size={22} />, label: "Schedules" },
];

export function Sidebar({ activeScreen, onNavigate }: SidebarProps) {
  const isActive = (id: AppScreen) => {
    if (id === "home") {
      return ["home", "s3download", "scanning", "configure", "execute"].includes(activeScreen);
    }
    return activeScreen === id;
  };

  return (
    <div
      className="h-full bg-sidebar-bg border-r border-border-subtle flex flex-col items-center flex-shrink-0"
      style={{ width: 80, paddingTop: 48, paddingBottom: 20 }}
    >
      {/* App icon */}
      <div
        className="rounded-xl bg-accent/15 flex items-center justify-center"
        style={{ width: 42, height: 42, marginBottom: 36 }}
      >
        <HardDrive size={20} className="text-accent" />
      </div>

      {/* Nav items */}
      <nav className="flex flex-col flex-1" style={{ gap: 6 }}>
        {topItems.map((item) => {
          const active = isActive(item.id);
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`
                group flex flex-col items-center rounded-xl transition-all duration-150
                ${active
                  ? "bg-sidebar-active text-sidebar-text-active"
                  : "text-sidebar-text hover:bg-sidebar-hover hover:text-sidebar-text-active"
                }
              `}
              style={{ width: 64, padding: "10px 0", gap: 5 }}
              title={item.label}
            >
              <div className={`transition-colors ${active ? "text-accent" : ""}`}>
                {item.icon}
              </div>
              <span style={{ fontSize: 10, fontWeight: 500, lineHeight: 1.2 }}>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Bottom settings */}
      <button
        onClick={() => onNavigate("settings")}
        className={`
          flex flex-col items-center rounded-xl transition-all duration-150
          ${activeScreen === "settings"
            ? "bg-sidebar-active text-sidebar-text-active"
            : "text-sidebar-text hover:bg-sidebar-hover hover:text-sidebar-text-active"
          }
        `}
        style={{ width: 64, padding: "10px 0", gap: 5 }}
        title="Settings"
      >
        <div className={`transition-colors ${activeScreen === "settings" ? "text-accent" : ""}`}>
          <Settings size={20} />
        </div>
        <span style={{ fontSize: 10, fontWeight: 500, lineHeight: 1.2 }}>Settings</span>
      </button>
    </div>
  );
}
