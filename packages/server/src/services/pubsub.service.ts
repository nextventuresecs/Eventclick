import Redis from "ioredis";
import { env } from "../config/env";
import { logger } from "../utils/logger";

class PubSubService {
  private publisher: Redis;
  private subscriber: Redis;

  constructor() {
    this.publisher = new Redis(env.REDIS_URL);
    this.subscriber = new Redis(env.REDIS_URL);

    this.publisher.on("error", (err: any) => {
      logger.error({ err }, "Redis Publisher Error");
    });

    this.subscriber.on("error", (err: any) => {
      logger.error({ err }, "Redis Subscriber Error");
    });
  }

  /**
   * Publish a message to a specific channel
   */
  public async publish(channel: string, message: any): Promise<number> {
    const payload = typeof message === "string" ? message : JSON.stringify(message);
    return this.publisher.publish(channel, payload);
  }

  /**
   * Subscribe to a channel and execute a callback when a message is received.
   * Returns a function to unsubscribe from the channel.
   */
  public subscribe(channel: string, callback: (message: string) => void): () => void {
    // Subscribe if not already subscribed to this channel by this client
    this.subscriber.subscribe(channel, (err: any, count: any) => {
      if (err) {
        logger.error({ err, channel }, "Failed to subscribe to channel");
      }
    });

    const messageHandler = (ch: string, message: string) => {
      if (ch === channel) {
        callback(message);
      }
    };

    this.subscriber.on("message", messageHandler);

    // Return unsubscribe function
    return () => {
      this.subscriber.off("message", messageHandler);
      // We only unsubscribe from Redis if no other listeners for this channel exist on this subscriber
      // For simplicity in this implementation, we assume per-user distinct channels
      this.subscriber.unsubscribe(channel).catch((err: any) => {
        logger.error({ err, channel }, "Failed to unsubscribe from channel");
      });
    };
  }

  /**
   * Close connections gracefully
   */
  public async close() {
    await this.publisher.quit();
    await this.subscriber.quit();
  }
}

export const pubsub = new PubSubService();
