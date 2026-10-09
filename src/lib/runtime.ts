import "server-only";
import { explanationProvider } from "./ai/runtime";
import { createHandlers } from "./engine/http";
import { binaryTreeAdapter } from "./fixtures/binary-tree";

export const handlers = createHandlers({ "binary-tree-demo": binaryTreeAdapter }, explanationProvider);
