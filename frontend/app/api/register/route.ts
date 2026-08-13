import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import clientPromise from '@/lib/mongodb';

export async function POST(req: Request) {
  try {
    const { name, email, password } = await req.json();

    if (!name?.trim() || !email?.trim() || !password) {
      return NextResponse.json({ error: 'Name, email and password are required' }, { status: 400 });
    }
    if (password.length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 });
    }

    const client = await clientPromise;
    const users = client.db().collection('users');
    const normalizedEmail = String(email).trim().toLowerCase();

    const existing = await users.findOne({ email: normalizedEmail });
    if (existing) {
      return NextResponse.json({ error: 'Email is already registered. Try logging in.' }, { status: 409 });
    }

    const hash = await bcrypt.hash(password, 10);
    await users.insertOne({
      name: String(name).trim(),
      email: normalizedEmail,
      emailVerified: null,
      image: null,
      password: hash,
      createdAt: new Date(),
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[register] failed:', err);
    return NextResponse.json({ error: 'Registration failed. Please try again.' }, { status: 500 });
  }
}
