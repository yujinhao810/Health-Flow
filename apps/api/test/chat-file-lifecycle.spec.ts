import assert from "node:assert/strict";
import test from "node:test";
import type { AuthUser } from "../src/auth/auth.types";
import { ChatService } from "../src/chat/chat.service";
import type { PrismaService } from "../src/prisma/prisma.service";
import type { UploadsService } from "../src/uploads/uploads.service";

const user: AuthUser = {
  id: "user-a",
  email: "user@example.test",
  role: "user",
};

test("deleting a conversation cleans files that no longer have message links", async () => {
  const calls: string[] = [];
  const prisma = {
    uploadedFile: {
      findMany: async () => {
        calls.push("find-files");
        return [{ id: "file-a" }];
      },
    },
    conversation: {
      deleteMany: async () => {
        calls.push("delete-conversation");
        return { count: 1 };
      },
    },
  } as unknown as PrismaService;
  const uploads = {
    removeUnlinkedFiles: async (cleanupUser: AuthUser, ids: string[]) => {
      calls.push("cleanup-files");
      assert.equal(cleanupUser.id, user.id);
      assert.deepEqual(ids, ["file-a"]);
    },
  } as unknown as UploadsService;

  const result = await new ChatService(prisma, uploads).removeThread(
    user,
    "conversation-a",
  );

  assert.deepEqual(result, { id: "conversation-a", deleted: true });
  assert.deepEqual(calls, [
    "find-files",
    "delete-conversation",
    "cleanup-files",
  ]);
});
