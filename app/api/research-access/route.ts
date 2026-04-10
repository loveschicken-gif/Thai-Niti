import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const { passcode } = (await request.json()) as { passcode?: string };
  const correct = process.env.RESEARCH_PASSCODE;

  if (!correct) {
    return NextResponse.json({ error: "ระบบไม่พร้อมใช้งาน" }, { status: 503 });
  }

  if (passcode === correct) {
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: false }, { status: 401 });
}
