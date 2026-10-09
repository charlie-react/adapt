import { learningHandlers } from "@/lib/learning/http";
export const runtime = "nodejs";
export const maxDuration = 750;
export const POST = learningHandlers.upload;
export const GET = learningHandlers.read;
export const DELETE = learningHandlers.remove;
