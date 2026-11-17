"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/browser";

export function GoogleSignInButton() {
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function signIn() {
    setLoading(true);
    setErrorMessage("");
    try {
      const { error } = await createClient().auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: window.location.origin + "/auth/callback" }
      });
      if (error) throw error;
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Google 로그인을 시작하지 못했습니다.");
      setLoading(false);
    }
  }

  return (
    <div>
      <button type="button" className="action w-full" onClick={signIn} disabled={loading}>
        {loading ? "Google 연결 중..." : "Google 계정으로 로그인"}
      </button>
      {errorMessage && <p role="alert" className="mt-3 text-sm text-red-300">{errorMessage}</p>}
    </div>
  );
}
