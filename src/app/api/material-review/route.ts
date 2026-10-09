import { reviewHandlers } from "@/lib/material-review/http";
export const runtime = "nodejs";
export const POST = reviewHandlers.upload;
export const GET = reviewHandlers.read;
export const DELETE = reviewHandlers.remove;
