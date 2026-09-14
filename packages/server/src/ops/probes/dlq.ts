import type { SQSClient } from "@aws-sdk/client-sqs";

export interface DlqReader {
  approximateMessages(queueUrl: string, signal: AbortSignal): Promise<number>;
}

type Sqs = { sdk: typeof import("@aws-sdk/client-sqs"); client: SQSClient };

/**
 * SQS through the EC2 instance role (default credential chain). The SDK is
 * loaded on first use: ops-server runs under a 160M limit, and without
 * OPS_SQS_DLQ_URL the probe is disabled and the client never loads.
 */
export function createSqsDlqReader(region: string): DlqReader {
  let sqs: Promise<Sqs> | undefined;

  return {
    async approximateMessages(queueUrl, signal) {
      sqs ??= import("@aws-sdk/client-sqs").then((sdk) => ({
        sdk,
        client: new sdk.SQSClient({ region, useQueueUrlAsEndpoint: true }),
      }));
      const { sdk, client } = await sqs;

      const out = await client.send(
        new sdk.GetQueueAttributesCommand({ QueueUrl: queueUrl, AttributeNames: ["ApproximateNumberOfMessages"] }),
        { abortSignal: signal },
      );
      const n = Number(out.Attributes?.ApproximateNumberOfMessages);
      if (!Number.isFinite(n)) throw new Error("ApproximateNumberOfMessages missing");
      return n;
    },
  };
}
