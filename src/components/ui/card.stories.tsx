import type { Meta, StoryObj } from '@storybook/nextjs';

import { Card, CardContent, CardHeader, CardTitle } from './card';

const meta = {
  title: 'UI/Card',
  component: Card,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
} satisfies Meta<typeof Card>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Card className="w-80">
      <CardHeader>
        <CardTitle>スキルシート</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground text-sm">エンジニアのスキルシートを表示します。</p>
      </CardContent>
    </Card>
  ),
};
