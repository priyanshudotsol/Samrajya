/**
 * Kingdom-private chat (docs/ARCHITECTURE.md §10.5). Messages are scoped to one kingdom of one
 * game; only current members can read or post. Mock mode keeps it in memory; on-chain games use
 * Supabase Realtime with a membership-gated token (lib/chat/supabase.ts).
 */
export interface ChatMessage {
  id: string;
  gameId: number;
  faction: number;
  /** base58 wallet of the sender. */
  wallet: string;
  text: string;
  /** unix ms */
  at: number;
  /** System lines (joins, plans) are rendered differently. */
  system?: boolean;
  /** A rally ping: a spot in a realm the sender wants the kingdom to gather at. */
  ping?: { territory: number; x: number; z: number };
}

export interface ChatRoom {
  /** Current messages (oldest first). */
  messages: ChatMessage[];
  /** Posts a message as the connected wallet. */
  send(text: string): Promise<void>;
  /** 'ready' | 'connecting' | 'unavailable' plus a reason for the HUD. */
  status: 'ready' | 'connecting' | 'unavailable';
  reason?: string;
}

export const MAX_CHAT = 200;
