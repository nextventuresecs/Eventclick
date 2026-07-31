import { type RedisClientType } from "redis";
import { redisClient } from "../config/redis";
import { logger } from "../utils/logger";

class PubSubService {
  private publisher: RedisClientType | null = null;
  private subscriber: RedisClientType | null = null;

  constructor() {
    this.init();
  }

  private async init() {
    this.publisher = redisClient.duplicate() as RedisClientType;
    this.subscriber = redisClient.duplicate() as RedisClientType;

    this.publisher.on("error", (err: any) => {
      logger.error({ err }, "Redis Publisher Error");
    });

    this.subscriber.on("error", (err: any) => {
      logger.error({ err }, "Redis Subscriber Error");
    });

    await Promise.all([this.publisher.connect(), this.subscriber.connect()]);
  }

  /**
   * Publish a message to a specific channel
   */
  public async publish(channel: string, message: any): Promise<number> {
    if (!this.publisher) return 0;
    const payload = typeof message === "string" ? message : JSON.stringify(message);
    return this.publisher.publish(channel, payload);
  }

  /**
   * Subscribe to a channel and execute a callback when a message is received.
   * Returns a function to unsubscribe from the channel.
   */
  public subscribe(channel: string, callback: (message: string) => void): () => void {
    if (!this.subscriber) return () => {};

    const messageHandler = (message: string) => {
      callback(message);
    };

    this.subscriber.subscribe(channel, messageHandler).catch((err: any) => {
      logger.error({ err, channel }, "Failed to subscribe to channel");
    });

    // Return unsubscribe function
    return () => {
      if (!this.subscriber) return;
      this.subscriber.unsubscribe(channel, messageHandler).catch((err: any) => {
        logger.error({ err, channel }, "Failed to unsubscribe from channel");
      });
    };
  }

  /**
   * Close connections gracefully
   */
  public async close() {
    if (this.publisher) await this.publisher.quit();
    if (this.subscriber) await this.subscriber.quit();
  }
}

export const pubsub = new PubSubService();
