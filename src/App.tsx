import { Component, useEffect, type ErrorInfo, type ReactNode } from 'react';
import { Layout } from './components/Layout';
import { LoadingScreen } from './components/ui';
import { useApp } from './state/AppContext';
import { HomePage } from './pages/HomePage';
import { StudyPage } from './pages/StudyPage';
import { DashboardPage } from './pages/DashboardPage';
import { SettingsPage } from './pages/SettingsPage';
import { PlanPage } from './pages/PlanPage';
import { WordListPage } from './pages/WordListPage';
import { FavoritesPage } from './pages/FavoritesPage';
import { ImportPage } from './pages/ImportPage';
import { BackupPage } from './pages/BackupPage';
import { GuidePage } from './pages/GuidePage';
import { AboutPage } from './pages/AboutPage';
import { useLocation, useNavigate } from './lib/router';

class ErrorBoundary extends Component<{ children: ReactNode }, { error?: string }> {
  state: { error?: string } = {};
  static getDerivedStateFromError(error: Error) { return { error: error.message }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error(error, info); }
  render() {
    if (this.state.error) {
      return <div className="fatal-error"><h1>页面出了点问题</h1><p>{this.state.error}</p><button onClick={() => location.reload()}>重新加载</button></div>;
    }
    return this.props.children;
  }
}

function AppRoutes() {
  const { loading, error } = useApp();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const path = pathname !== '/' ? pathname.replace(/\/+$/, '') : '/';
  const knownPaths = ['/', '/dashboard', '/settings', '/study', '/plan', '/words', '/favorites', '/import', '/backup', '/guide', '/about'];

  useEffect(() => {
    if (!knownPaths.includes(path)) navigate('/', { replace: true });
  }, [navigate, path]);

  if (loading) return <LoadingScreen />;
  if (error) return <div className="fatal-error"><h1>初始化失败</h1><p>{error}</p><button onClick={() => location.reload()}>重试</button></div>;

  const page = path === '/dashboard' ? <DashboardPage />
    : path === '/settings' ? <SettingsPage />
      : path === '/study' ? <StudyPage />
        : path === '/plan' ? <PlanPage />
          : path === '/words' ? <WordListPage />
            : path === '/favorites' ? <FavoritesPage />
              : path === '/import' ? <ImportPage />
                : path === '/backup' ? <BackupPage />
                  : path === '/guide' ? <GuidePage />
                    : path === '/about' ? <AboutPage />
                      : <HomePage />;
  return ['/', '/dashboard', '/settings'].includes(path) ? <Layout>{page}</Layout> : page;
}

export default function App() {
  return <ErrorBoundary><AppRoutes /></ErrorBoundary>;
}
