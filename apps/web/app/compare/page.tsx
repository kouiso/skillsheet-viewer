import { Suspense } from 'react';

import { Loader2 } from 'lucide-react';

import CompareClient from './compare-client';

const ComparePage = () => (
  <Suspense
    fallback={
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="size-10 animate-spin text-primary" />
      </div>
    }
  >
    <CompareClient />
  </Suspense>
);

export default ComparePage;
