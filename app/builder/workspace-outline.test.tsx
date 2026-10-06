import { DndContext, KeyboardSensor, useSensor, useSensors } from '@dnd-kit/core';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { WorkspaceOutline } from './workspace-outline';

const items = [
  { id: 'project', title: '案件群', kind: '経歴', canMoveUp: false, canMoveDown: true },
  { id: 'text', title: '補足', kind: '本文', canMoveUp: true, canMoveDown: false },
];
describe('アウトラインの全ブロック並べ替え', () => {
  it('案件にもhandleを出し、全体境界の上下制約を守って実blockIDを渡す', () => {
    const move = vi.fn();
    const select = vi.fn();
    render(
      <DndContext>
        <WorkspaceOutline items={items} selectedId="project" onSelect={select} onMove={move} />
      </DndContext>,
    );
    expect(screen.getByRole('button', { name: '案件群をドラッグして移動' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '案件群を上へ移動' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '案件群を下へ移動' }));
    expect(move).toHaveBeenCalledWith('project', 'down');
    expect(select).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '本文: 補足' }));
    expect(select).toHaveBeenCalledWith('text');
  });
  it('同時mountするレールと通常outlineでdragIDが衝突せずdataに元blockIDを残す', async () => {
    const start = vi.fn();
    function Fixture() {
      const sensors = useSensors(useSensor(KeyboardSensor));
      return (
        <DndContext sensors={sensors} onDragStart={start}>
          <WorkspaceOutline items={items} selectedId="text" onSelect={vi.fn()} onMove={vi.fn()} />
          <WorkspaceOutline items={items} selectedId="text" onSelect={vi.fn()} onMove={vi.fn()} compact />
        </DndContext>
      );
    }
    render(<Fixture />);
    const handles = screen.getAllByRole('button', { name: '案件群をドラッグして移動' });
    handles[0].focus();
    fireEvent.keyDown(handles[0], { code: 'Space' });
    expect(start.mock.calls[0][0].active.data.current.blockId).toBe('project');
    const first = start.mock.calls[0][0].active.id;
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1));
    });
    fireEvent.keyDown(document, { code: 'Escape' });
    handles[1].focus();
    fireEvent.keyDown(handles[1], { code: 'Space' });
    expect(start.mock.calls[1][0].active.id).not.toBe(first);
    expect(start.mock.calls[1][0].active.data.current.blockId).toBe('project');
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1));
    });
    fireEvent.keyDown(document, { code: 'Escape' });
  });
});
