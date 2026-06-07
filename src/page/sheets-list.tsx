import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

import {
  Box,
  CircularProgress,
  Typography,
  TextField,
  List,
  ListItem,
  ListItemText,
  ListItemButton,
  Checkbox,
  Button,
  Paper,
  InputAdornment,
} from '@mui/material';
import { Search, CompareArrows } from '@mui/icons-material';

import Header from '@/component/header';
import { listSheets, AuthError } from '@/lib/github-client';
import type { SheetMeta } from '@/lib/github-client';

const SheetsListPage = () => {
  const navigate = useNavigate();
  const [sheets, setSheets] = useState<SheetMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string[]>([]);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await listSheets();
        setSheets(data);
      } catch (err) {
        if (err instanceof AuthError) {
          void navigate('/viewer-auth');
          return;
        }
        setError('シート一覧の取得に失敗しました。');
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [navigate]);

  const filtered = useMemo(
    () =>
      sheets.filter((s) => s.title.toLowerCase().includes(query.toLowerCase())),
    [sheets, query],
  );

  const toggleSelect = (path: string) => {
    setSelected((prev) => {
      if (prev.includes(path)) return prev.filter((p) => p !== path);
      if (prev.length >= 2) return prev;
      return [...prev, path];
    });
  };

  const handleCompare = () => {
    if (selected.length === 2) {
      void navigate(`/compare?a=${encodeURIComponent(selected[0])}&b=${encodeURIComponent(selected[1])}`);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', flexDirection: 'column', gap: 2 }}>
        <Typography variant="h5">エラー</Typography>
        <Typography>{error}</Typography>
      </Box>
    );
  }

  return (
    <Box>
      <Header title="スキルシート一覧" />
      <Box sx={{ maxWidth: 800, mx: 'auto', p: 3 }}>
        <Box sx={{ display: 'flex', gap: 2, mb: 3, alignItems: 'center' }}>
          <TextField
            fullWidth
            placeholder="シート名で検索..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <Search />
                </InputAdornment>
              ),
            }}
          />
          {selected.length === 2 && (
            <Button
              variant="contained"
              startIcon={<CompareArrows />}
              onClick={handleCompare}
              sx={{ whiteSpace: 'nowrap' }}
            >
              比較
            </Button>
          )}
        </Box>

        {selected.length > 0 && selected.length < 2 && (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            比較するシートをもう1件選択してください
          </Typography>
        )}

        <Paper elevation={2}>
          <List disablePadding>
            {filtered.map((sheet, index) => (
              <ListItem
                key={sheet.path}
                disablePadding
                divider={index < filtered.length - 1}
                secondaryAction={
                  <Checkbox
                    edge="end"
                    checked={selected.includes(sheet.path)}
                    onChange={() => toggleSelect(sheet.path)}
                    disabled={!selected.includes(sheet.path) && selected.length >= 2}
                    aria-label={`${sheet.title}を比較選択`}
                  />
                }
              >
                <ListItemButton onClick={() => void navigate(`/view/${encodeURIComponent(sheet.path)}`)}>
                  <ListItemText
                    primary={sheet.title}
                    secondary={sheet.path}
                    primaryTypographyProps={{ fontWeight: 500 }}
                    secondaryTypographyProps={{ fontSize: '0.75rem' }}
                  />
                </ListItemButton>
              </ListItem>
            ))}
            {filtered.length === 0 && (
              <ListItem>
                <ListItemText primary="シートが見つかりません" />
              </ListItem>
            )}
          </List>
        </Paper>
      </Box>
    </Box>
  );
};

export default SheetsListPage;
