import {
  Address,
  BitReader,
  BitString,
  Cell,
  TupleReader,
  beginCell,
  external,
  internal,
  parseTuple,
  storeMessage,
  toNano,
} from "@ton/core";
import {
  KeyPair,
  getSecureRandomBytes,
  keyPairFromSeed,
  mnemonicToWalletKey,
} from "@ton/crypto";
import { TonClient4 } from "@ton/ton";
import {
  execSync,
  exec as exec_callback,
  spawn,
  ChildProcess,
} from "child_process";
import fs from "fs";
import { WalletContractV4 } from "@ton/ton";
import dotenv from "dotenv";
import { givers1000 } from "./givers";
import {
  LiteClient,
  LiteSingleEngine,
  LiteRoundRobinEngine,
} from "ton-lite-client";
import { getLiteClient } from "./client";
import { OpenedContract } from "@ton/core";
import { promisify } from "util";
import crypto from "crypto";

const exec = promisify(exec_callback);

dotenv.config();
dotenv.config({ path: "config.txt" });

type ApiObj = LiteClient;

let givers = givers1000;
const bin = "/root/Miner/pow-miner-cuda";
let gpus = 1;
const timeout = 5;

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

const envAddress = process.env.MAIN;
let TARGET_ADDRESS: string | undefined = undefined;
if (envAddress) {
  try {
    TARGET_ADDRESS = Address.parse(envAddress).toString({
      urlSafe: true,
      bounceable: false,
    });
  } catch (e) {
    console.log("Couldnt parse target address");
    process.exit(1);
  }
}

let bestGiver: { address: string; coins: number } = { address: "", coins: 0 };
async function updateBestGivers(liteClient: ApiObj, myAddress: Address) {
  const giver = givers[Math.floor(Math.random() * givers.length)];
  bestGiver = {
    address: giver.address,
    coins: giver.reward,
  };
}

async function getPowInfo(
  liteClient: ApiObj,
  address: Address
): Promise<[bigint, bigint, bigint]> {
  const lastInfo = await liteClient.getMasterchainInfo();
  const powInfo = await liteClient.runMethod(
    address,
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

  return [seed, complexity, iterations];
}

const detectNvidiaGPUCount = async () => {
  try {
    const { stdout } = await exec("nvidia-smi -L");
    const gpuCount = (stdout.match(/GPU \d+:/g) || []).length;
    console.log(`Number of NVIDIA GPUs detected: ${gpuCount}`);
    return gpuCount;
  } catch (error) {
    console.error(`exec nvidia error: ${error}`);
    return 1;
  }
};

let go = true;
let i = 0;
let success = 0;
let lastMinedSeed: bigint = BigInt(0);
let start = Date.now();

async function main() {
  gpus = await detectNvidiaGPUCount();

  const minerOk = await testMiner(gpus);
  if (!minerOk) {
    console.log("Your miner is not working");

    process.exit(1);
  }

  let liteClient: ApiObj = await getLiteClient();

  const keyPair = await mnemonicToWalletKey(mySeed.split(" "));
  const wallet = WalletContractV4.create({
    workchain: 0,
    publicKey: keyPair.publicKey,
  });
  console.log(
    "Using v4r2 wallet",
    wallet.address.toString({ bounceable: false, urlSafe: true })
  );

  const targetAddress =
    TARGET_ADDRESS ??
    wallet.address.toString({ bounceable: false, urlSafe: true });
  console.log("Target address:", targetAddress);
  console.log("Date, time, status, seed, attempts, successes, timespent");

  try {
    await updateBestGivers(liteClient, wallet.address);
  } catch (e) {
    console.log("error", e);
    throw Error("no givers");
  }

  setInterval(() => {
    updateBestGivers(liteClient, wallet.address);
  }, 5000);

  while (go) {
    const giverAddress = bestGiver.address;
    const [seed, complexity, iterations] = await getPowInfo(
      liteClient,
      Address.parse(giverAddress)
    );
    if (seed === lastMinedSeed) {
      updateBestGivers(liteClient, wallet.address);
      await delay(200);
      continue;
    }

    const promises: any[] = [];

    let handlers: ChildProcess[] = [];

    const mined: Buffer | undefined = await new Promise(
      async (resolve, reject) => {
        let rest = gpus;
        for (let i = 0; i < gpus; i++) {
          const randomName =
            (await getSecureRandomBytes(8)).toString("hex") + ".boc";
          const path = `bocs/${randomName}`;
          const command = `-g ${i} -F 128 -t ${timeout} ${targetAddress} ${seed} ${complexity} ${iterations} ${giverAddress} ${path}`;

          const procid = spawn(bin, command.split(" "), { stdio: "pipe" });

          handlers.push(procid);

          procid.on("exit", () => {
            let mined: Buffer | undefined = undefined;
            try {
              const exists = fs.existsSync(path);
              if (exists) {
                mined = fs.readFileSync(path);
                resolve(mined);
                lastMinedSeed = seed;
                fs.rmSync(path);
                for (const handle of handlers) {
                  handle.kill("SIGINT");
                }
              }
            } catch (e) {
              console.log("not mined", e);
            } finally {
              if (--rest === 0) {
                resolve(undefined);
              }
            }
          });
        }
      }
    );

    if (!mined) {
      console.log(
        `${formatTime()}: not mined`,
        seed.toString(16).slice(0, 4),
        i++,
        success,
        Math.floor((Date.now() - start) / 1000)
      );
    }

    if (mined) {
      const [newSeed] = await getPowInfo(
        liteClient,
        Address.parse(giverAddress)
      );
      if (newSeed !== seed) {
        console.log("Mined already too late seed");
        continue;
      }

      console.log(
        `${formatTime()}:     mined`,
        seed.toString(16).slice(0, 4),
        i++,
        ++success,
        Math.floor((Date.now() - start) / 1000)
      );
      let seqno = 0;

      let w = liteClient.open(wallet);
      try {
        seqno = await CallForSuccess(() => w.getSeqno());
      } catch (e) {}

      await sendMinedBoc(
        wallet,
        seqno,
        keyPair,
        giverAddress,
        Cell.fromBoc(mined)[0].asSlice().loadRef()
      );
    }
  }
}
main();

async function sendMinedBoc(
  wallet: WalletContractV4,
  seqno: number,
  keyPair: KeyPair,
  giverAddress: string,
  boc: Cell
) {
  const wallets: OpenedContract<WalletContractV4>[] = [];

  const liteServerClient = await getLiteClient();
  const w1 = liteServerClient.open(wallet);
  wallets.push(w1);

  for (let i = 0; i < 3; i++) {
    for (const w of wallets) {
      w.sendTransfer({
        seqno,
        secretKey: keyPair.secretKey,
        messages: [
          internal({
            to: giverAddress,
            value: toNano("0.05"),
            bounce: true,
            body: boc,
          }),
        ],
        sendMode: 3 as any,
      }).catch((e) => {
        //
      });
    }
  }
}

async function testMiner(gpus: number): Promise<boolean> {
  for (let i = 0; i < gpus; i++) {
    const gpu = i;
    const randomName = (await getSecureRandomBytes(8)).toString("hex") + ".boc";
    const path = `bocs/${randomName}`;
    const command = `${bin} -g ${gpu} -F 128 -t ${timeout} kQBWkNKqzCAwA9vjMwRmg7aY75Rf8lByPA9zKXoqGkHi8SM7 229760179690128740373110445116482216837 53919893334301279589334030174039261347274288845081144962207220498400000000000 10000000000 kQBWkNKqzCAwA9vjMwRmg7aY75Rf8lByPA9zKXoqGkHi8SM7 ${path}`;
    try {
      execSync(command, { encoding: "utf-8", stdio: "pipe" });
    } catch (e) {}
    let mined: Buffer | undefined = undefined;
    try {
      mined = fs.readFileSync(path);
      fs.rmSync(path);
    } catch (e) {}
    if (!mined) {
      return false;
    }
  }

  return true;
}

export async function CallForSuccess<T extends (...args: any[]) => any>(
  toCall: T,
  attempts = 100,
  delayMs = 200
): Promise<ReturnType<T>> {
  if (typeof toCall !== "function") {
    throw new Error("unknown input");
  }

  let i = 0;
  let lastError: unknown;

  while (i < attempts) {
    try {
      const res = await toCall();
      return res;
    } catch (err) {
      lastError = err;
      i++;
      await delay(delayMs);
    }
  }

  console.log("error after attempts", i);
  throw lastError;
}

export function delay(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function formatTime() {
  return new Date().toLocaleTimeString("en-US", {
    hour12: false,
    hour: "numeric",
    minute: "numeric",
    day: "numeric",
    month: "numeric",
    year: "numeric",
    second: "numeric",
  });
}
