import Link from 'next/link';
import { FileQuestion, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 px-4">
      <Card className="w-full max-w-md shadow-lg text-center border-slate-200 dark:border-slate-800">
        <CardHeader>
          <div className="w-14 h-14 bg-primary-100 dark:bg-primary-950/40 rounded-full flex items-center justify-center mx-auto mb-2 text-primary-600 dark:text-primary-400">
            <FileQuestion className="w-8 h-8" />
          </div>
          <CardTitle className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Page Not Found
          </CardTitle>
          <CardDescription className="text-sm text-slate-600 dark:text-slate-400">
            The page you are looking for does not exist or may have been moved.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Link href="/" className="inline-block w-full">
            <Button className="w-full flex items-center justify-center gap-2">
              <ArrowLeft className="w-4 h-4" />
              Return Home
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
