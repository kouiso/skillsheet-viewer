'use client';

import { useState } from 'react';

import { Box, Container, Tabs, Tab, Button, TextField, Typography, Alert, Paper } from '@mui/material';
import { useRouter } from 'next/navigation';
import { signOut } from 'next-auth/react';

import { trpc } from '@/utils/trpc';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

const TabPanel = ({ children, value, index }: TabPanelProps) => (
  <div role="tabpanel" hidden={value !== index}>
    {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
  </div>
);

interface AdminDashboardProps {
  initialSkillSheet: {
    id: string;
    title: string;
    content: string;
    createdAt: Date;
    updatedAt: Date;
  } | null;
}

export default function AdminDashboard({ initialSkillSheet }: AdminDashboardProps) {
  const router = useRouter();
  const [tabValue, setTabValue] = useState(0);

  // Markdown編集 - SSR で取得した初期データを使用
  const [title, setTitle] = useState(initialSkillSheet?.title || '');
  const [content, setContent] = useState(initialSkillSheet?.content || '');
  const [message, setMessage] = useState('');

  // 認証コード管理
  const [newCode, setNewCode] = useState('');
  const [codeMessage, setCodeMessage] = useState('');

  // tRPC mutations only (queries are done via SSR)
  const saveSkillSheetMutation = trpc.skillSheet.save.useMutation({
    onSuccess: () => {
      setMessage('保存しました');
    },
    onError: (error) => {
      setMessage(error.message || '保存に失敗しました');
    },
  });

  const updateCodeMutation = trpc.viewerAuth.updateCode.useMutation({
    onSuccess: () => {
      setCodeMessage('認証コードを保存しました');
      setNewCode('');
    },
    onError: (error) => {
      setCodeMessage(error.message || '保存に失敗しました');
    },
  });

  const handleSaveSkillSheet = () => {
    setMessage('');
    saveSkillSheetMutation.mutate({ title, content });
  };

  const handleSaveCode = () => {
    setCodeMessage('');
    updateCodeMutation.mutate({ code: newCode });
  };

  const handleSignOut = async () => {
    await signOut({ redirect: false });
    router.push('/login');
  };

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4">管理画面</Typography>
        <Button variant="outlined" onClick={handleSignOut}>
          ログアウト
        </Button>
      </Box>

      <Paper>
        <Tabs value={tabValue} onChange={(_, newValue) => setTabValue(newValue)}>
          <Tab label="スキルシート編集" />
          <Tab label="認証コード管理" />
        </Tabs>

        <TabPanel value={tabValue} index={0}>
          {message && (
            <Alert severity="success" sx={{ mb: 2 }}>
              {message}
            </Alert>
          )}

          <TextField
            fullWidth
            label="タイトル"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            margin="normal"
            required
          />

          <TextField
            fullWidth
            label="内容（Markdown）"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            margin="normal"
            multiline
            rows={20}
            required
            helperText="Markdown形式で記述してください"
          />

          <Button
            variant="contained"
            onClick={handleSaveSkillSheet}
            disabled={saveSkillSheetMutation.isPending}
            sx={{ mt: 2 }}
          >
            {saveSkillSheetMutation.isPending ? '保存中...' : '保存'}
          </Button>
        </TabPanel>

        <TabPanel value={tabValue} index={1}>
          {codeMessage && (
            <Alert severity="success" sx={{ mb: 2 }}>
              {codeMessage}
            </Alert>
          )}

          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            閲覧者が入力する認証コードを設定します。 設定すると既存のコードは無効になります。
          </Typography>

          <TextField
            fullWidth
            label="新しい認証コード"
            value={newCode}
            onChange={(e) => setNewCode(e.target.value)}
            margin="normal"
            required
            type="password"
            helperText="半角英数字を推奨"
          />

          <Button
            variant="contained"
            onClick={handleSaveCode}
            disabled={updateCodeMutation.isPending || !newCode}
            sx={{ mt: 2 }}
          >
            {updateCodeMutation.isPending ? '保存中...' : '保存'}
          </Button>
        </TabPanel>
      </Paper>
    </Container>
  );
}
