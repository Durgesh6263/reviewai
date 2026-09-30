'use client';

import { useState, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Mail, Lock, Eye, EyeOff, User, Building, Loader2, CheckCircle2 } from 'lucide-react';
import { useAuth } from '@/lib/auth-provider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'react-hot-toast';

const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string(),
  full_name: z.string().min(2, 'Name must be at least 2 characters'),
  business_name: z.string().min(2, 'Business name must be at least 2 characters').optional(),
  terms: z.boolean().refine(val => val === true, 'You must accept the terms and conditions'),
}).refine(data => data.password === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

type RegisterForm = z.infer<typeof registerSchema>;

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { register: registerUser, isLoading: authLoading } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [passwordStrength, setPasswordStrength] = useState(0);

  const redirect = searchParams.get('redirect') || '/dashboard';

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      email: '',
      password: '',
      confirmPassword: '',
      full_name: '',
      business_name: '',
      terms: false,
    },
  });

  const password = watch('password');

  // Calculate password strength
  useState(() => {
    let strength = 0;
    if (password.length >= 8) strength += 1;
    if (/[A-Z]/.test(password)) strength += 1;
    if (/[a-z]/.test(password)) strength += 1;
    if (/[0-9]/.test(password)) strength += 1;
    if (/[^A-Za-z0-9]/.test(password)) strength += 1;
    setPasswordStrength(strength);
  });

  const onSubmit = async (data: RegisterForm) => {
    setIsSubmitting(true);
    try {
      await registerUser({
        email: data.email,
        password: data.password,
        full_name: data.full_name,
        business_name: data.business_name,
      });
      toast.success('Account created successfully!');
      router.push(redirect);
      router.refresh();
    } catch (error: any) {
      const errData = error.response?.data;
      const rawMsg = errData?.error?.message || errData?.message || (typeof errData?.error === 'string' ? errData.error : null) || error.message || 'Registration failed. Please try again.';
      const message = typeof rawMsg === 'string' ? rawMsg : JSON.stringify(rawMsg);
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const getStrengthColor = (strength: number) => {
    if (strength <= 1) return 'bg-error-500';
    if (strength <= 2) return 'bg-warning-500';
    if (strength <= 3) return 'bg-primary-500';
    return 'bg-success-500';
  };

  const getStrengthLabel = (strength: number) => {
    if (strength <= 1) return 'Weak';
    if (strength <= 2) return 'Fair';
    if (strength <= 3) return 'Good';
    return 'Strong';
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-secondary-50 dark:bg-secondary-950 px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2 mb-6">
            <div className="w-10 h-10 bg-primary-600 rounded-xl flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <span className="text-2xl font-bold text-secondary-900 dark:text-white">ReviewAI</span>
          </Link>
          <h1 className="text-3xl font-bold text-secondary-900 dark:text-white">Create your account</h1>
          <p className="text-secondary-600 dark:text-secondary-400 mt-2">
            Start collecting authentic Google reviews today
          </p>
        </div>

        <Card className="shadow-sm border-border/50">
          <CardHeader className="pb-4">
            <CardTitle className="text-xl">Sign up</CardTitle>
            <CardDescription>Enter your details to create your account</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="full_name">Full Name</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-secondary-400" />
                  <Input
                    id="full_name"
                    type="text"
                    placeholder="John Doe"
                    className="pl-10"
                    {...register('full_name')}
                    disabled={isSubmitting || authLoading}
                    autoComplete="name"
                  />
                </div>
                {errors.full_name && (
                  <p className="text-sm text-error-500">{errors.full_name.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="business_name">Business Name (Optional)</Label>
                <div className="relative">
                  <Building className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-secondary-400" />
                  <Input
                    id="business_name"
                    type="text"
                    placeholder="Your Business Name"
                    className="pl-10"
                    {...register('business_name')}
                    disabled={isSubmitting || authLoading}
                    autoComplete="organization"
                  />
                </div>
                <p className="text-sm text-secondary-500">
                  You can add this later if you prefer
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-secondary-400" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    className="pl-10"
                    {...register('email')}
                    disabled={isSubmitting || authLoading}
                    autoComplete="email"
                  />
                </div>
                {errors.email && (
                  <p className="text-sm text-error-500">{errors.email.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-secondary-400" />
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    className="pl-10 pr-10"
                    {...register('password')}
                    disabled={isSubmitting || authLoading}
                    autoComplete="new-password"
                    onChange={(e) => {
                      register('password').onChange(e);
                      const pwd = e.target.value;
                      let strength = 0;
                      if (pwd.length >= 8) strength += 1;
                      if (/[A-Z]/.test(pwd)) strength += 1;
                      if (/[a-z]/.test(pwd)) strength += 1;
                      if (/[0-9]/.test(pwd)) strength += 1;
                      if (/[^A-Za-z0-9]/.test(pwd)) strength += 1;
                      setPasswordStrength(strength);
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-secondary-400 hover:text-secondary-600"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
                {password && (
                  <div className="space-y-1">
                    <div className="h-1.5 bg-secondary-200 dark:bg-secondary-700 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all duration-300 ${getStrengthColor(passwordStrength)}`}
                        style={{ width: `${(passwordStrength / 5) * 100}%` }}
                      />
                    </div>
                    <p className="text-xs text-secondary-500">
                      Password strength: <span className="font-medium">{getStrengthLabel(passwordStrength)}</span>
                    </p>
                  </div>
                )}
                {errors.password && (
                  <p className="text-sm text-error-500">{errors.password.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-secondary-400" />
                  <Input
                    id="confirmPassword"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    className="pl-10"
                    {...register('confirmPassword')}
                    disabled={isSubmitting || authLoading}
                    autoComplete="new-password"
                  />
                </div>
                {errors.confirmPassword && (
                  <p className="text-sm text-error-500">{errors.confirmPassword.message}</p>
                )}
              </div>

              <div className="flex items-start space-x-3">
                <input
                  type="checkbox"
                  id="terms"
                  {...register('terms')}
                  className="mt-1 h-4 w-4 rounded border-secondary-300 text-primary-600 focus:ring-primary-500"
                  disabled={isSubmitting || authLoading}
                />
                <Label htmlFor="terms" className="text-sm text-secondary-600 dark:text-secondary-400 cursor-pointer">
                  I agree to the{' '}
                  <Link href="/terms" className="text-primary-600 hover:text-primary-500 underline">
                    Terms of Service
                  </Link>{' '}
                  and{' '}
                  <Link href="/privacy" className="text-primary-600 hover:text-primary-500 underline">
                    Privacy Policy
                  </Link>
                </Label>
              </div>
              {errors.terms && (
                <p className="text-sm text-error-500">{errors.terms.message}</p>
              )}

              <Button
                type="submit"
                className="w-full"
                size="lg"
                disabled={isSubmitting || authLoading}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating account...
                  </>
                ) : (
                  'Create account'
                )}
              </Button>
            </form>
          </CardContent>
          <CardFooter className="flex flex-col space-y-4 pt-4 border-t">
            <p className="text-center text-secondary-600 dark:text-secondary-400">
              Already have an account?{' '}
              <Link href="/login" className="text-primary-600 hover:text-primary-500 font-medium">
                Sign in
              </Link>
            </p>
          </CardFooter>
        </Card>

        {/* Benefits */}
        <div className="mt-8 grid grid-cols-3 gap-4 text-center">
          <div className="p-4 bg-white dark:bg-secondary-900 rounded-xl border border-border/50">
            <CheckCircle2 className="w-6 h-6 text-success-500 mx-auto mb-2" />
            <p className="text-sm font-medium text-secondary-900 dark:text-white">14-day free trial</p>
            <p className="text-xs text-secondary-500">No credit card required</p>
          </div>
          <div className="p-4 bg-white dark:bg-secondary-900 rounded-xl border border-border/50">
            <CheckCircle2 className="w-6 h-6 text-success-500 mx-auto mb-2" />
            <p className="text-sm font-medium text-secondary-900 dark:text-white">Cancel anytime</p>
            <p className="text-xs text-secondary-500">No long-term contracts</p>
          </div>
          <div className="p-4 bg-white dark:bg-secondary-900 rounded-xl border border-border/50">
            <CheckCircle2 className="w-6 h-6 text-success-500 mx-auto mb-2" />
            <p className="text-sm font-medium text-secondary-900 dark:text-white">Secure & private</p>
            <p className="text-xs text-secondary-500">Your data is protected</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Loading...</div>}>
      <RegisterForm />
    </Suspense>
  );
}