// End-to-end war on a MagicBlock Ephemeral Rollup: base join+delegate → ER enlist/allocate →
// VRF battles → mid-game leave (commit) + base withdraw → end_game → claim on base.
// Local:  yarn stack:local   (terminal 1)   then   yarn test:er   (terminal 2)
// Devnet: yarn test:er:devnet  (needs the program deployed to devnet)
import * as anchor from "@coral-xyz/anchor";
import { BN } from "@coral-xyz/anchor";
import { Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import { expect } from "chai";
import {
  DEFEND, KINGDOMS, env, gamePda, playerPda, programs, send, sleep, valueOf, vaultPda, waitForCommit, waitForUndelegation,
} from "../scripts/client";

const EPOCH_SECS = 3;

describe("samrajya on the Ephemeral Rollup", () => {
  const admin = anchor.Wallet.local();
  const { base, er, program, programER } = programs(admin);
  const gameId = Math.floor(Date.now() / 1000);
  const game = gamePda(gameId);
  const vault = vaultPda(game);
  // 3 players in kingdoms 0, 1, 2 (the other 3 kingdoms are empty and fall fast). Hastinapur's
  // player stakes 10x more so the war reaches a ruler in a handful of epochs.
  const players = [0, 1, 2].map((f) => ({ kp: Keypair.generate(), faction: f, stake: f === 0 ? 0.5 : 0.05 }));
  const leaver = { kp: Keypair.generate(), faction: 0, stake: 0.05 };
  const L = (sol: number) => Math.round(sol * LAMPORTS_PER_SOL);

  const fetchGame = () => programER.account.game.fetch(game);

  before(async () => {
    console.log(`base ${env.base}\nER   ${env.er}\ngame ${game.toBase58()} (id ${gameId})`);
    const fund = new Transaction();
    for (const p of [...players, leaver]) {
      fund.add(SystemProgram.transfer({ fromPubkey: admin.publicKey, toPubkey: p.kp.publicKey, lamports: L(p.stake + 0.06) }));
    }
    await send(base, fund, [admin.payer]);
  });

  after(async () => {
    // Return leftover test SOL to the admin wallet.
    for (const p of [...players, leaver]) {
      const bal = await base.connection.getBalance(p.kp.publicKey);
      if (bal > 10_000) {
        const tx = new Transaction().add(
          SystemProgram.transfer({ fromPubkey: p.kp.publicKey, toPubkey: admin.publicKey, lamports: bal - 5_000 }),
        );
        await send(base, tx, [p.kp]).catch(() => {});
      }
    }
  });

  it("creates the game on base", async () => {
    const config = {
      minStake: new BN(0.05 * LAMPORTS_PER_SOL),
      epochSecs: new BN(EPOCH_SECS),
      leaveFeeBps: 2000,
      switchFeeBps: 4000,
      kLossBps: 2000,
      stormDecayBps: 2000,
      baseDefense: new BN(0.01 * LAMPORTS_PER_SOL),
      adjacency: [0b100110, 0b001101, 0b010011, 0b110010, 0b101100, 0b011001],
    };
    await program.methods.initGame(new BN(gameId), config).accountsPartial({ authority: admin.publicKey, game, vault }).rpc();
    expect((await program.account.game.fetch(game)).phase).to.have.property("lobby");
  });

  it("players join (SOL → vault) and delegate their Player in one base tx", async () => {
    for (const p of [...players, leaver]) {
      const wallet = p.kp.publicKey;
      const tx = new Transaction().add(
        await program.methods.join(new BN(Math.round(p.stake * LAMPORTS_PER_SOL))).accountsPartial({ wallet, game, player: playerPda(game, wallet), vault }).instruction(),
        await program.methods.delegatePlayer().accountsPartial({ wallet, game, pda: playerPda(game, wallet), validator: env.validator }).instruction(),
      );
      await send(base, tx, [p.kp]);
    }
  });

  it("admin delegates the game to the ER", async () => {
    await program.methods.delegateGame(new BN(gameId)).accountsPartial({ authority: admin.publicKey, pda: game, validator: env.validator }).rpc();
    await sleep(3000);
  });

  it("players enlist on the ER (shares minted) and the war starts", async () => {
    for (const p of [...players, leaver]) {
      const tx = await programER.methods.enlist(p.faction)
        .accountsPartial({ signer: p.kp.publicKey, game, player: playerPda(game, p.kp.publicKey), sessionToken: null })
        .transaction();
      const t0 = Date.now();
      await send(er, tx, [p.kp]);
      console.log(`  enlist ${KINGDOMS[p.faction]} on ER in ${Date.now() - t0} ms`);
    }
    await programER.methods.startGame().accountsPartial({ authority: admin.publicKey, game }).rpc();
    const g = await fetchGame();
    expect(g.phase).to.have.property("active");
    expect(g.factions[0].members).to.eq(2);
    expect(g.factions[0].treasury.toNumber()).to.eq(L(players[0].stake + leaver.stake));
  });

  it("a player leaves mid-war (20% fee), commits back and withdraws on base", async () => {
    const wallet = leaver.kp.publicKey;
    const player = playerPda(game, wallet);
    const tx = new Transaction().add(
      await programER.methods.leave().accountsPartial({ signer: wallet, game, player, sessionToken: null }).instruction(),
      await programER.methods.undelegatePlayer().accountsPartial({ signer: wallet, player, sessionToken: null }).instruction(),
    );
    const sig = await send(er, tx, [leaver.kp]);
    await waitForCommit(er.connection, sig);
    await waitForUndelegation(base.connection, player);
    const p = await program.account.player.fetch(player);
    expect(p.pendingWithdrawal.toNumber()).to.eq(L(leaver.stake * 0.8));
    const before = await base.connection.getBalance(wallet);
    await send(base, await program.methods.withdraw().accountsPartial({ payer: wallet, game, player, wallet, vault }).transaction(), [leaver.kp]);
    const after = await base.connection.getBalance(wallet);
    expect(after - before).to.be.greaterThan(L(leaver.stake * 0.8) - 20_000);
    expect((await fetchGame()).factions[0].treasury.toNumber()).to.eq(L(players[0].stake + leaver.stake * 0.2));
  });

  it("wages war with VRF-resolved battles until one kingdom rules the globe", async () => {
    let g = await fetchGame();
    for (let round = 0; round < 40 && !("ended" in g.phase); round++) {
      // The strong kingdom attacks with half its value; the others defend. (All-out attacks
      // leave home undefended, and two all-in kingdoms can trade territories for a long time.)
      for (const p of players.slice(0, 1)) {
        const player = playerPda(game, p.kp.publicKey);
        const pl = await programER.account.player.fetch(player);
        const fi = pl.faction;
        const fa = g.factions[fi];
        const value = valueOf(fa, pl.shares, pl.generation);
        if (value.isZero() || !fa.alive) continue;
        const owned = g.territoryOwner.reduce((m: number, o: number, t: number) => (o === fi ? m | (1 << t) : m), 0);
        const targets = [0, 1, 2, 3, 4, 5].filter((t) => g.territoryOwner[t] !== fi && (g.config.adjacency[t] & owned) !== 0);
        if (!targets.length) continue;
        const target = targets[Math.floor(Math.random() * targets.length)];
        const tx = await programER.methods.allocate(target, value.divn(2))
          .accountsPartial({ signer: p.kp.publicKey, game, player, sessionToken: null }).transaction();
        await send(er, tx, [p.kp]);
      }
      // Wait for the bell, ring it, and wait for the VRF callback.
      const now = Math.floor(Date.now() / 1000);
      await sleep(Math.max(0, g.epochEndsAt.toNumber() - now + 1) * 1000);
      const epoch = g.epoch;
      await send(er, await programER.methods.resolveEpoch(round % 256).accountsPartial({ payer: admin.publicKey, game, oracleQueue: env.vrfQueue }).transaction(), [admin.payer]);
      // The local VRF oracle can take ~20 s; devnet answers in ~1-2 s.
      for (let i = 0; i < 120; i++) {
        g = await fetchGame();
        if (g.epoch > epoch) break;
        await sleep(500);
      }
      expect(g.epoch, "VRF callback did not arrive").to.be.greaterThan(epoch);
      const owners = g.territoryOwner.map((o: number) => KINGDOMS[o].slice(0, 4)).join(" ");
      console.log(`  epoch ${epoch}: battles so far ${g.battleCount} | owners ${owners}`);
    }
    expect(g.phase).to.have.property("ended");
    console.log(`  🏆 ${KINGDOMS[g.winner]} rules the globe`);
  });

  it("ends the game, commits it to base, and winners claim the pot", async () => {
    const sig = await send(er, await programER.methods.endGame().accountsPartial({ payer: admin.publicKey, game }).transaction(), [admin.payer]);
    await waitForCommit(er.connection, sig);
    const g = await fetchGame();
    for (const p of players) {
      const wallet = p.kp.publicKey;
      const player = playerPda(game, wallet);
      const s = await send(er, await programER.methods.undelegatePlayer().accountsPartial({ signer: wallet, player, sessionToken: null }).transaction(), [p.kp]);
      await waitForCommit(er.connection, s);
      await waitForUndelegation(base.connection, player);
    }
    await waitForUndelegation(base.connection, game);
    const vaultBefore = await base.connection.getBalance(vault);
    for (const p of players) {
      const wallet = p.kp.publicKey;
      const player = playerPda(game, wallet);
      const pl = await program.account.player.fetch(player);
      const claimTx = await program.methods.claim().accountsPartial({ payer: wallet, game, player, wallet, vault }).transaction();
      if (pl.faction === g.winner && !pl.shares.isZero()) {
        await send(base, claimTx, [p.kp]);
        console.log(`  ${KINGDOMS[p.faction]} player claimed`);
      } else {
        let failed = false;
        try { await send(base, claimTx, [p.kp]); } catch { failed = true; }
        expect(failed, "a loser was able to claim").to.eq(true);
      }
    }
    const rent = await base.connection.getMinimumBalanceForRentExemption(0);
    const vaultAfter = await base.connection.getBalance(vault);
    console.log(`  vault ${vaultBefore} → ${vaultAfter} lamports (rent ${rent})`);
    expect(vaultAfter - rent).to.be.lessThan(1000);
  });
});

// keep PublicKey/DEFEND imports referenced for editors
void PublicKey; void DEFEND;
