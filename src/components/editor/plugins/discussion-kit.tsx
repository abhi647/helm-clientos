'use client';

import type { TComment } from '@/components/ui/comment';

import { createPlatePlugin } from 'platejs/react';

import { BlockDiscussion } from '@/components/ui/block-discussion';

export type TDiscussion = {
  id: string;
  comments: TComment[];
  createdAt: Date;
  isResolved: boolean;
  userId: string;
  documentContent?: string;
};

const BLOCK_SUGGESTION_SELECTOR = '[data-block-suggestion="true"]';

const getTargetElement = (target: EventTarget | null) => {
  if (target instanceof HTMLElement) return target;
  if (target instanceof Node) return target.parentElement;

  return null;
};

export const getDiscussionClickTarget = ({
  selector,
  target,
}: {
  selector: string;
  target: EventTarget | null;
}) => {
  const element = getTargetElement(target);

  if (!element) return null;

  return element.closest(selector) as HTMLElement | null;
};

export const getDiscussionBlockClickTarget = ({
  selector = BLOCK_SUGGESTION_SELECTOR,
  target,
}: {
  selector?: string;
  target: EventTarget | null;
}) =>
  getDiscussionClickTarget({
    selector,
    target,
  });

export type DiscussionUser = { id: string; avatarUrl: string; name: string; hue?: number }

// This plugin is purely UI. It's only used to store the discussions and users data
export const discussionPlugin = createPlatePlugin({
  key: 'discussion',
  options: {
    // filled by the page editor: the signed-in person, everyone on the project, and the saved threads
    currentUserId: '',
    discussions: [] as TDiscussion[],
    users: {} as Record<string, DiscussionUser>,
  },
})
  .configure({
    render: { aboveNodes: BlockDiscussion },
  })
  .extendSelectors(({ getOption }) => ({
    currentUser: () => getOption('users')[getOption('currentUserId')],
    user: (id: string) => getOption('users')[id],
  }));

export const DiscussionKit = [discussionPlugin];
