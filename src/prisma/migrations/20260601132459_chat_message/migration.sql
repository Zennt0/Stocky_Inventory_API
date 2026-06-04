-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" SERIAL NOT NULL,
    "text" TEXT NOT NULL,
    "isUser" BOOLEAN NOT NULL,
    "isAlert" BOOLEAN NOT NULL DEFAULT false,
    "isHappy" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);
