"use client";
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) { router.push("/login"); return; }

    const role = localStorage.getItem("userRole");
    if (role === "ADMIN") {
      router.push("/admin");
    } else if (role === "TEACHER") {
      router.push("/teacher");
    } else {
      router.push("/student");
    }
  }, [router]);

  return null;
}