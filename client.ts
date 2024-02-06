import { TonClient, TonClient4 } from "@ton/ton";
import axios from "axios";
import {
  LiteClient,
  LiteSingleEngine,
  LiteRoundRobinEngine,
} from "ton-lite-client";

let lc: LiteClient | undefined = undefined;

let createLiteClient: Promise<void>;

export function intToIP(int: number) {
  const part1 = int & 255;
  const part2 = (int >> 8) & 255;
  const part3 = (int >> 16) & 255;
  const part4 = (int >> 24) & 255;

  return `${part4}.${part3}.${part2}.${part1}`;
}

export async function getLiteClient(): Promise<LiteClient> {
  if (lc) {
    return lc;
  }

  if (!createLiteClient) {
    createLiteClient = (async () => {
      const liteServers = [
        {
          ip: -2018154536,
          port: 49286,
          id: {
            "@type": "pub.ed25519",
            key: "nszgJvk0RTtMC/OufD0oXJ8RDOf4sdinWR/e/HMglws=",
          },
        },
        {
          ip: 94489629,
          port: 6774,
          id: {
            "@type": "pub.ed25519",
            key: "PAp8f+OjJdhiovOvAgLtpjdzqvX7dxvIZx23MwIfSWw=",
          },
        },
      ];
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
