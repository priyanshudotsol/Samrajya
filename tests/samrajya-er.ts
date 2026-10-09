// End-to-end war across the layers: lobby on Solana (join + enlist) → start, which delegates the
// Game and every member to the ER → ER allocate + VRF battles → mid-game leave (commit) + base
// withdraw → release every member + end_game back to Solana → claim on base.
// Local:  yarn stack:local   (terminal 1)   then   yarn test:er   (terminal 2)
// Devnet: yarn test:er:devnet  (needs the program deployed to devnet, and the newest war there
//         to have ended: wars are sequential, see `init_game`)
import * as anchor from "@coral-xyz/anchor";
import { BN } from "@coral-xyz/anchor";
import { Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import { expect } from "chai";
import {
  DEFEND, DELEGATION, KINGDOMS, PLAINS, TERRITORIES, bringWarToSolana, env, gameConfig, gamePda, moveWarToER, musterAccounts, nextGame, ownerName,
  playerPda, programs, registryPda, send, sleep, valueOf, vaultPda, waitForCommit, waitForUndelegation,
} from "../scripts/client";

// long enough to walk to a gate and fight a garrison down by hand
const EPOCH_SECS = 25;

describe("samrajya on the Ephemeral Rollup", () => {
  const admin = anchor.Wallet.local();
  const { base, er, program, programER } = programs(admin);
  let gameId = 0;
  let game = PublicKey.default;
  let vault = PublicKey.default;
  let previous: PublicKey | null = null;
  // Everyone pays the same ticket. Hastinapur gets 4 members (and keeps 3 after one leaves), the
  // others 1 each, so the war reaches a ruler in a handful of epochs; kingdoms 3-5 are empty.
  const TICKET = 0.05;
  const players = [0, 0, 0, 1, 2].map((f) => ({ kp: Keypair.generate(), faction: f, stake: TICKET }));
  const leaver = { kp: Keypair.generate(), faction: 0, stake: TICKET };
  const L = (sol: number) => Math.round(sol * LAMPORTS_PER_SOL);

  const fetchGame = () => programER.account.game.fetch(game);

  before(async () => {
    const next = await nextGame(program);
    gameId = next.id;
    game = gamePda(gameId);
    vault = vaultPda(game);
    previous = next.previous;
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
    const config = gameConfig({ ticketSol: TICKET, epochSecs: EPOCH_SECS, stormDecayBps: 2000, baseDefenseSol: 0.01, plainsDefenseSol: 0.01, lobbySecs: 0 });
    await program.methods
      .initGame(new BN(gameId), config)
      .accountsPartial({ authority: admin.publicKey, game, registry: registryPda(), previous, vault })
      .rpc();
    expect((await program.account.game.fetch(game)).phase).to.have.property("lobby");
  });

  it("players join and pick a kingdom in the lobby on Solana (one tx each, nothing delegated)", async () => {
    for (const p of [...players, leaver]) {
      const wallet = p.kp.publicKey;
      const player = playerPda(game, wallet);
      const tx = new Transaction().add(
        await program.methods.join(new BN(Math.round(p.stake * LAMPORTS_PER_SOL))).accountsPartial({ wallet, game, player, vault }).instruction(),
        await program.methods.enlist(p.faction).accountsPartial({ signer: wallet, game, player, sessionToken: null }).instruction(),
      );
      await send(base, tx, [p.kp]);
    }
    const g = await program.account.game.fetch(game);
    expect(g.factions[0].members).to.eq(4);
    expect((await base.connection.getAccountInfo(game))!.owner.equals(DELEGATION)).to.eq(false);
  });

  it("nobody else can move a lobby member to the ER before the war starts", async () => {
    const p = players[0];
    let failed = false;
    try {
      await send(base, new Transaction().add(
        await program.methods.delegatePlayer()
          .accountsPartial({ payer: admin.publicKey, wallet: p.kp.publicKey, game, pda: playerPda(game, p.kp.publicKey), validator: env.validator })
          .instruction(),
      ), [admin.payer]);
    } catch { failed = true; }
    expect(failed).to.eq(true);
  });

  it("starting the war moves the Game and every member to the ER", async () => {
    const txs = await moveWarToER(program, gameId, admin.publicKey);
    expect(txs.length).to.eq(3); // start + game, then 6 members in batches of 4
    for (const t of txs) await send(base, t, [admin.payer]);
    for (const acc of [game, ...[...players, leaver].map((p) => playerPda(game, p.kp.publicKey))]) {
      expect((await base.connection.getAccountInfo(acc))!.owner.equals(DELEGATION), acc.toBase58()).to.eq(true);
    }
    await sleep(3000);
    const g = await fetchGame();
    expect(g.phase).to.have.property("active");
    expect(g.factions[0].members).to.eq(4);
    expect(g.factions[0].treasury.toNumber()).to.eq(L(4 * TICKET));
    expect(g.territoryOwner[PLAINS]).to.eq(255); // the plains start neutral
    // nothing left to move
    expect(await moveWarToER(program, gameId, admin.publicKey)).to.have.length(0);
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
    expect(p.pendingWithdrawal.toNumber()).to.eq(L(TICKET * 0.8));
    const before = await base.connection.getBalance(wallet);
    await send(base, await program.methods.withdraw().accountsPartial({ payer: wallet, game, player, wallet, vault }).transaction(), [leaver.kp]);
    const after = await base.connection.getBalance(wallet);
    expect(after - before).to.be.greaterThan(L(TICKET * 0.8) - 20_000);
    expect((await fetchGame()).factions[0].treasury.toNumber()).to.eq(L(3 * TICKET + TICKET * 0.2));
  });

  it("wins the war by hand: squads teleport to the gates, cut the garrisons down and take the forts", async () => {
    const er_ = programER;
    const pda = (kp: Keypair) => playerPda(game, kp.publicKey);
    const unitOf = async (kp: Keypair) => (await er_.account.player.fetch(pda(kp))).unit;
    const act = (kp: Keypair) => ({ signer: kp.publicKey, game, player: pda(kp), sessionToken: null });
    const move = async (kp: Keypair, x: number, z: number, fx = 0, fz = -100, gear?: number) => {
      const u = await unitOf(kp);
      await send(er, await er_.methods.moveUnit(u.at, x, z, fx, fz, 1, gear ?? u.gear, u.role).accountsPartial(act(kp)).transaction(), [kp]);
    };
    // walk in steps the program accepts (≤ 4.2 units per second)
    const walkTo = async (kp: Keypair, x: number, z: number) => {
      for (let i = 0; i < 12; i++) {
        const u = await unitOf(kp);
        const d = Math.hypot(x - u.x, z - u.z);
        if (d < 5) return;
        const k = Math.min(1, 350 / d);
        await move(kp, Math.round(u.x + (x - u.x) * k), Math.round(u.z + (z - u.z) * k));
        if (k < 1) await sleep(1000);
      }
    };
    const strikeAt = async (kp: Keypair, victim: Keypair) => {
      const [a, v] = [await unitOf(kp), await unitOf(victim)];
      const d = Math.hypot(v.x - a.x, v.z - a.z) || 1;
      const [fx, fz] = [Math.round(((v.x - a.x) / d) * 100), Math.round(((v.z - a.z) / d) * 100)];
      const tx = await er_.methods.strike(a.x, a.z, fx, fz, false).accountsPartial(act(kp))
        .remainingAccounts([{ pubkey: pda(victim), isSigner: false, isWritable: true }]).transaction();
      await send(er, tx, [kp]);
    };
    const GATE = { x: 0, z: 221 };
    /** Just outside the gate, where the shut gate stops an enemy. */
    const GATE_MOUTH = { x: 0, z: 262 };
    const hast = players.filter((p) => p.faction === 0).map((p) => p.kp);
    let g = await fetchGame();
    for (let round = 0; round < 25 && !("ended" in g.phase); round++) {
      const owned = g.territoryOwner.reduce((m: number, o: number, t: number) => (o === 0 ? m | (1 << t) : m), 0);
      const forts = [1, 2, 3, 4, 5].filter((t) => g.territoryOwner[t] !== 0 && (g.config.adjacency[t] & owned) !== 0);
      const plans: { kp: Keypair; t: number }[] = forts.slice(0, hast.length).map((t, i) => ({ kp: hast[i], t }));
      if (plans.length < hast.length && g.territoryOwner[PLAINS] !== 0) plans.push({ kp: hast[plans.length], t: PLAINS });
      for (const { kp, t } of plans) {
        const pl = await er_.account.player.fetch(pda(kp));
        const value = valueOf(g.factions[0], pl.shares, pl.generation);
        await send(er, await er_.methods.allocate(t, value.divn(2)).accountsPartial(act(kp)).transaction(), [kp]);
        if (t === PLAINS) continue;
        expect((await unitOf(kp)).at, "teleported to the target").to.eq(t);
        // the gate stays shut while a defender lives (§10.10): take a bow to the gate mouth and
        // shoot the garrison down over the wall, then step into the gate
        const u0 = await unitOf(kp);
        await move(kp, u0.x, u0.z, 0, -100, 2);
        await walkTo(kp, GATE_MOUTH.x, GATE_MOUTH.z);
        for (const d of players.filter((p) => p.faction === g.territoryOwner[t]).map((p) => p.kp)) {
          const du = await unitOf(d);
          if (du.at !== t || du.hp === 0) continue;
          // stand outside the wall on the defender's side, within bow range
          const r = Math.hypot(du.x, du.z) || 1;
          await walkTo(kp, Math.round((du.x / r) * 320), Math.round((du.z / r) * 320));
          for (let i = 0; i < 16 && (await unitOf(d)).hp > 0; i++) {
            await strikeAt(kp, d).catch(() => {});
            await sleep(1050);
          }
          expect((await unitOf(d)).hp, "the garrison fell").to.eq(0);
          console.log(`  ${KINGDOMS[0]} shot down the garrison of ${TERRITORIES[t]} over the wall`);
        }
        // nobody of the kingdom is alive here: walk in through the gate and seize it at once (§10.11)
        await walkTo(kp, GATE.x, GATE.z);
        await walkTo(kp, 0, 60);
        const u1 = await unitOf(kp);
        await send(er, await er_.methods.seize(u1.x, u1.z).accountsPartial(act(kp)).remainingAccounts(await musterAccounts(er_, gameId)).transaction(), [kp]);
        const after = await fetchGame();
        expect(after.territoryOwner[t], "seized without the bell").to.eq(0);
        expect(after.epoch, "the epoch did not move").to.eq(g.epoch);
        console.log(`  ${KINGDOMS[0]} walked into empty ${TERRITORIES[t]} and seized it at once`);
      }
      // the bell, with every member's warrior mustered
      const now = Math.floor(Date.now() / 1000);
      await sleep(Math.max(0, g.epochEndsAt.toNumber() - now + 1) * 1000);
      const epoch = g.epoch;
      const muster = await musterAccounts(er_, gameId);
      await send(er, await er_.methods.resolveEpoch(round % 256).accountsPartial({ payer: admin.publicKey, game, oracleQueue: env.vrfQueue })
        .remainingAccounts(muster).transaction(), [admin.payer]);
      for (let i = 0; i < 120; i++) {
        g = await fetchGame();
        if (g.epoch > epoch) break;
        await sleep(500);
      }
      expect(g.epoch, "the bell did not resolve").to.be.greaterThan(epoch);
      const fresh = g.battleLog.filter((e: { epoch: number }) => e.epoch === epoch);
      for (const e of fresh) {
        if (e.territory !== PLAINS) expect(e.byFight, "forts are decided by the fight").to.eq(true);
        console.log(`  epoch ${epoch}: ${TERRITORIES[e.territory]} ${e.winner === e.defender ? "held" : `fell to ${ownerName(e.winner)}`}${e.byFight ? " (by the fight)" : " (VRF)"}`);
      }
    }
    expect(g.phase).to.have.property("ended");
    console.log(`  🏆 ${KINGDOMS[g.winner]} rules every territory, the plains too`);
  });

  it("brings every member and the game back to Solana, and winners claim the pot", async () => {
    const g = await fetchGame();
    let last = "";
    for (const t of await bringWarToSolana(programER, base.connection, gameId, admin.publicKey)) last = await send(er, t, [admin.payer]);
    await waitForCommit(er.connection, last);
    for (const p of players) await waitForUndelegation(base.connection, playerPda(game, p.kp.publicKey), 120_000);
    await waitForUndelegation(base.connection, game, 120_000);
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

// keep imports referenced for editors
void DEFEND; void LAMPORTS_PER_SOL;
