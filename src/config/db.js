import prisma from "./prisma.js";

async function connect() {
  try {
    await prisma.$connect();
    console.log("Prisma connected");
  } catch (err) {
    console.error("Prisma connection error:", err);
    throw err;
  }
}

async function disconnect() {
  try {
    await prisma.$disconnect();
    console.log("Prisma disconnected");
  } catch (err) {
    console.error("Prisma disconnect error:", err);
  }
}

export { prisma, connect, disconnect };

export default prisma;
