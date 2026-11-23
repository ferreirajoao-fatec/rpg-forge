-- CreateTable
CREATE TABLE "AvatarPortrait" (
    "id" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "pathname" TEXT NOT NULL,
    "style" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "model" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AvatarPortrait_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AvatarPortrait_characterId_createdAt_idx" ON "AvatarPortrait"("characterId", "createdAt");

-- CreateIndex
CREATE INDEX "AvatarPortrait_ownerId_idx" ON "AvatarPortrait"("ownerId");

-- CreateIndex
CREATE INDEX "AuditLog_userId_action_createdAt_idx" ON "AuditLog"("userId", "action", "createdAt");

-- AddForeignKey
ALTER TABLE "AvatarPortrait" ADD CONSTRAINT "AvatarPortrait_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AvatarPortrait" ADD CONSTRAINT "AvatarPortrait_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
