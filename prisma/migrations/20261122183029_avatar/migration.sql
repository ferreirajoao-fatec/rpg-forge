-- CreateTable
CREATE TABLE "Avatar" (
    "id" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "assetsVersion" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Avatar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AvatarRevision" (
    "id" TEXT NOT NULL,
    "avatarId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "label" TEXT NOT NULL DEFAULT '',
    "config" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AvatarRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AvatarPreset" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AvatarPreset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Avatar_characterId_key" ON "Avatar"("characterId");

-- CreateIndex
CREATE INDEX "Avatar_ownerId_idx" ON "Avatar"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "AvatarRevision_avatarId_number_key" ON "AvatarRevision"("avatarId", "number");

-- CreateIndex
CREATE INDEX "AvatarPreset_ownerId_idx" ON "AvatarPreset"("ownerId");

-- AddForeignKey
ALTER TABLE "Avatar" ADD CONSTRAINT "Avatar_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Avatar" ADD CONSTRAINT "Avatar_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AvatarRevision" ADD CONSTRAINT "AvatarRevision_avatarId_fkey" FOREIGN KEY ("avatarId") REFERENCES "Avatar"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AvatarPreset" ADD CONSTRAINT "AvatarPreset_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
