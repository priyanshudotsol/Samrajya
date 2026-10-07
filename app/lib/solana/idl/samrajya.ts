/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/samrajya.json`.
 */
export type Samrajya = {
  "address": "Hn5L61gn5B9ETWbRBjJ6qnLU2NdWSDBaqXCfy7jwT7Ng",
  "metadata": {
    "name": "samrajya",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Samrajya — on-chain kingdom conquest on MagicBlock Ephemeral Rollups"
  },
  "instructions": [
    {
      "name": "allocate",
      "docs": [
        "Commit `amount` lamports of your value to attack `target` (255 = defend)."
      ],
      "discriminator": [
        64,
        38,
        189,
        129,
        24,
        157,
        82,
        136
      ],
      "accounts": [
        {
          "name": "signer",
          "writable": true,
          "signer": true
        },
        {
          "name": "game",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  97,
                  109,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "game.game_id",
                "account": "game"
              }
            ]
          },
          "relations": [
            "player"
          ]
        },
        {
          "name": "player",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  108,
                  97,
                  121,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "game"
              },
              {
                "kind": "account",
                "path": "player.wallet",
                "account": "player"
              }
            ]
          }
        },
        {
          "name": "sessionToken",
          "optional": true
        }
      ],
      "args": [
        {
          "name": "target",
          "type": "u8"
        },
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "battleCallback",
      "docs": [
        "VRF callback: resolves every battle with the oracle's randomness."
      ],
      "discriminator": [
        88,
        184,
        111,
        140,
        222,
        219,
        123,
        235
      ],
      "accounts": [
        {
          "name": "vrfProgramIdentity",
          "docs": [
            "Scoped VRF identity PDA, bound to this program. Its presence as a signer proves",
            "the callback was issued by the VRF program for this program."
          ],
          "signer": true
        },
        {
          "name": "game",
          "writable": true
        }
      ],
      "args": [
        {
          "name": "randomness",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        }
      ]
    },
    {
      "name": "claim",
      "docs": [
        "Winners claim their share of the whole pot. Base layer, after `end_game` and",
        "`undelegate_player` have committed the final state."
      ],
      "discriminator": [
        62,
        198,
        214,
        193,
        213,
        159,
        108,
        210
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "game",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  97,
                  109,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "game.game_id",
                "account": "game"
              }
            ]
          },
          "relations": [
            "player"
          ]
        },
        {
          "name": "player",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  108,
                  97,
                  121,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "game"
              },
              {
                "kind": "account",
                "path": "player.wallet",
                "account": "player"
              }
            ]
          }
        },
        {
          "name": "wallet",
          "writable": true,
          "relations": [
            "player"
          ]
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "game"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "delegateGame",
      "docs": [
        "Delegates the Game PDA to the ER (authority only)."
      ],
      "discriminator": [
        116,
        183,
        70,
        107,
        112,
        223,
        122,
        210
      ],
      "accounts": [
        {
          "name": "authority",
          "signer": true
        },
        {
          "name": "bufferPda",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  117,
                  102,
                  102,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "pda"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                249,
                71,
                5,
                170,
                111,
                201,
                111,
                95,
                181,
                68,
                120,
                110,
                141,
                92,
                139,
                146,
                197,
                173,
                254,
                73,
                79,
                170,
                85,
                81,
                18,
                5,
                164,
                16,
                193,
                44,
                230,
                241
              ]
            }
          }
        },
        {
          "name": "delegationRecordPda",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  108,
                  101,
                  103,
                  97,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "pda"
              }
            ],
            "program": {
              "kind": "account",
              "path": "delegationProgram"
            }
          }
        },
        {
          "name": "delegationMetadataPda",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  108,
                  101,
                  103,
                  97,
                  116,
                  105,
                  111,
                  110,
                  45,
                  109,
                  101,
                  116,
                  97,
                  100,
                  97,
                  116,
                  97
                ]
              },
              {
                "kind": "account",
                "path": "pda"
              }
            ],
            "program": {
              "kind": "account",
              "path": "delegationProgram"
            }
          }
        },
        {
          "name": "pda",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  97,
                  109,
                  101
                ]
              },
              {
                "kind": "arg",
                "path": "gameId"
              }
            ]
          }
        },
        {
          "name": "validator",
          "optional": true
        },
        {
          "name": "ownerProgram",
          "address": "Hn5L61gn5B9ETWbRBjJ6qnLU2NdWSDBaqXCfy7jwT7Ng"
        },
        {
          "name": "delegationProgram",
          "address": "DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "gameId",
          "type": "u64"
        }
      ]
    },
    {
      "name": "delegatePlayer",
      "docs": [
        "Delegates the Player PDA to the ER (send in the same tx as `join`)."
      ],
      "discriminator": [
        235,
        159,
        245,
        102,
        161,
        199,
        254,
        89
      ],
      "accounts": [
        {
          "name": "wallet",
          "signer": true
        },
        {
          "name": "game"
        },
        {
          "name": "bufferPda",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  117,
                  102,
                  102,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "pda"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                249,
                71,
                5,
                170,
                111,
                201,
                111,
                95,
                181,
                68,
                120,
                110,
                141,
                92,
                139,
                146,
                197,
                173,
                254,
                73,
                79,
                170,
                85,
                81,
                18,
                5,
                164,
                16,
                193,
                44,
                230,
                241
              ]
            }
          }
        },
        {
          "name": "delegationRecordPda",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  108,
                  101,
                  103,
                  97,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "pda"
              }
            ],
            "program": {
              "kind": "account",
              "path": "delegationProgram"
            }
          }
        },
        {
          "name": "delegationMetadataPda",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  108,
                  101,
                  103,
                  97,
                  116,
                  105,
                  111,
                  110,
                  45,
                  109,
                  101,
                  116,
                  97,
                  100,
                  97,
                  116,
                  97
                ]
              },
              {
                "kind": "account",
                "path": "pda"
              }
            ],
            "program": {
              "kind": "account",
              "path": "delegationProgram"
            }
          }
        },
        {
          "name": "pda",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  108,
                  97,
                  121,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "game"
              },
              {
                "kind": "account",
                "path": "wallet"
              }
            ]
          }
        },
        {
          "name": "validator",
          "optional": true
        },
        {
          "name": "ownerProgram",
          "address": "Hn5L61gn5B9ETWbRBjJ6qnLU2NdWSDBaqXCfy7jwT7Ng"
        },
        {
          "name": "delegationProgram",
          "address": "DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "endGame",
      "docs": [
        "Commits the finished game back to base so winners can `claim`."
      ],
      "discriminator": [
        224,
        135,
        245,
        99,
        67,
        175,
        121,
        252
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "game",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  97,
                  109,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "game.game_id",
                "account": "game"
              }
            ]
          }
        },
        {
          "name": "magicProgram",
          "address": "Magic11111111111111111111111111111111111111"
        },
        {
          "name": "magicContext",
          "writable": true,
          "address": "MagicContext1111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "enlist",
      "docs": [
        "Turns the pending deposit into shares of `faction`."
      ],
      "discriminator": [
        181,
        199,
        104,
        138,
        71,
        161,
        51,
        66
      ],
      "accounts": [
        {
          "name": "signer",
          "writable": true,
          "signer": true
        },
        {
          "name": "game",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  97,
                  109,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "game.game_id",
                "account": "game"
              }
            ]
          },
          "relations": [
            "player"
          ]
        },
        {
          "name": "player",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  108,
                  97,
                  121,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "game"
              },
              {
                "kind": "account",
                "path": "player.wallet",
                "account": "player"
              }
            ]
          }
        },
        {
          "name": "sessionToken",
          "optional": true
        }
      ],
      "args": [
        {
          "name": "faction",
          "type": "u8"
        }
      ]
    },
    {
      "name": "initGame",
      "docs": [
        "Creates the game and its SOL vault. The vault is pre-funded with rent so payouts",
        "never leave it below the rent-exempt minimum."
      ],
      "discriminator": [
        251,
        46,
        12,
        208,
        184,
        148,
        157,
        73
      ],
      "accounts": [
        {
          "name": "authority",
          "writable": true,
          "signer": true
        },
        {
          "name": "game",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  97,
                  109,
                  101
                ]
              },
              {
                "kind": "arg",
                "path": "gameId"
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "game"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "gameId",
          "type": "u64"
        },
        {
          "name": "config",
          "type": {
            "defined": {
              "name": "gameConfig"
            }
          }
        }
      ]
    },
    {
      "name": "join",
      "docs": [
        "Deposits SOL into the vault. The deposit becomes shares when the player `enlist`s",
        "(on the ER while the game is delegated). Fails while the Player is delegated."
      ],
      "discriminator": [
        206,
        55,
        2,
        106,
        113,
        220,
        17,
        163
      ],
      "accounts": [
        {
          "name": "wallet",
          "writable": true,
          "signer": true
        },
        {
          "name": "game"
        },
        {
          "name": "player",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  108,
                  97,
                  121,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "game"
              },
              {
                "kind": "account",
                "path": "wallet"
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "game"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "leave",
      "docs": [
        "Leave the war; 80% of your value becomes `pending_withdrawal`. On the ER, follow with",
        "`undelegate_player` in the same tx, then `withdraw` on base."
      ],
      "discriminator": [
        59,
        234,
        148,
        108,
        107,
        149,
        173,
        112
      ],
      "accounts": [
        {
          "name": "signer",
          "writable": true,
          "signer": true
        },
        {
          "name": "game",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  97,
                  109,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "game.game_id",
                "account": "game"
              }
            ]
          },
          "relations": [
            "player"
          ]
        },
        {
          "name": "player",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  108,
                  97,
                  121,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "game"
              },
              {
                "kind": "account",
                "path": "player.wallet",
                "account": "player"
              }
            ]
          }
        },
        {
          "name": "sessionToken",
          "optional": true
        }
      ],
      "args": []
    },
    {
      "name": "processUndelegation",
      "discriminator": [
        196,
        28,
        41,
        206,
        48,
        37,
        51,
        167
      ],
      "accounts": [
        {
          "name": "baseAccount",
          "writable": true
        },
        {
          "name": "buffer",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  117,
                  110,
                  100,
                  101,
                  108,
                  101,
                  103,
                  97,
                  116,
                  101,
                  45,
                  98,
                  117,
                  102,
                  102,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "baseAccount"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                181,
                183,
                0,
                225,
                242,
                87,
                58,
                192,
                204,
                6,
                34,
                1,
                52,
                74,
                207,
                151,
                184,
                53,
                6,
                235,
                140,
                229,
                25,
                152,
                204,
                98,
                126,
                24,
                147,
                128,
                167,
                62
              ]
            }
          }
        },
        {
          "name": "payer",
          "writable": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "accountSeeds",
          "type": {
            "vec": "bytes"
          }
        }
      ]
    },
    {
      "name": "resolveEpoch",
      "docs": [
        "Permissionless game clock. If nobody attacked, just advances the epoch; otherwise",
        "requests VRF and the battles resolve in `battle_callback`."
      ],
      "discriminator": [
        127,
        233,
        72,
        190,
        252,
        134,
        239,
        218
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "game",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  97,
                  109,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "game.game_id",
                "account": "game"
              }
            ]
          }
        },
        {
          "name": "oracleQueue",
          "writable": true
        },
        {
          "name": "programIdentity",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  105,
                  100,
                  101,
                  110,
                  116,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "vrfProgram",
          "address": "Vrf1RNUjXmQGjmQrQLvJHs9SNkvDJEsRVFPkfSQUwGz"
        },
        {
          "name": "slotHashes",
          "address": "SysvarS1otHashes111111111111111111111111111"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "clientSeed",
          "type": "u8"
        }
      ]
    },
    {
      "name": "resolveEpochDebug",
      "docs": [
        "Test-only resolution without VRF. Rejected unless built with `--features debug`."
      ],
      "discriminator": [
        165,
        234,
        123,
        244,
        33,
        160,
        76,
        208
      ],
      "accounts": [
        {
          "name": "authority",
          "signer": true,
          "relations": [
            "game"
          ]
        },
        {
          "name": "game",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  97,
                  109,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "game.game_id",
                "account": "game"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "randomness",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        }
      ]
    },
    {
      "name": "startGame",
      "discriminator": [
        249,
        47,
        252,
        172,
        184,
        162,
        245,
        14
      ],
      "accounts": [
        {
          "name": "authority",
          "signer": true,
          "relations": [
            "game"
          ]
        },
        {
          "name": "game",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  97,
                  109,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "game.game_id",
                "account": "game"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "switchKingdom",
      "docs": [
        "Move to another kingdom; 40% of your value stays behind."
      ],
      "discriminator": [
        211,
        103,
        123,
        172,
        64,
        45,
        182,
        187
      ],
      "accounts": [
        {
          "name": "signer",
          "writable": true,
          "signer": true
        },
        {
          "name": "game",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  97,
                  109,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "game.game_id",
                "account": "game"
              }
            ]
          },
          "relations": [
            "player"
          ]
        },
        {
          "name": "player",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  108,
                  97,
                  121,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "game"
              },
              {
                "kind": "account",
                "path": "player.wallet",
                "account": "player"
              }
            ]
          }
        },
        {
          "name": "sessionToken",
          "optional": true
        }
      ],
      "args": [
        {
          "name": "to",
          "type": "u8"
        }
      ]
    },
    {
      "name": "undelegatePlayer",
      "docs": [
        "Commits the Player back to base (after `leave`, or after the game ends to `claim`)."
      ],
      "discriminator": [
        230,
        242,
        176,
        199,
        120,
        26,
        119,
        243
      ],
      "accounts": [
        {
          "name": "signer",
          "writable": true,
          "signer": true
        },
        {
          "name": "player",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  108,
                  97,
                  121,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "player.game",
                "account": "player"
              },
              {
                "kind": "account",
                "path": "player.wallet",
                "account": "player"
              }
            ]
          }
        },
        {
          "name": "sessionToken",
          "optional": true
        },
        {
          "name": "magicProgram",
          "address": "Magic11111111111111111111111111111111111111"
        },
        {
          "name": "magicContext",
          "writable": true,
          "address": "MagicContext1111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "withdraw",
      "docs": [
        "Pays out `pending_withdrawal` (set by `leave`) from the vault. Base layer, after the",
        "Player has been committed back with `undelegate_player`."
      ],
      "discriminator": [
        183,
        18,
        70,
        156,
        148,
        109,
        161,
        34
      ],
      "accounts": [
        {
          "name": "payer",
          "docs": [
            "Anyone may trigger; funds only go to `player.wallet`."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "game",
          "relations": [
            "player"
          ]
        },
        {
          "name": "player",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  108,
                  97,
                  121,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "game"
              },
              {
                "kind": "account",
                "path": "player.wallet",
                "account": "player"
              }
            ]
          }
        },
        {
          "name": "wallet",
          "writable": true,
          "relations": [
            "player"
          ]
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "game"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    }
  ],
  "accounts": [
    {
      "name": "game",
      "discriminator": [
        27,
        90,
        166,
        125,
        74,
        100,
        121,
        18
      ]
    },
    {
      "name": "player",
      "discriminator": [
        205,
        222,
        112,
        7,
        165,
        155,
        206,
        218
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "invalidConfig",
      "msg": "Invalid game configuration"
    },
    {
      "code": 6001,
      "name": "wrongPhase",
      "msg": "Action not allowed in the current game phase"
    },
    {
      "code": 6002,
      "name": "unauthorized",
      "msg": "Only the game authority can do this"
    },
    {
      "code": 6003,
      "name": "stakeTooSmall",
      "msg": "Stake is below the minimum"
    },
    {
      "code": 6004,
      "name": "invalidFaction",
      "msg": "Invalid kingdom index"
    },
    {
      "code": 6005,
      "name": "invalidTerritory",
      "msg": "Invalid territory index"
    },
    {
      "code": 6006,
      "name": "factionEliminated",
      "msg": "That kingdom has been eliminated"
    },
    {
      "code": 6007,
      "name": "alreadyEnlisted",
      "msg": "Player already belongs to a kingdom; leave first"
    },
    {
      "code": 6008,
      "name": "nothingToEnlist",
      "msg": "Player has no pending deposit"
    },
    {
      "code": 6009,
      "name": "notEnlisted",
      "msg": "Player is not in a kingdom"
    },
    {
      "code": 6010,
      "name": "notAdjacent",
      "msg": "Target territory is not reachable from your kingdom"
    },
    {
      "code": 6011,
      "name": "ownTerritory",
      "msg": "You already own that territory"
    },
    {
      "code": 6012,
      "name": "amountTooLarge",
      "msg": "Allocation exceeds your current value"
    },
    {
      "code": 6013,
      "name": "battlePending",
      "msg": "A battle is being resolved; try again in a moment"
    },
    {
      "code": 6014,
      "name": "epochNotOver",
      "msg": "The epoch has not ended yet"
    },
    {
      "code": 6015,
      "name": "sameFaction",
      "msg": "Cannot switch to the same kingdom"
    },
    {
      "code": 6016,
      "name": "nothingToWithdraw",
      "msg": "Nothing to withdraw"
    },
    {
      "code": 6017,
      "name": "notWinner",
      "msg": "Not a member of the winning kingdom"
    },
    {
      "code": 6018,
      "name": "alreadyClaimed",
      "msg": "Already claimed"
    },
    {
      "code": 6019,
      "name": "pendingWithdrawal",
      "msg": "Player must withdraw pending funds first"
    },
    {
      "code": 6020,
      "name": "mathOverflow",
      "msg": "Math overflow"
    }
  ],
  "types": [
    {
      "name": "battleEntry",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "epoch",
            "type": "u32"
          },
          {
            "name": "territory",
            "type": "u8"
          },
          {
            "name": "defender",
            "type": "u8"
          },
          {
            "name": "winner",
            "type": "u8"
          },
          {
            "name": "attackersMask",
            "type": "u8"
          },
          {
            "name": "defense",
            "docs": [
              "Size of the defender's bucket (defender wins if roll < defense)."
            ],
            "type": "u64"
          },
          {
            "name": "total",
            "type": "u64"
          },
          {
            "name": "roll",
            "type": "u64"
          },
          {
            "name": "spoils",
            "docs": [
              "Treasury moved to the winner (loot or failed-attack losses)."
            ],
            "type": "u64"
          },
          {
            "name": "eliminated",
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "faction",
      "docs": [
        "One kingdom. Stored inline in `Game` so battles touch a single account."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "treasury",
            "docs": [
              "Accounting lamports (real SOL sits in the vault). Also the kingdom's army strength."
            ],
            "type": "u64"
          },
          {
            "name": "totalShares",
            "docs": [
              "Player value = shares × treasury / total_shares."
            ],
            "type": "u128"
          },
          {
            "name": "generation",
            "docs": [
              "Bumped when the kingdom is wiped out, so stale shares are worth 0."
            ],
            "type": "u32"
          },
          {
            "name": "members",
            "type": "u32"
          },
          {
            "name": "territories",
            "type": "u8"
          },
          {
            "name": "powers",
            "type": "u8"
          },
          {
            "name": "alive",
            "type": "bool"
          },
          {
            "name": "ambushUsed",
            "type": "bool"
          },
          {
            "name": "attackAlloc",
            "docs": [
              "Lamports of value committed this epoch to attack each territory."
            ],
            "type": {
              "array": [
                "u64",
                6
              ]
            }
          }
        ]
      }
    },
    {
      "name": "game",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "gameId",
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "vaultBump",
            "type": "u8"
          },
          {
            "name": "phase",
            "type": {
              "defined": {
                "name": "phase"
              }
            }
          },
          {
            "name": "epoch",
            "type": "u32"
          },
          {
            "name": "epochEndsAt",
            "type": "i64"
          },
          {
            "name": "pendingVrf",
            "type": "bool"
          },
          {
            "name": "vrfRequestedAt",
            "type": "i64"
          },
          {
            "name": "config",
            "type": {
              "defined": {
                "name": "gameConfig"
              }
            }
          },
          {
            "name": "baseDefense",
            "docs": [
              "Current flat defense (decays every epoch)."
            ],
            "type": "u64"
          },
          {
            "name": "territoryOwner",
            "docs": [
              "Faction index owning each territory."
            ],
            "type": {
              "array": [
                "u8",
                6
              ]
            }
          },
          {
            "name": "factions",
            "type": {
              "array": [
                {
                  "defined": {
                    "name": "faction"
                  }
                },
                6
              ]
            }
          },
          {
            "name": "winner",
            "docs": [
              "Valid only when phase == Ended."
            ],
            "type": "u8"
          },
          {
            "name": "battleLog",
            "type": {
              "array": [
                {
                  "defined": {
                    "name": "battleEntry"
                  }
                },
                16
              ]
            }
          },
          {
            "name": "battleCount",
            "docs": [
              "Total number of battles ever logged; next slot = battle_count % BATTLE_LOG_LEN."
            ],
            "type": "u32"
          }
        ]
      }
    },
    {
      "name": "gameConfig",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "minStake",
            "type": "u64"
          },
          {
            "name": "epochSecs",
            "type": "i64"
          },
          {
            "name": "leaveFeeBps",
            "type": "u16"
          },
          {
            "name": "switchFeeBps",
            "type": "u16"
          },
          {
            "name": "kLossBps",
            "type": "u16"
          },
          {
            "name": "stormDecayBps",
            "type": "u16"
          },
          {
            "name": "baseDefense",
            "docs": [
              "Starting flat defense every territory gets; decays each epoch (\"the storm\")."
            ],
            "type": "u64"
          },
          {
            "name": "adjacency",
            "type": {
              "array": [
                "u8",
                6
              ]
            }
          }
        ]
      }
    },
    {
      "name": "phase",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "lobby"
          },
          {
            "name": "active"
          },
          {
            "name": "ended"
          }
        ]
      }
    },
    {
      "name": "player",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "wallet",
            "type": "pubkey"
          },
          {
            "name": "game",
            "type": "pubkey"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "faction",
            "type": "u8"
          },
          {
            "name": "generation",
            "type": "u32"
          },
          {
            "name": "shares",
            "type": "u128"
          },
          {
            "name": "pendingDeposit",
            "docs": [
              "SOL deposited on base but not yet turned into shares (`enlist` on the ER)."
            ],
            "type": "u64"
          },
          {
            "name": "pendingWithdrawal",
            "docs": [
              "SOL owed after `leave`, paid by `withdraw` on base."
            ],
            "type": "u64"
          },
          {
            "name": "depositedTotal",
            "docs": [
              "Lifetime SOL put in, for P&L in the UI."
            ],
            "type": "u64"
          },
          {
            "name": "allocTarget",
            "type": "u8"
          },
          {
            "name": "allocAmount",
            "type": "u64"
          },
          {
            "name": "allocEpoch",
            "type": "u32"
          },
          {
            "name": "claimed",
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "sessionTokenV2",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "targetProgram",
            "type": "pubkey"
          },
          {
            "name": "sessionSigner",
            "type": "pubkey"
          },
          {
            "name": "feePayer",
            "type": "pubkey"
          },
          {
            "name": "validUntil",
            "type": "i64"
          }
        ]
      }
    }
  ],
  "constants": [
    {
      "name": "gameSeed",
      "type": "bytes",
      "value": "[103, 97, 109, 101]"
    },
    {
      "name": "playerSeed",
      "type": "bytes",
      "value": "[112, 108, 97, 121, 101, 114]"
    },
    {
      "name": "vaultSeed",
      "type": "bytes",
      "value": "[118, 97, 117, 108, 116]"
    }
  ]
};
