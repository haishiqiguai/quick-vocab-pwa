import { BarChart3, House, Settings } from 'lucide-react';
import type { ReactNode } from 'react';
import { NavLink } from '../lib/router';

const navItems = [
  { to: '/', label: '首页', subtitle: 'Home', icon: House, end: true },
  { to: '/dashboard', label: '数据', subtitle: 'Dashboard', icon: BarChart3 },
  { to: '/settings', label: '设置', subtitle: 'Settings', icon: Settings }
];

export function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell">
      <main className="page-area">{children}</main>
      <nav className="bottom-nav" aria-label="主导航">
        {navItems.map(({ to, label, subtitle, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <Icon size={21} strokeWidth={1.6} />
            <span>{label}</span>
            <small>{subtitle}</small>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
