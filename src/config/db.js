import prisma from "./prisma.js";
import logger from "./logger.js";

async function connect() {
  try {
    await prisma.$connect();
    logger.info("Prisma connected");
  } catch (err) {
    logger.error({ err }, "Prisma connection error");
    throw err;
  }
}

async function disconnect() {
  try {
    await prisma.$disconnect();
    logger.info("Prisma disconnected");
  } catch (err) {
    logger.error({ err }, "Prisma disconnect error");
  }
}

export { prisma, connect, disconnect };

export default prisma;
