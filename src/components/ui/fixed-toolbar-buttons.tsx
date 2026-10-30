'use client';

import * as React from 'react';

import { BoldIcon, HighlighterIcon, ItalicIcon, StrikethroughIcon, UnderlineIcon } from 'lucide-react';
import { KEYS } from 'platejs';
import { useEditorReadOnly } from 'platejs/react';

import { CommentToolbarButton } from './comment-toolbar-button';
import { RedoToolbarButton, UndoToolbarButton } from './history-toolbar-button';
import { IndentToolbarButton, OutdentToolbarButton } from './indent-toolbar-button';
import { LinkToolbarButton } from './link-toolbar-button';
import { BulletedListToolbarButton, NumberedListToolbarButton, TodoListToolbarButton } from './list-toolbar-button';
import { MarkToolbarButton } from './mark-toolbar-button';
import { ModeToolbarButton } from './mode-toolbar-button';
import { TableToolbarButton } from './table-toolbar-button';
import { ToolbarGroup } from './toolbar';
import { TurnIntoToolbarButton } from './turn-into-toolbar-button';

/** Helm's document toolbar: text style, lists, a table, links, comments, and Editing / Suggesting / Viewing. */
export function FixedToolbarButtons({ suggestOnly = false }: { suggestOnly?: boolean }) {
  const readOnly = useEditorReadOnly();

  return (
    <div className="flex w-full">
      {!readOnly && (
        <>
          <ToolbarGroup>
            <UndoToolbarButton />
            <RedoToolbarButton />
          </ToolbarGroup>

          <ToolbarGroup>
            <TurnIntoToolbarButton />
          </ToolbarGroup>

          <ToolbarGroup>
            <MarkToolbarButton nodeType={KEYS.bold} tooltip="Bold (⌘+B)"><BoldIcon /></MarkToolbarButton>
            <MarkToolbarButton nodeType={KEYS.italic} tooltip="Italic (⌘+I)"><ItalicIcon /></MarkToolbarButton>
            <MarkToolbarButton nodeType={KEYS.underline} tooltip="Underline (⌘+U)"><UnderlineIcon /></MarkToolbarButton>
            <MarkToolbarButton nodeType={KEYS.strikethrough} tooltip="Strikethrough (⌘+⇧+X)"><StrikethroughIcon /></MarkToolbarButton>
            <MarkToolbarButton nodeType={KEYS.highlight} tooltip="Highlight"><HighlighterIcon /></MarkToolbarButton>
          </ToolbarGroup>

          <ToolbarGroup>
            <NumberedListToolbarButton />
            <BulletedListToolbarButton />
            <TodoListToolbarButton />
            <OutdentToolbarButton />
            <IndentToolbarButton />
          </ToolbarGroup>

          <ToolbarGroup>
            <LinkToolbarButton />
            <TableToolbarButton />
          </ToolbarGroup>
        </>
      )}

      <div className="grow" />

      <ToolbarGroup>
        <CommentToolbarButton />
        {/* customers always suggest; only the Seven Billion team switches between editing and suggesting */}
        {suggestOnly ? null : <ModeToolbarButton />}
      </ToolbarGroup>
    </div>
  );
}
