import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';

import { ThemeModeProvider } from './context/theme-context';
import Compare from './page/compare';
import SheetsList from './page/sheets-list';
import View from './page/view';
import ViewerAuth from './page/viewer-auth';

const App = () => (
  <ThemeModeProvider>
    <TooltipProvider delayDuration={200}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/viewer-auth" replace />} />
          <Route path="/viewer-auth" element={<ViewerAuth />} />
          <Route path="/view" element={<SheetsList />} />
          <Route path="/view/:path" element={<View />} />
          <Route path="/compare" element={<Compare />} />
        </Routes>
      </BrowserRouter>
      <Toaster />
    </TooltipProvider>
  </ThemeModeProvider>
);

export default App;
