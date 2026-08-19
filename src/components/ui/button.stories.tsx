import type { Meta, StoryObj } from '@storybook/nextjs';

import { Button } from './button';

const meta = {
  title: 'UI/Button',
  component: Button,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['default', 'gradient', 'secondary', 'outline', 'ghost', 'destructive', 'link'],
    },
    size: { control: 'select', options: ['default', 'sm', 'lg', 'icon'] },
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { args: { children: 'ボタン', variant: 'default' } };
export const Gradient: Story = { args: { children: 'グラデーション', variant: 'gradient' } };
export const Secondary: Story = { args: { children: 'セカンダリ', variant: 'secondary' } };
export const Outline: Story = { args: { children: 'アウトライン', variant: 'outline' } };
export const Ghost: Story = { args: { children: 'ゴースト', variant: 'ghost' } };
export const Destructive: Story = { args: { children: '削除', variant: 'destructive' } };
export const Large: Story = { args: { children: '大きいボタン', size: 'lg' } };
export const Small: Story = { args: { children: '小さいボタン', size: 'sm' } };
export const Disabled: Story = { args: { children: '無効', disabled: true } };
