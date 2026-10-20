import { NextResponse } from "next/server";
import { HttpError } from "./store";

export async function handle(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error(e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}

export const json = (data: unknown, init?: number) => NextResponse.json(data, { status: init ?? 200, headers: { "Cache-Control": "no-store" } });
