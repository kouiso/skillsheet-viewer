import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

import { ThemeModeProvider } from './context/theme-context';
import View from './page/view';
import ViewerAuth from './page/viewer-auth';

const App = () => (
  <ThemeModeProvider>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/viewer-auth" replace />} />
        <Route path="/viewer-auth" element={<ViewerAuth />} />
        <Route path="/view" element={<View />} />
      </Routes>
    </BrowserRouter>
  </ThemeModeProvider>
);

export default App;
