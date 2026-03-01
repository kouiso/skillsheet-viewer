import { useState } from 'react';

import {
  Box,
  Typography,
  List,
  ListItem,
  ListItemButton,
  IconButton,
  Collapse,
  useTheme,
  useMediaQuery,
  Drawer,
} from '@mui/material';
import { MenuBook, ExpandLess, ExpandMore, Menu as MenuIcon, Close } from '@mui/icons-material';
import { motion, AnimatePresence } from 'framer-motion';

interface Heading {
  id: string;
  text: string;
  level: number;
}

interface TableOfContentsProps {
  headings: Heading[];
  activeId: string;
  onHeadingClick: (id: string) => void;
}

const MAX_HEADING_LEVEL_INDENT = 2;
const SIDEBAR_WIDTH = 280;
const LARGE_FONT_SIZE = 0.95;
const SMALL_FONT_SIZE = 0.875;
const FONT_WEIGHT_BOLD = 600;
const FONT_WEIGHT_NORMAL = 400;

const TableOfContents = ({ headings, activeId, onHeadingClick }: TableOfContentsProps) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const toggleCollapse = () => {
    setIsCollapsed(!isCollapsed);
  };

  const handleMobileToggle = () => {
    setMobileOpen(!mobileOpen);
  };

  const handleHeadingClick = (id: string) => {
    onHeadingClick(id);
    if (isMobile) {
      setMobileOpen(false);
    }
  };

  const tocContent = (
    <Box
      component={motion.div}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      sx={{
        width: SIDEBAR_WIDTH,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: theme.palette.background.paper,
        borderRight: !isMobile ? `1px solid ${theme.palette.divider}` : 'none',
      }}
    >
      {/* ヘッダー */}
      <Box
        sx={{
          p: 2,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: `1px solid ${theme.palette.divider}`,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <MenuBook color="primary" />
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            目次
          </Typography>
        </Box>
        <Box>
          {!isMobile && (
            <IconButton
              size="small"
              onClick={toggleCollapse}
              component={motion.button}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.95 }}
              aria-label={isCollapsed ? '展開' : '折りたたむ'}
            >
              {isCollapsed ? <ExpandMore /> : <ExpandLess />}
            </IconButton>
          )}
          {isMobile && (
            <IconButton
              size="small"
              onClick={handleMobileToggle}
              component={motion.button}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.95 }}
              aria-label="閉じる"
            >
              <Close />
            </IconButton>
          )}
        </Box>
      </Box>

      {/* 目次リスト */}
      <Collapse in={!isCollapsed} timeout="auto" unmountOnExit>
        <Box sx={{ overflowY: 'auto', flex: 1, p: 1 }}>
          <List dense>
            <AnimatePresence>
              {headings.map((heading, index) => {
                const isActive = heading.id === activeId;

                return (
                  <motion.div
                    key={heading.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.2, delay: index * 0.02 }}
                  >
                    <ListItem disablePadding sx={{ pl: (heading.level - 1) * MAX_HEADING_LEVEL_INDENT }}>
                      <ListItemButton
                        onClick={() => handleHeadingClick(heading.id)}
                        selected={isActive}
                        component={motion.div}
                        whileHover={{ x: 4 }}
                        sx={{
                          borderRadius: 1,
                          mb: 0.5,
                          transition: 'all 0.2s ease',
                          backgroundColor: isActive ? theme.palette.primary.main : 'transparent',
                          color: isActive ? theme.palette.primary.contrastText : theme.palette.text.primary,
                          '&:hover': {
                            backgroundColor: isActive
                              ? theme.palette.primary.dark
                              : theme.palette.action.hover,
                          },
                          '&.Mui-selected': {
                            backgroundColor: theme.palette.primary.main,
                            '&:hover': {
                              backgroundColor: theme.palette.primary.dark,
                            },
                          },
                        }}
                      >
                        <Typography
                          variant="body2"
                          sx={{
                            fontSize: heading.level === 1 ? `${LARGE_FONT_SIZE}rem` : `${SMALL_FONT_SIZE}rem`,
                            fontWeight:
                              heading.level === 1 || isActive ? FONT_WEIGHT_BOLD : FONT_WEIGHT_NORMAL,
                            transition: 'all 0.2s ease',
                          }}
                        >
                          {heading.text}
                        </Typography>
                      </ListItemButton>
                    </ListItem>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </List>
        </Box>
      </Collapse>
    </Box>
  );

  // モバイル表示
  if (isMobile) {
    return (
      <>
        {/* モバイルメニューボタン */}
        <IconButton
          onClick={handleMobileToggle}
          component={motion.button}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.95 }}
          sx={{
            position: 'fixed',
            bottom: 16,
            right: 16,
            backgroundColor: theme.palette.primary.main,
            color: theme.palette.primary.contrastText,
            zIndex: 1200,
            boxShadow: theme.shadows[4],
            '&:hover': {
              backgroundColor: theme.palette.primary.dark,
            },
          }}
          aria-label="目次を開く"
        >
          <MenuIcon />
        </IconButton>

        {/* モバイルドロワー */}
        <Drawer
          anchor="left"
          open={mobileOpen}
          onClose={handleMobileToggle}
          ModalProps={{
            keepMounted: true, // Better open performance on mobile.
          }}
          sx={{
            '& .MuiDrawer-paper': {
              width: SIDEBAR_WIDTH,
            },
            '@media print': {
              display: 'none',
            },
          }}
        >
          {tocContent}
        </Drawer>
      </>
    );
  }

  // デスクトップ表示
  return (
    <Box
      className="no-print"
      sx={{
        width: isCollapsed ? 'auto' : SIDEBAR_WIDTH,
        position: 'fixed',
        height: 'calc(100vh - 64px)', // AppBarの高さを引く
        top: 64,
        left: 0,
        transition: 'width 0.3s ease',
        zIndex: 1000,
        '@media print': {
          display: 'none !important',
        },
      }}
    >
      {tocContent}
    </Box>
  );
};

export default TableOfContents;
