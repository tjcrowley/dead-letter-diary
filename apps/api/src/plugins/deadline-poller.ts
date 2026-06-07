import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import { checkDeadlines } from "../lib/deadline-engine.js";

async function deadlinePollerPlugin(fastify: FastifyInstance): Promise<void> {
  let intervalId: ReturnType<typeof setInterval> | undefined;

  fastify.addHook("onReady", async () => {
    intervalId = setInterval(() => {
      checkDeadlines(fastify.pg, fastify.log).catch((err) => {
        fastify.log.error({ err }, "deadline-poller: unhandled error in checkDeadlines");
      });
    }, 60_000);

    fastify.log.info("deadline-poller: started (60s interval)");
  });

  fastify.addHook("onClose", async () => {
    if (intervalId !== undefined) {
      clearInterval(intervalId);
      fastify.log.info("deadline-poller: stopped");
    }
  });
}

export default fp(deadlinePollerPlugin, {
  name: "deadline-poller",
  dependencies: ["db"],
});
