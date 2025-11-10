import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

import { ThemeProvider, createTheme, CssBaseline } from '@mui/material';

import View from './page/view';
import ViewerAuth from './page/viewer-auth';

const theme = createTheme({
  palette: {
    mode: 'light',
  },
});

const App = () => (
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

export default App;
