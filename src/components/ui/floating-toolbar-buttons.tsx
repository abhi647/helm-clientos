'use client';

import * as React from 'react';

import { BoldIcon, ItalicIcon, StrikethroughIcon, UnderlineIcon } from 'lucide-react';
import { KEYS } from 'platejs';
import { useEditorReadOnly } from 'platejs/react';

import { CommentToolbarButton } from './comment-toolbar-button';
import { LinkToolbarButton } from './link-toolbar-button';
import { MarkToolbarButton } from './mark-toolbar-button';
import { SuggestionToolbarButton } from './suggestion-toolbar-button';
import { ToolbarGroup } from './toolbar';
import { TurnIntoToolbarButton } from './turn-into-toolbar-button';

/** Shown over a text selection: comment or suggest first, then quick formatting. */
export function FloatingToolbarButtons() {
  const readOnly = useEditorReadOnly();

  return (
    <>
      <ToolbarGroup>
        <CommentToolbarButton />
        <SuggestionToolbarButton />
      </ToolbarGroup>
      {!readOnly && (
        <ToolbarGroup>
          <TurnIntoToolbarButton />
          <MarkToolbarButton nodeType={KEYS.bold} tooltip="Bold (⌘+B)"><BoldIcon /></MarkToolbarButton>
          <MarkToolbarButton nodeType={KEYS.italic} tooltip="Italic (⌘+I)"><ItalicIcon /></MarkToolbarButton>
          <MarkToolbarButton nodeType={KEYS.underline} tooltip="Underline (⌘+U)"><UnderlineIcon /></MarkToolbarButton>
          <MarkToolbarButton nodeType={KEYS.strikethrough} tooltip="Strikethrough (⌘+⇧+X)"><StrikethroughIcon /></MarkToolbarButton>
          <LinkToolbarButton />
        </ToolbarGroup>
      )}
    </>
  );
}
