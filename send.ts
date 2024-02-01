import {
  Address,
  Cell,
  TupleReader,
  internal,
  parseTuple,
  toNano,
  BitReader,
  BitString,
} from "@ton/core";
import {
  getSecureRandomBytes,
  keyPairFromSeed,
  mnemonicToWalletKey,
} from "@ton/crypto";
import axios from "axios";
import {
  LiteClient,
  LiteRoundRobinEngine,
  LiteSingleEngine,
} from "ton-lite-client";
import { execSync } from "child_process";
import fs from "fs";
import { WalletContractV4 } from "@ton/ton";
import dotenv from "dotenv";
import crypto from "crypto";

dotenv.config();
dotenv.config({ path: "config.txt" });

const mySeeds: string[] = [];
let counter = 0;
while (true) {
  if (counter === 0) mySeeds.push(process.env.SEED as string);
  else {
    if (process.env[`SEED${counter}`])
      mySeeds.push(process.env[`SEED${counter}`] as string);
    else break;
  }
  counter++;
}
const mySeed = mySeeds[crypto.randomInt(mySeeds.length)];

const totalDiff = BigInt(
  "115792089237277217110272752943501742914102634520085823245724998868298727686144"
);

const givers = [
  { address: "EQDSGvoktoIRTL6fBEK_ysS8YvLoq3cqW2TxB_xHviL33ex2", reward: 1000 },
  { address: "EQCvMmHhSYStEtUAEDrpV39T2GWl-0K-iqCxSSZ7I96L4yow", reward: 1000 },
  { address: "EQBvumwjKe7xlrjc22p2eLGT4UkdRnrmqmcEYT94J6ZCINmt", reward: 1000 },
  { address: "EQDEume45yzDIdSy_Cdz7KIKZk0HyCFIr0yKdbtMyPfFUkbl", reward: 1000 },
  { address: "EQAO7jXcX-fJJZl-kphbpdhbIDUqcAiYcAr9RvVlFl38Uatt", reward: 1000 },
  { address: "EQAvheS_G-U57CE55UlwF-3M-cc4cljbLireYCmAMe_RHWGF", reward: 1000 },
  { address: "EQCba5q9VoYGgiGykVazOUZ49UK-1RljUeZgU6E-bW0bqF2Z", reward: 1000 },
  { address: "EQCzT8Pk1Z_aMpNukdV-Mqwc6LNaCNDt-HD6PiaSuEeCD0hV", reward: 1000 },
  { address: "EQDglg3hI89dySlr-FR_d1GQCMirkLZH6TPF-NeojP-DbSgY", reward: 1000 },
  { address: "EQDIDs45shbXRwhnXoFZg303PkG2CihbVvQXw1k0_yVIqxcA", reward: 1000 }, // 1000

  {
    address: "EQDcOxqaWgEhN_j6Tc4iIQNCj2dBf9AFm0S9QyouwifYo9KD",
    reward: 10000,
  },
  {
    address: "EQAjYs4-QKve9gtwC_HrKNR0Eaqhze4sKUmRhRYeensX8iu3",
    reward: 10000,
  },
  {
    address: "EQBGhm8bNil8tw4Z2Ekk4sKD-vV-LCz7BW_qIYCEjZpiMF6Q",
    reward: 10000,
  },
  {
    address: "EQCtrloCD9BHbVT7q8aXkh-JtL_ZDvtJ5Y-eF2ahg1Ru1EUl",
    reward: 10000,
  },
  {
    address: "EQCWMIUBrpwl7OeyEQsOF9-ZMKCQ7fh3_UOvM2N5y77u8uPc",
    reward: 10000,
  },
  {
    address: "EQD_71XLqY8nVSf4i5pqGsCjz6EUo2kQEEQq0LUAgg6AHolO",
    reward: 10000,
  },
];

async function retryAsyncOperation(operation, maxRetries = 1000, delay = 500) {
  let attempts = 0;
  while (attempts < maxRetries) {
    try {
      return await operation();
    } catch (error) {
      attempts++;
      if (attempts >= maxRetries) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

let lc: LiteClient | undefined = undefined;
let createLiteClient: Promise<void>;

let bestGiver: { address: string; coins: number } = { address: "", coins: 0 };
async function updateBestGivers(liteClient: LiteClient, myAddress: Address) {
  const lastInfo = await retryAsyncOperation(() =>
    liteClient.getMasterchainInfo()
  );

  let giversWithCoinsPerHash: { address: string; coins: number }[] = [];

  const allowShards = false;

  const whitelistGivers = allowShards
    ? [...givers]
    : givers.filter((giver) => {
        const shardMaxDepth = 1;
        const giverAddress = Address.parse(giver.address);
        const myShard = new BitReader(
          new BitString(myAddress.hash, 0, 1024)
        ).loadUint(shardMaxDepth);
        const giverShard = new BitReader(
          new BitString(giverAddress.hash, 0, 1024)
        ).loadUint(shardMaxDepth);

        if (myShard === giverShard) {
          return true;
        }

        return false;
      });

  await Promise.all(
    whitelistGivers.map(async (giver) => {
      const powInfo = await liteClient.runMethod(
        Address.parse(giver.address),
        "get_pow_params",
        Buffer.from([]),
        lastInfo.last
      );
      const powStack = Cell.fromBase64(powInfo.result as string);
      const stack = parseTuple(powStack);

      const reader = new TupleReader(stack);
      const seed = reader.readBigNumber();
      const complexity = reader.readBigNumber();
      const iterations = reader.readBigNumber();

      const hashes = totalDiff / complexity;
      const coinsPerHash = giver.reward / Number(hashes);

      giversWithCoinsPerHash.push({
        address: giver.address,
        coins: coinsPerHash,
      });
    })
  );

  giversWithCoinsPerHash.sort((a, b) => b.coins - a.coins);

  bestGiver =
    giversWithCoinsPerHash.length > 0
      ? giversWithCoinsPerHash[2]
      : { address: "", coins: 0 };
}

let go = true;
let i = 0;
async function main() {
  const keyPair = await mnemonicToWalletKey(mySeed.split(" "));
  const liteClient = await getLiteClient(
    "https://ton-blockchain.github.io/global.config.json"
  );

  const wallet = WalletContractV4.create({
    workchain: 0,
    publicKey: keyPair.publicKey,
  });
  const opened = liteClient.open(wallet);

  await updateBestGivers(liteClient, wallet.address);

  setInterval(() => {
    updateBestGivers(liteClient, wallet.address);
  }, 1000);

  while (go) {
    const giverAddress = bestGiver.address;
    const lastInfo = await retryAsyncOperation(() =>
      liteClient.getMasterchainInfo()
    );
    const powInfo = await retryAsyncOperation(() =>
      liteClient.runMethod(
        Address.parse(giverAddress),
        "get_pow_params",
        Buffer.from([]),
        lastInfo.last
      )
    );
    const powStack = Cell.fromBase64(powInfo.result as string);
    const stack = parseTuple(powStack);

    const reader = new TupleReader(stack);
    const seed = reader.readBigNumber();
    const complexity = reader.readBigNumber();
    const iterations = reader.readBigNumber();

    const randomName = (await getSecureRandomBytes(8)).toString("hex") + ".boc";
    const path = `bocs/${randomName}`;
    const command = `/root/Miner/pow-miner-cuda -g 0 -F 16 -t 5 ${wallet.address.toString(
      {
        urlSafe: true,
        bounceable: true,
      }
    )} ${seed} ${complexity} ${iterations} ${giverAddress} ${path}`;
    try {
      const output = execSync(command, { encoding: "utf-8", stdio: "pipe" }); // the default is 'buffer'
    } catch (e) {
      // console.error(e);
    }
    let mined: Buffer | undefined = undefined;
    try {
      mined = fs.readFileSync(path);
      fs.rmSync(path);
    } catch (e) {
      //
    }
    if (!mined) {
      console.log(`${new Date()}: not mined`, seed, i++);
    }
    if (mined) {
      const lastInfo = await retryAsyncOperation(() =>
        liteClient.getMasterchainInfo()
      );
      const powInfo = await retryAsyncOperation(() =>
        liteClient.runMethod(
          Address.parse(giverAddress),
          "get_pow_params",
          Buffer.from([]),
          lastInfo.last
        )
      );
      const powStack = Cell.fromBase64(powInfo.result as string);
      const stack = parseTuple(powStack);

      const reader = new TupleReader(stack);
      const newSeed = reader.readBigNumber();
      if (newSeed !== seed) {
        console.log("Mined already too late seed");
        continue;
      }

      console.log(`${new Date()}:     mined`, seed, i++);

      let seqno = 0;
      try {
        seqno = await opened.getSeqno();
      } catch (e) {
        //
      }
      for (let j = 0; j < 5; j++) {
        try {
          opened
            .sendTransfer({
              seqno,
              secretKey: keyPair.secretKey,
              messages: [
                internal({
                  to: giverAddress,
                  value: toNano("0.05"),
                  bounce: true,
                  body: Cell.fromBoc(mined)[0].asSlice().loadRef(),
                }),
              ],
              sendMode: 3 as any,
            })
            .catch((e) => {
              console.log("send transaction error", e);
              //
            });
          break;
        } catch (e) {
          if (j === 4) {
            throw e;
          }
          //
        }
      }
    }
  }
}
main();

export function intToIP(int: number) {
  const part1 = int & 255;
  const part2 = (int >> 8) & 255;
  const part3 = (int >> 16) & 255;
  const part4 = (int >> 24) & 255;

  return `${part4}.${part3}.${part2}.${part1}`;
}

export async function getLiteClient(_configUrl): Promise<LiteClient> {
  if (lc) {
    return lc;
  }

  if (!createLiteClient) {
    createLiteClient = (async () => {
      const liteServers = [
        {
          ip: 1608101903,
          port: 30230,
          id: {
            "@type": "pub.ed25519",
            key: "eGx3ACkKhiRkMMH5asaHbCVh+oqVVgciAdfMeh4eddo=",
          },
        },
        {
          ip: -2018154536,
          port: 49286,
          id: {
            "@type": "pub.ed25519",
            key: "nszgJvk0RTtMC/OufD0oXJ8RDOf4sdinWR/e/HMglws=",
          },
        },
        {
          ip: -2018117415,
          port: 52406,
          id: {
            "@type": "pub.ed25519",
            key: "x6GRYuBfj0wJGjadRMkmu58zTy1XKbhdZAuVPt87o6A=",
          },
        },
        {
          ip: 1608105239,
          port: 51174,
          id: {
            "@type": "pub.ed25519",
            key: "Op0xDElg9QL9mg4MD9NzHbFCB/m/9lIlGhVbVuoby9Y=",
          },
        },
      ]; //data.liteservers;
      const engines: any[] = [];

      for (const server of liteServers) {
        const ls = server;
        engines.push(
          new LiteSingleEngine({
            host: `tcp://${intToIP(ls.ip)}:${ls.port}`,
            publicKey: Buffer.from(ls.id.key, "base64"),
          })
        );
      }

      const engine = new LiteRoundRobinEngine(engines);
      const lc2 = new LiteClient({
        engine,
        batchSize: 1,
      });
      lc = lc2;
    })();
  }

  await createLiteClient;

  return lc as any;
}
