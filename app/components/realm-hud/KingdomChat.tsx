'use client';

import { useEffect, useRef, useState } from 'react';
import { MessageSquare, Send } from 'lucide-react';

import { useChat } from '@/lib/chat/useChat';
import { KINGDOMS, kingdomInk } from '@/lib/game/factions';
import { shortWallet } from '@/lib/game/units';
import { useGame } from '@/lib/store/game';

/**
 * Kingdom chat dock (docs/KINGDOM_UI.md §11.5): only your kingdom's members can read or post.
 * Bottom-left over the canvas; collapses to a pill. Typing never steers the warrior.
 */
export function KingdomChat() {
  const { messages, send, status, reason, faction } = useChat();
  const wallet = useGame((s) => s.wallet);
  const [open, setOpen] = useState(true);
  const [text, setText] = useState('');
  const [unread, setUnread] = useState(0);
  const list = useRef<HTMLDivElement>(null);
  const seen = useRef(0);

  useEffect(() => {
    if (open) {
      seen.current = messages.length;
      setUnread(0);
      const el = list.current;
      if (el) el.scrollTop = el.scrollHeight;
    } else setUnread(Math.max(0, messages.length - seen.current));
  }, [messages, open]);

  const submit = async () => {
    const t = text.trim();
    if (!t) return;
    setText('');
    try {
      await send(t);
    } catch (e) {
      setText(t);
      console.warn('[chat]', e);
    }
  };

  const ink = faction !== null ? kingdomInk(faction) : undefined;
  const title = faction !== null ? `${KINGDOMS[faction].name} council` : 'War council';

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="pointer-events-auto flex items-center gap-2 border border-border-default bg-background-panel/90 px-3 py-1.5 text-xs backdrop-blur-sm hover:border-border-active"
        style={{ color: ink }}
      >
        <MessageSquare className="h-3.5 w-3.5" /> {title}
        {unread > 0 && <span className="rounded-full bg-[var(--color-vermilion)] px-1.5 text-[10px] text-white">{unread}</span>}
      </button>
    );
  }

  return (
    <div className="pointer-events-auto flex w-[320px] flex-col border border-border-default bg-background-panel/92 backdrop-blur-sm" style={{ clipPath: 'polygon(10px 0, 100% 0, 100% 100%, 0 100%, 0 10px)' }}>
      <button onClick={() => setOpen(false)} className="flex items-center gap-2 border-b border-border-muted px-3 py-1.5 text-[11px] uppercase tracking-[0.2em] text-text-highlight">
        <MessageSquare className="h-3.5 w-3.5" />
        <span className="flex-1 text-left" style={{ color: ink }}>
          {title}
        </span>
        <span className="text-[10px] normal-case tracking-normal text-text-secondary">members only</span>
      </button>
      <div ref={list} className="h-40 space-y-1 overflow-y-auto px-3 py-2 text-[12px]">
        {status === 'unavailable' && <p className="text-xs text-text-secondary">{reason ?? 'Chat unavailable.'}</p>}
        {status === 'connecting' && <p className="animate-pulse text-xs text-text-secondary">Joining the council…</p>}
        {status === 'ready' && messages.length === 0 && <p className="text-xs text-text-secondary">Quiet in the council. Say where you'll stand.</p>}
        {messages.map((m) => (
          <div key={m.id} className={m.system ? 'text-[11px] italic text-text-secondary' : ''}>
            {!m.system && (
              <span className="mr-1 font-semibold" style={{ color: m.wallet === wallet ? '#a0670a' : ink }}>
                {m.wallet === wallet ? 'You' : shortWallet(m.wallet)}
              </span>
            )}
            <span className="text-text-primary">{m.text}</span>
          </div>
        ))}
      </div>
      <form
        className="flex items-center gap-1 border-t border-border-muted px-2 py-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') (e.target as HTMLInputElement).blur();
            e.stopPropagation();
          }}
          disabled={status !== 'ready'}
          placeholder={status === 'ready' ? 'Plan with your kingdom…' : 'Chat unavailable'}
          maxLength={280}
          className="min-w-0 flex-1 bg-transparent px-1 text-[12px] text-text-primary outline-none placeholder:text-text-secondary"
        />
        <button type="submit" disabled={status !== 'ready' || !text.trim()} className="p-1 text-text-secondary hover:text-text-highlight disabled:opacity-40" aria-label="Send">
          <Send className="h-3.5 w-3.5" />
        </button>
      </form>
    </div>
  );
}
