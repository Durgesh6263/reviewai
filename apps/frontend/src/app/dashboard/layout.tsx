'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Menu, X, ChevronLeft, ChevronRight, LogOut, LayoutDashboard, QrCode, BarChart2, Settings, Building2, Users, Bell, HelpCircle, CreditCard, Loader2, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAuth } from '@/lib/auth-provider';
import { onboardingTracker } from '@/lib/onboarding-tracker';
import { cn } from '@/lib/utils';

const navigation = [
  { name: 'Overview', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Businesses', href: '/dashboard/businesses', icon: Building2 },
  { name: 'QR Codes', href: '/dashboard/qr-codes', icon: QrCode },
  { name: 'Analytics', href: '/dashboard/analytics', icon: BarChart2 },
  { name: 'Team', href: '/dashboard/team', icon: Users },
  { name: 'Billing', href: '/dashboard/billing', icon: CreditCard },
  { name: 'Settings', href: '/dashboard/settings', icon: Settings },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout, isLoading: authLoading } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [checkingOnboarding, setCheckingOnboarding] = useState(true);
  const [onboardingComplete, setOnboardingComplete] = useState(false);

  // Check onboarding status on mount and when auth state changes
  useEffect(() => {
    const checkOnboarding = async () => {
      if (authLoading) return;

      if (!user) {
        router.push('/login?redirect=/dashboard');
        return;
      }

      // If user is admin, bypass business onboarding check
      if (user.role === 'admin') {
        setOnboardingComplete(true);
        setCheckingOnboarding(false);
        return;
      }

      try {
        const progress = await onboardingTracker.getProgress();

        if (progress?.current_step === 'completed') {
          setOnboardingComplete(true);
          setCheckingOnboarding(false);
        } else {
          // Redirect to onboarding if not complete
          router.push('/onboarding');
        }
      } catch (error) {
        console.error('Onboarding check failed:', error);
        // On error, allow access but log the error
        setOnboardingComplete(true);
        setCheckingOnboarding(false);
      }
    };

    checkOnboarding();
  }, [user, authLoading, router]);

  // Check if account is deactivated
  const isDeactivated = (user as any)?.account_status === 'deactivated' || (user as any)?.pilot_cohort === 'status:deactivated';
  if (user && isDeactivated && user.role !== 'admin') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-secondary-950 p-4">
        <div className="max-w-md w-full bg-secondary-900 border border-red-500/30 rounded-2xl p-8 text-center shadow-2xl">
          <div className="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-6">
            <ShieldAlert className="w-8 h-8 text-red-400" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Account Deactivated</h2>
          <p className="text-secondary-400 text-sm mb-6 leading-relaxed">
            Your account has been deactivated by an administrator. You no longer have access to protected ReviewAI features. Please contact support if you believe this is a mistake.
          </p>
          <Button
            onClick={() => logout()}
            className="w-full bg-red-600 hover:bg-red-700 text-white font-medium py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </Button>
        </div>
      </div>
    );
  }

  // Show loading while checking
  if (checkingOnboarding || authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-secondary-50 dark:bg-secondary-950">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-primary-600 mx-auto mb-4" />
          <p className="text-secondary-600 dark:text-secondary-400">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  // Don't render if onboarding not complete
  if (!onboardingComplete) {
    return null;
  }

  return (
    <div className="min-h-screen bg-secondary-50 dark:bg-secondary-950">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex flex-col bg-white dark:bg-secondary-900 border-r border-border transition-all duration-300 ease-in-out',
          collapsed ? 'w-20' : 'w-64',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}
        aria-label="Main navigation"
      >
        {/* Logo & Collapse toggle */}
        <div className="flex items-center justify-between h-16 px-4 border-b border-border">
          {!collapsed && (
            <Link href="/dashboard" className="flex items-center gap-2">
              <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center">
                <QrCode className="w-5 h-5 text-white" />
              </div>
              <span className="text-xl font-bold text-secondary-900 dark:text-white">ReviewAI</span>
            </Link>
          )}
          {/* Mobile close button */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden text-secondary-500 hover:text-secondary-700 dark:hover:text-secondary-300 ml-auto"
            aria-label="Close sidebar"
          >
            <X className="h-5 w-5" />
          </Button>
          {/* Desktop collapse toggle */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setCollapsed(!collapsed)}
            className={cn('hidden lg:flex text-secondary-500 hover:text-secondary-700 dark:hover:text-secondary-300', collapsed && 'ml-auto')}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <ChevronRight className="h-5 w-5" /> : <ChevronLeft className="h-5 w-5" />}
          </Button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto" role="navigation" aria-label="Dashboard">
          <ul className="space-y-1" role="list">
            {navigation.map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
              return (
                <li key={item.name}>
                  <Link
                    href={item.href}
                    onClick={() => setSidebarOpen(false)}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors duration-200 min-h-[44px]',
                      'group',
                      isActive
                        ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400'
                        : 'text-secondary-600 dark:text-secondary-400 hover:bg-secondary-100 dark:hover:bg-secondary-800 hover:text-secondary-900 dark:hover:text-white',
                      collapsed && 'justify-center px-2'
                    )}
                    aria-current={isActive ? 'page' : undefined}
                    title={collapsed ? item.name : undefined}
                  >
                    <item.icon className="h-5 w-5 flex-shrink-0" aria-hidden="true" />
                    {!collapsed && <span className="font-medium">{item.name}</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Bottom section */}
        <div className="p-4 border-t border-border mt-auto">
          {!collapsed ? (
            <Button
              variant="ghost"
              className="w-full justify-start gap-3 px-3 py-2.5 rounded-lg text-secondary-600 dark:text-secondary-400 hover:bg-secondary-100 dark:hover:bg-secondary-800 hover:text-secondary-900 dark:hover:text-white transition-colors duration-200"
              onClick={() => logout()}
            >
              <LogOut className="h-5 w-5 flex-shrink-0" />
              <span className="font-medium">Sign out</span>
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="icon"
              className="w-full text-secondary-500 hover:bg-secondary-100 dark:hover:bg-secondary-800 hover:text-secondary-700 dark:hover:text-secondary-300"
              onClick={() => logout()}
              title="Sign out"
            >
              <LogOut className="h-5 w-5" />
            </Button>
          )}
        </div>
      </aside>

      {/* Main content */}
      <div className={cn('transition-all duration-300', collapsed ? 'lg:pl-20' : 'lg:pl-64')}>
        {/* Top header */}
        <header className="sticky top-0 z-30 bg-white/80 dark:bg-secondary-900/80 backdrop-blur-sm border-b border-border">
          <div className="flex items-center justify-between h-16 px-4 lg:px-6">
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </Button>

            <div className="flex-1 lg:flex-none" />

            {/* Header actions */}
            <div className="flex items-center gap-2">
              {/* Notifications */}
              <Button variant="ghost" size="icon" className="relative">
                <Bell className="h-5 w-5" />
                <span className="absolute top-1 right-1 w-2 h-2 bg-error-500 rounded-full" />
              </Button>

              {/* Help */}
              <Button variant="ghost" size="icon">
                <HelpCircle className="h-5 w-5" />
              </Button>

              {/* User menu */}
              <div className="relative">
                <Button variant="ghost" className="gap-2 pr-3 pl-2">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={user?.avatar_url || ''} alt={user?.full_name || 'User'} />
                    <AvatarFallback className="text-xs">
                      {user?.full_name?.charAt(0).toUpperCase() || 'U'}
                    </AvatarFallback>
                  </Avatar>
                  {!collapsed && (
                    <span className="hidden sm:block font-medium text-secondary-900 dark:text-white">
                      {user?.full_name || 'User'}
                    </span>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="p-4 lg:p-6" role="main">
          {children}
        </main>
      </div>
    </div>
  );
}