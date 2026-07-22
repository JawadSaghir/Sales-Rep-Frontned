import type { IconName } from './icons';

export type Tab = 'home' | 'Roleplay History' | 'Analytics' | 'FAQ';

export interface NavItem {
  icon: IconName;
  label: Tab;
  badge?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { icon: 'roleplay', label: 'home' }, // rendered with a custom label in the sidebar
  { icon: 'history', label: 'Roleplay History' },
  { icon: 'analytics', label: 'Analytics' },
  { icon: 'faq', label: 'FAQ', badge: true },
];

/** Static, professionally-written FAQ content for the "FAQ" tab. */
export const FAQS: { q: string; a: string }[] = [
  {
    q: 'How do AI roleplays work?',
    a: 'You pick a call type, a buyer persona, and a difficulty level, then run a live voice conversation against an AI prospect trained on real objection patterns. The prospect pushes back exactly like a real buyer would, so you can rehearse handling objections before you face them on a live call.',
  },
  {
    q: 'What does the difficulty level change?',
    a: 'Difficulty adjusts the prospect’s baseline skepticism and how hard they hold their objections. On Easy they warm up quickly; on Hard they stay guarded, interrupt, and require you to earn every step of the conversation.',
  },
  {
    q: 'How is my performance scored?',
    a: 'After each call, the session is analysed for how well you surfaced needs, handled objections, and advanced the deal. Your scores roll up into the Analytics tab so you can see where the whole team is strongest and weakest.',
  },
  {
    q: 'Can I practise a specific objection?',
    a: 'Yes — choose the persona whose primary objection matches what you want to drill. Each persona card shows their headline objection so you can target the exact scenario you struggle with.',
  },
  {
    q: 'Is the conversation recorded?',
    a: 'A live transcript is generated during the call so you can review exactly what was said. Nothing is shared outside your team — it exists to power your own coaching and analytics.',
  },
];
