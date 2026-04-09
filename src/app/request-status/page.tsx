'use client';

import { Suspense } from 'react';
import RequestStatusContent from './content';

export default function RequestStatusPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-gray-500">Loading...</div>}>
      <RequestStatusContent />
    </Suspense>
  );
}
