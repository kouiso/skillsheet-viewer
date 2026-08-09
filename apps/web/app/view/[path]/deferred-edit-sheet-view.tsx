'use client';

import type { ComponentProps } from 'react';

import { trpc } from '@/lib/trpc-client';

import SheetViewClient from './sheet-view-client';

type Props = Omit<ComponentProps<typeof SheetViewClient>, 'canEdit' | 'reserveEditSlot'>;

/** 本文を先に描画し、編集者判定の完了後だけ編集導線を追加する。 */
export default function DeferredEditSheetView(props: Props) {
  const { data } = trpc.auth.status.useQuery();
  return <SheetViewClient {...props} canEdit={data?.canEdit ?? false} reserveEditSlot />;
}
