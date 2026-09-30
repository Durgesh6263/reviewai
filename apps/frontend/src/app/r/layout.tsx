import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Customer Review Experience',
  description: 'Share your feedback and authentic experience.',
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
};

export default function CustomerReviewLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
