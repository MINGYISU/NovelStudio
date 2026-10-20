import { useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import {
  treeKey,
  useCreateNode,
  useDuplicateNode,
  useMoveNode,
  useRestoreNode,
  useTrashNode,
  useUpdateNode,
} from '../../api/nodes.ts';
import { checkMove, keyboardMoveTarget, type KeyboardMove } from '../../../shared/tree.ts';
import type { NodeKind, TreeNode } from '../../../shared/types.ts';
import { useWorkspaceStore } from '../../stores/workspace.ts';
import { childKindOf } from './build-items.ts';

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong.';
}

export interface TreeActions {
  move: (nodeId: string, parentId: string | null, index: number) => void;
  moveWithKey: (nodeId: string, move: KeyboardMove) => string | null;
  undoMove: () => void;
  createSibling: (node: TreeNode) => void;
  createChild: (node: TreeNode) => void;
  createAtRoot: (kind: NodeKind) => void;
  duplicate: (node: TreeNode) => void;
  rename: (nodeId: string, title: string) => void;
  setNumbered: (node: TreeNode, numbered: boolean) => void;
  trash: (node: TreeNode) => void;
}

/** All sidebar write actions. Failures surface as a notice; moves keep one level of undo. */
export function useTreeActions(bookId: string, nodes: readonly TreeNode[]): TreeActions {
  const navigate = useNavigate();
  const client = useQueryClient();
  const moveMutation = useMoveNode(bookId);
  const createMutation = useCreateNode(bookId);
  const duplicateMutation = useDuplicateNode(bookId);
  const updateMutation = useUpdateNode(bookId);
  const trashMutation = useTrashNode(bookId);
  const restoreMutation = useRestoreNode(bookId);
  const { notify, setLastMove, setPendingEditId } = useWorkspaceStore.getState();

  const fail = useCallback(
    (prefix: string) => (error: unknown) =>
      notify({ tone: 'error', message: `${prefix} ${messageOf(error)}` }),
    [notify],
  );

  return useMemo<TreeActions>(() => {
    // mutateAsync, not mutate: per-call callbacks of `mutate` are dropped when a newer call starts.
    // Read the cache, not the rendered prop: key repeat can outrun React's re-render after an optimistic move.
    const latest = () => client.getQueryData<TreeNode[]>(treeKey(bookId)) ?? nodes;

    const move: TreeActions['move'] = (nodeId, parentId, index) => {
      const current = latest();
      const node = current.find((n) => n.id === nodeId);
      if (!node) return;
      const siblings = current.filter((n) => n.parentId === node.parentId && n.deletedAt === null);
      const before = siblings
        .sort((a, b) => a.position - b.position)
        .findIndex((n) => n.id === nodeId);
      if (node.parentId === parentId && before === index) return;
      if (!checkMove(current, nodeId, parentId, index).ok) return;
      const previousUndo = useWorkspaceStore.getState().lastMove;
      setLastMove({ bookId, nodeId, parentId: node.parentId, index: before });
      moveMutation.mutateAsync({ id: nodeId, parentId, index }).catch((error: unknown) => {
        setLastMove(previousUndo);
        fail('The move was not saved and has been reverted.')(error);
      });
    };

    const open = (node: TreeNode) => {
      setPendingEditId(node.id);
      navigate(`/book/${bookId}/manuscript/${node.id}`, { replace: true });
    };

    return {
      move,
      moveWithKey: (nodeId, key) => {
        const target = keyboardMoveTarget(latest(), nodeId, key);
        if (!target) return null;
        move(nodeId, target.parentId, target.index);
        return target.parentId;
      },
      undoMove: () => {
        const last = useWorkspaceStore.getState().lastMove;
        if (!last || last.bookId !== bookId) return;
        setLastMove(null);
        moveMutation
          .mutateAsync({ id: last.nodeId, parentId: last.parentId, index: last.index })
          .catch(fail('Could not undo the move.'));
      },
      createSibling: (node) =>
        createMutation
          .mutateAsync({ kind: node.kind, parentId: node.parentId, index: node.position + 1 })
          .then(({ node: created }) => open(created))
          .catch(fail('Could not create the section.')),
      createChild: (node) => {
        const kind = childKindOf(node.kind);
        if (!kind) return;
        createMutation
          .mutateAsync({ kind, parentId: node.id })
          .then(({ node: created }) => open(created))
          .catch(fail('Could not create the section.'));
      },
      createAtRoot: (kind) =>
        createMutation
          .mutateAsync({ kind, parentId: null })
          .then(({ node: created }) => open(created))
          .catch(fail('Could not create the section.')),
      duplicate: (node) =>
        duplicateMutation
          .mutateAsync(node.id)
          .then(({ node: copy }) =>
            navigate(`/book/${bookId}/manuscript/${copy.id}`, { replace: true }),
          )
          .catch(fail('Could not duplicate the section.')),
      rename: (nodeId, title) => {
        const trimmed = title.trim();
        if (nodes.find((n) => n.id === nodeId)?.title === trimmed) return;
        updateMutation
          .mutateAsync({ id: nodeId, patch: { title: trimmed } })
          .catch(fail('The new title was not saved.'));
      },
      setNumbered: (node, numbered) =>
        updateMutation
          .mutateAsync({ id: node.id, patch: { numbered } })
          .catch(fail('Could not change numbering.')),
      trash: (node) =>
        trashMutation
          .mutateAsync(node.id)
          .then(() => {
            setLastMove(null);
            notify({
              tone: 'info',
              message: `Moved “${node.title || 'untitled section'}” to the trash.`,
              action: {
                label: 'Restore',
                run: () => {
                  restoreMutation
                    .mutateAsync(node.id)
                    .catch(fail('Could not restore the section.'));
                },
              },
            });
          })
          .catch(fail('Could not move the section to the trash.')),
    };
  }, [
    bookId,
    nodes,
    client,
    navigate,
    fail,
    notify,
    setLastMove,
    setPendingEditId,
    moveMutation,
    createMutation,
    duplicateMutation,
    updateMutation,
    trashMutation,
    restoreMutation,
  ]);
}
