import { ArrowLeft, ChevronRight } from 'lucide-react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { useNavigate } from '../lib/router';

export function PageHeader({ title, subtitle, back = false, action }: {
  title: string;
  subtitle?: string;
  back?: boolean;
  action?: ReactNode;
}) {
  const navigate = useNavigate();
  return (
    <header className="page-header">
      <div className="header-side">
        {back && <button className="icon-button" onClick={() => navigate(-1)} aria-label="返回"><ArrowLeft /></button>}
      </div>
      <div className="header-title"><strong>{title}</strong>{subtitle && <span>{subtitle}</span>}</div>
      <div className="header-side right">{action}</div>
    </header>
  );
}

export function Button({ className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={`button ${className}`} {...props} />;
}

export function SettingsLink({ icon, title, subtitle, onClick }: {
  icon: ReactNode;
  title: string;
  subtitle: string;
  onClick: () => void;
}) {
  return (
    <button className="settings-link" onClick={onClick}>
      <span className="settings-icon">{icon}</span>
      <span><strong>{title}</strong><small>{subtitle}</small></span>
      <ChevronRight size={18} />
    </button>
  );
}

export function EmptyState({ title, detail }: { title: string; detail: string }) {
  return <div className="empty-state"><strong>{title}</strong><p>{detail}</p></div>;
}

export function LoadingScreen() {
  return <div className="loading-screen"><div className="brand-mark">QV</div><p>正在准备词库…</p></div>;
}
