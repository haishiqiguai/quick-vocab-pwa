import { createContext, useCallback, useContext, useEffect, useMemo, useState, type MouseEvent, type ReactNode } from 'react';

interface LocationState { pathname: string; search: string }
type NavigateOptions = { replace?: boolean };
type Navigate = (target: string | number, options?: NavigateOptions) => void;

const RouterContext = createContext<{ location: LocationState; navigate: Navigate } | null>(null);

function currentLocation(): LocationState {
  return { pathname: window.location.pathname, search: window.location.search };
}

export function RouterProvider({ children }: { children: ReactNode }) {
  const [location, setLocation] = useState(currentLocation);
  useEffect(() => {
    const update = () => setLocation(currentLocation());
    window.addEventListener('popstate', update);
    return () => window.removeEventListener('popstate', update);
  }, []);

  const navigate = useCallback<Navigate>((target, options) => {
    if (typeof target === 'number') {
      window.history.go(target);
      return;
    }
    const url = new URL(target, window.location.origin);
    const next = `${url.pathname}${url.search}${url.hash}`;
    if (options?.replace) window.history.replaceState(null, '', next);
    else window.history.pushState(null, '', next);
    setLocation(currentLocation());
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, []);

  const value = useMemo(() => ({ location, navigate }), [location, navigate]);
  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>;
}

function useRouter() {
  const value = useContext(RouterContext);
  if (!value) throw new Error('Router hooks must be used inside RouterProvider');
  return value;
}

export function useNavigate(): Navigate {
  return useRouter().navigate;
}

export function useLocation(): LocationState {
  return useRouter().location;
}

export function useSearchParams(): readonly [URLSearchParams] {
  const { location } = useRouter();
  return useMemo(() => [new URLSearchParams(location.search)] as const, [location.search]);
}

export function NavLink({ to, end = false, className, children }: {
  to: string;
  end?: boolean;
  className?: string | ((state: { isActive: boolean }) => string);
  children: ReactNode;
}) {
  const { location, navigate } = useRouter();
  const isActive = end ? location.pathname === to : location.pathname === to || location.pathname.startsWith(`${to}/`);
  const resolvedClass = typeof className === 'function' ? className({ isActive }) : className;
  function follow(event: MouseEvent<HTMLAnchorElement>) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigate(to);
  }
  return <a href={to} className={resolvedClass} onClick={follow}>{children}</a>;
}
