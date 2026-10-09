import { AnchorProvider, BN, Program, type Wallet } from '@coral-xyz/anchor';
import { Keypair, PublicKey } from '@solana/web3.js';

import type { Samrajya } from './idl/samrajya';
import idl from './idl/samrajya.json';
import { activeGameId, baseConnection, erConnection, PROGRAM_ID } from './connections';

/** Delegation program that owns accounts while they live on the ER. */
export const DELEGATION_PROGRAM_ID = new PublicKey('DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh');
/** Devnet ER validator (Asia, matches devnet-as.magicblock.app); local stack uses mAGic... */
export const ER_VALIDATOR = new PublicKey(
  process.env.NEXT_PUBLIC_ER_VALIDATOR || 'MAS1Dt9qreoRMQ14YQuhg8UTZMMzDdKhmkZMECCzk57',
);
/** VRF oracle queue on the ER. */
export const VRF_QUEUE = new PublicKey(
  process.env.NEXT_PUBLIC_VRF_QUEUE || '5hBR571xnXppuCPveTrctfTU7tJLSN94nq7kv7FRK5Tc',
);

export const programId = new PublicKey(PROGRAM_ID || (idl as { address: string }).address);
const theIdl = { ...(idl as object), address: programId.toBase58() } as Samrajya;

/** Read-only wallet for programs that only fetch/decode or build instructions. */
const readOnly: Wallet = {
  publicKey: Keypair.generate().publicKey,
  payer: Keypair.generate(),
  signTransaction: async (t) => t,
  signAllTransactions: async (t) => t,
};

let cached: { base: Program<Samrajya>; er: Program<Samrajya> } | null = null;

/** Programs bound to the base layer and the ER (used to build instructions and decode accounts). */
export function programs() {
  if (!cached) {
    cached = {
      base: new Program<Samrajya>(theIdl, new AnchorProvider(baseConnection(), readOnly, { commitment: 'confirmed' })),
      er: new Program<Samrajya>(theIdl, new AnchorProvider(erConnection(), readOnly, { commitment: 'processed' })),
    };
  }
  return cached;
}

export function registryPda() {
  return PublicKey.findProgramAddressSync([Buffer.from('registry')], programId)[0];
}

/** Id of the newest war from the on-chain registry, or null if no war was ever opened. */
export async function latestGameId(): Promise<number | null> {
  const info = await baseConnection().getAccountInfo(registryPda(), 'confirmed');
  if (!info) return null;
  const r = programs().base.coder.accounts.decode('registry', info.data) as { latestGame: BN };
  return Number(r.latestGame.toString());
}

export function gamePda(gameId = activeGameId()) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('game'), new BN(gameId).toArrayLike(Buffer, 'le', 8)],
    programId,
  )[0];
}
export function vaultPda(game: PublicKey) {
  return PublicKey.findProgramAddressSync([Buffer.from('vault'), game.toBuffer()], programId)[0];
}
export function playerPda(game: PublicKey, wallet: PublicKey) {
  return PublicKey.findProgramAddressSync([Buffer.from('player'), game.toBuffer(), wallet.toBuffer()], programId)[0];
}

/** True while the account is delegated to the ER (owned by the delegation program on base). */
export async function isDelegated(account: PublicKey): Promise<boolean> {
  const info = await baseConnection().getAccountInfo(account, 'confirmed');
  return !!info && info.owner.equals(DELEGATION_PROGRAM_ID);
}
