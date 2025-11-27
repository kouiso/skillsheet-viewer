import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

import { ThemeProvider, CssBaseline } from '@mui/material';

import { ThemeModeProvider, useThemeMode } from './context/theme-context';
import View from './page/view';
import ViewerAuth from './page/viewer-auth';
import { createAppTheme } from './theme/theme';

const AppContent = () => {
  const { mode } = useThemeMode();
  const theme = createAppTheme(mode);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/viewer-auth" replace />} />
          <Route path="/viewer-auth" element={<ViewerAuth />} />
          <Route path="/view" element={<View />} />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
};

const App = () => (
  <ThemeModeProvider>
    <AppContent />
  </ThemeModeProvider>
);

export default App;
