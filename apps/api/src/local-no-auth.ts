import type { Actor } from "@rakazo/contracts";
import type { PrismaClient } from "@rakazo/db";
import { bootstrapUserSpace, requireMembership, runAsSystem } from "@rakazo/db";

/**
 * Local single-user development only. Never set RAKAZO_LOCAL_NO_AUTH in a deployment:
 * it signs every request in as the same account and skips registration and sign-in.
 */
export function localNoAuthEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.RAKAZO_LOCAL_NO_AUTH === "true" && env.NODE_ENV !== "production";
}

export const LOCAL_USER = {
  id: "local-owner",
  name: "Local owner",
  email: "local@rakazo.local",
} as const;

export const LOCAL_SESSION_ID = "local-session";

let localActorPromise: Promise<Actor> | undefined;

async function ensureLocalActor(prisma: PrismaClient): Promise<Actor> {
  await prisma.user.upsert({
    where: { id: LOCAL_USER.id },
    create: {
      id: LOCAL_USER.id,
      name: LOCAL_USER.name,
      email: LOCAL_USER.email,
      emailVerified: true,
    },
    update: {},
  });
  await bootstrapUserSpace(
    prisma,
    { id: LOCAL_USER.id },
    {
      signupsEnabled: "false",
      signupAllowlist: "",
    },
  );
  return requireMembership(prisma, LOCAL_USER.id);
}

export function localActor(prisma: PrismaClient): Promise<Actor> {
  localActorPromise ??= runAsSystem("local no-auth bootstrap", () =>
    ensureLocalActor(prisma),
  ).catch((error: unknown) => {
    // A transient database failure must not poison every later request.
    localActorPromise = undefined;
    throw error;
  });
  return localActorPromise;
}

export async function localAuthSession(prisma: PrismaClient) {
  const actor = await localActor(prisma);
  const now = new Date();
  return {
    session: {
      id: LOCAL_SESSION_ID,
      token: LOCAL_SESSION_ID,
      userId: actor.userId,
      expiresAt: new Date(now.getTime() + 365 * 24 * 60 * 60_000).toISOString(),
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      ipAddress: "127.0.0.1",
      userAgent: "rakazo-local",
    },
    user: {
      id: actor.userId,
      name: LOCAL_USER.name,
      email: actor.email || LOCAL_USER.email,
      emailVerified: true,
      image: null,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    },
  };
}
