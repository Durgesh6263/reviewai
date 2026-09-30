'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Menu,
  X,
  ChevronLeft,
  ChevronRight,
  LogOut,
  LayoutDashboard,
  Users,
  BarChart2,
  Sparkles,
  QrCode,
  CreditCard,
  Activity,
  ShieldAlert,
  Settings,
  Shield,
  Search,
  Loader2,
  Building2,
  ExternalLink,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAuth } from '@/lib/auth-provider';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api-client';

const navigation = [
  { name: 'Dashboard', href: '/admin', icon: LayoutDashboard },
  { name: 'Clients', href: '/admin/clients', icon: Users },
  { name: 'Usage', href: '/admin/usage', icon: BarChart2 },
  { name: 'AI Usage', href: '/admin/ai-usage', icon: Sparkles },
  { name: 'QR & Reviews', href: '/admin/qr-reviews', icon: QrCode },
  { name: 'Subscriptions', href: '/admin/subscriptions', icon: CreditCard },
  { name: 'Activity', href: '/admin/activity', icon: Activity },
  { name: 'System Health', href: '/admin/system', icon: ShieldAlert },
  { name: 'Settings', href: '/admin/settings', icon: Settings },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout, isLoading } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  // Global search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<{ businesses: any[]; users: any[] } | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  // Close search dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setSearchOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Global search handler
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults(null);
      setSearchOpen(false);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        setIsSearching(true);
        const res = await api.get<{ data: { businesses: any[]; users: any[] } }>(`/admin/search?q=${encodeURIComponent(searchQuery.trim())}`);
        setSearchResults(res.data);
        setSearchOpen(true);
      } catch (e) {
        console.error('Admin search error:', e);
      } finally {
        setIsSearching(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // 1. If currently on /admin/login, render without sidebar or authentication blocker
  if (pathname === '/admin/login') {
    return <>{children}</>;
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary-500" />
          <p className="text-sm text-slate-400">Verifying administrator authorization...</p>
        </div>
      </div>
    );
  }

  // Not logged in -> redirect to /admin/login
  if (!user) {
    if (typeof window !== 'undefined') {
      router.push('/admin/login');
    }
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white">
        <div className="text-center">
          <Shield className="h-12 w-12 text-primary-500 mx-auto mb-3" />
          <p className="text-slate-400">Redirecting to administrator login...</p>
        </div>
      </div>
    );
  }

  // Logged in but not admin role
  if (user.role !== 'admin') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white p-4">
        <div className="max-w-md w-full text-center bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl">
          <div className="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/20 text-red-500 flex items-center justify-center mx-auto mb-4">
            <Shield className="h-8 w-8" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Access Denied</h1>
          <p className="text-slate-400 text-sm mb-6 leading-relaxed">
            The ReviewAI Control Panel is restricted to platform owners. Your account (<span className="text-slate-200 font-medium">{user.email}</span>) does not possess administrative privileges.
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <Button
              className="flex-1 bg-primary-600 hover:bg-primary-500 text-white"
              onClick={() => router.push('/dashboard')}
            >
              Return to Business Dashboard
            </Button>
            <Button
              variant="outline"
              className="flex-1 border-slate-700 text-slate-300 hover:bg-slate-800"
              onClick={async () => {
                await logout();
                router.push('/admin/login');
              }}
            >
              Switch Account
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex flex-col bg-slate-900/95 border-r border-slate-800 backdrop-blur-xl transition-all duration-300 ease-in-out',
          collapsed ? 'w-20' : 'w-64',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}
        aria-label="Admin navigation"
      >
        {/* Logo & Collapse toggle */}
        <div className="flex items-center justify-between h-16 px-4 border-b border-slate-800/80">
          {!collapsed ? (
            <Link href="/admin" className="flex items-center gap-2.5">
              <div className="w-8 h-8 bg-gradient-to-br from-primary-500 to-indigo-600 rounded-lg flex items-center justify-center shadow-md shadow-primary-500/20">
                <Shield className="w-4 h-4 text-white" />
              </div>
              <div className="flex flex-col">
                <span className="text-base font-bold text-white leading-tight">ReviewAI</span>
                <span className="text-[10px] uppercase tracking-wider font-semibold text-primary-400">Owner Admin</span>
              </div>
            </Link>
          ) : (
            <div className="w-8 h-8 mx-auto bg-gradient-to-br from-primary-500 to-indigo-600 rounded-lg flex items-center justify-center">
              <Shield className="w-4 h-4 text-white" />
            </div>
          )}

          {/* Mobile close */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden text-slate-400 hover:text-white hover:bg-slate-800 ml-auto"
            aria-label="Close sidebar"
          >
            <X className="h-5 w-5" />
          </Button>

          {/* Desktop collapse toggle */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setCollapsed(!collapsed)}
            className={cn('hidden lg:flex text-slate-400 hover:text-white hover:bg-slate-800', collapsed && 'ml-auto')}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </Button>
        </div>

        {/* Navigation list */}
        <nav className="flex-1 p-3 space-y-1.5 overflow-y-auto" role="navigation" aria-label="Admin dashboard">
          <ul className="space-y-1" role="list">
            {navigation.map((item) => {
              const isActive = item.href === '/admin'
                ? pathname === '/admin'
                : pathname === item.href || pathname.startsWith(item.href + '/');

              return (
                <li key={item.name}>
                  <Link
                    href={item.href}
                    onClick={() => setSidebarOpen(false)}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 text-sm font-medium',
                      isActive
                        ? 'bg-primary-500/15 text-primary-400 border border-primary-500/30 shadow-sm shadow-primary-500/10'
                        : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/60 border border-transparent',
                      collapsed && 'justify-center px-2'
                    )}
                    aria-current={isActive ? 'page' : undefined}
                    title={collapsed ? item.name : undefined}
                  >
                    <item.icon className={cn('h-4 w-4 flex-shrink-0', isActive ? 'text-primary-400' : 'text-slate-400')} />
                    {!collapsed && <span>{item.name}</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Bottom Profile / Sign Out */}
        <div className="p-3 border-t border-slate-800/80 bg-slate-900/50">
          {!collapsed ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2.5 px-2 py-1.5">
                <Avatar className="h-8 w-8 border border-slate-700">
                  <AvatarImage src={user?.avatar_url || ''} alt={user?.full_name || 'Admin'} />
                  <AvatarFallback className="bg-primary-950 text-primary-300 text-xs font-bold">
                    {user?.full_name?.charAt(0).toUpperCase() || 'A'}
                  </AvatarFallback>
                </Avatar>
                <div className="flex flex-col min-w-0 flex-1">
                  <span className="text-xs font-semibold text-slate-200 truncate">{user?.full_name || 'Platform Admin'}</span>
                  <span className="text-[11px] text-slate-500 truncate">{user?.email}</span>
                </div>
              </div>

              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start gap-2.5 text-slate-400 hover:text-red-400 hover:bg-red-500/10 text-xs rounded-lg"
                onClick={async () => {
                  await logout();
                  router.push('/admin/login');
                }}
              >
                <LogOut className="h-4 w-4" />
                <span>Sign Out</span>
              </Button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                className="text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg h-9 w-9"
                onClick={async () => {
                  await logout();
                  router.push('/admin/login');
                }}
                title="Sign out"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      </aside>

      {/* Main Content Area */}
      <div className={cn('flex-1 flex flex-col min-w-0 transition-all duration-300', collapsed ? 'lg:pl-20' : 'lg:pl-64')}>
        {/* Top Header */}
        <header className="sticky top-0 z-30 h-16 bg-slate-900/80 backdrop-blur-xl border-b border-slate-800 flex items-center justify-between px-4 lg:px-6 gap-4">
          <div className="flex items-center gap-3 flex-1 max-w-lg">
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden text-slate-400 hover:text-white"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </Button>

            {/* Section 12: Global Admin Search */}
            <div ref={searchRef} className="relative w-full">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Global search: client name, email, ID, category..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onFocus={() => {
                    if (searchResults) setSearchOpen(true);
                  }}
                  className="w-full h-9 pl-9 pr-8 bg-slate-950/70 border border-slate-800 focus:border-primary-500 rounded-xl text-xs text-white placeholder:text-slate-500 focus:outline-none transition-colors"
                />
                {isSearching && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-primary-400 animate-spin" />
                )}
              </div>

              {/* Search Dropdown Results */}
              {searchOpen && searchResults && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl overflow-hidden z-50 max-h-80 overflow-y-auto">
                  {searchResults.businesses.length === 0 && searchResults.users.length === 0 ? (
                    <div className="p-4 text-center text-xs text-slate-500">
                      No matching clients or users found.
                    </div>
                  ) : (
                    <div className="p-2 space-y-2">
                      {searchResults.businesses.length > 0 && (
                        <div>
                          <span className="px-2 py-1 text-[10px] uppercase font-bold tracking-wider text-slate-400">
                            Businesses ({searchResults.businesses.length})
                          </span>
                          <div className="mt-1 space-y-1">
                            {searchResults.businesses.map((b) => (
                              <button
                                key={b.id}
                                onClick={() => {
                                  setSearchOpen(false);
                                  router.push(`/admin/clients/${b.id}`);
                                }}
                                className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-800/80 transition-colors flex items-center justify-between text-xs"
                              >
                                <div className="flex items-center gap-2">
                                  <Building2 className="w-3.5 h-3.5 text-primary-400" />
                                  <span className="font-medium text-white">{b.name}</span>
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 uppercase">
                                    {b.category}
                                  </span>
                                </div>
                                <span className={cn('text-[10px] px-1.5 py-0.5 rounded', b.status === 'active' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400')}>
                                  {b.status}
                                </span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {searchResults.users.length > 0 && (
                        <div className="pt-2 border-t border-slate-800/80">
                          <span className="px-2 py-1 text-[10px] uppercase font-bold tracking-wider text-slate-400">
                            Users / Owners ({searchResults.users.length})
                          </span>
                          <div className="mt-1 space-y-1">
                            {searchResults.users.map((u) => (
                              <div
                                key={u.id}
                                className="px-3 py-2 rounded-lg hover:bg-slate-800/40 text-xs flex items-center justify-between"
                              >
                                <div>
                                  <div className="font-medium text-slate-200">{u.name}</div>
                                  <div className="text-[11px] text-slate-500">{u.email}</div>
                                </div>
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                                  {u.role}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Right Header Actions */}
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard"
              className="hidden sm:inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white px-2.5 py-1.5 rounded-lg border border-slate-800 hover:bg-slate-800/60 transition-colors"
            >
              <span>Owner Dashboard</span>
              <ExternalLink className="w-3 h-3" />
            </Link>

            <div className="flex items-center gap-2 pl-2 border-l border-slate-800">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" title="System Operational" />
              <span className="text-xs text-slate-400 font-medium hidden md:inline">Admin Mode</span>
            </div>
          </div>
        </header>

        {/* Page Main Content */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8" role="main">
          {children}
        </main>
      </div>
    </div>
  );
}