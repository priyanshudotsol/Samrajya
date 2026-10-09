import { Connection } from '@solana/web3.js';

export const BASE_RPC = process.env.NEXT_PUBLIC_RPC || 'https://api.devnet.solana.com';
export const ER_RPC = process.env.NEXT_PUBLIC_ER_RPC || 'https://devnet-as.magicblock.app';
export const ER_WS = process.env.NEXT_PUBLIC_ER_WS || 'wss://devnet-as.magicblock.app';
export const PROGRAM_ID = process.env.NEXT_PUBLIC_PROGRAM_ID || '';
/** Game to show when the registry can't be read (the app otherwise follows the newest war). */
export const GAME_ID = Number(process.env.NEXT_PUBLIC_GAME_ID || 1);

let activeGame = GAME_ID;
/** The war the app is showing (set by the feed from the on-chain registry). */
export const activeGameId = () => activeGame;
export function setActiveGameId(id: number) {
  activeGame = id;
}

let base: Connection | null = null;
let er: Connection | null = null;

/** Solana devnet (base layer): join / delegate / withdraw / claim. */
export function baseConnection(): Connection {
  return (base ??= new Connection(BASE_RPC, 'confirmed'));
}

/** MagicBlock Ephemeral Rollup: enlist / allocate / switch / leave / resolve + Game subscription. */
export function erConnection(): Connection {
  return (er ??= new Connection(ER_RPC, { commitment: 'confirmed', wsEndpoint: ER_WS }));
}
