const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_mail/gmail/v1";

function b64url(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function sendGmail(opts: {
  to: string;
  subject: string;
  html: string;
}): Promise<{ ok: boolean; status: number; details?: string }> {
  const lovableKey = Deno.env.get("LOVABLE_API_KEY");
  const connKey = Deno.env.get("GOOGLE_MAIL_API_KEY");
  if (!lovableKey || !connKey) {
    return { ok: false, status: 0, details: "Connexion e-mail non configurée." };
  }

  const raw = b64url(
    [
      `To: ${opts.to}`,
      `Subject: =?UTF-8?B?${btoa(unescape(encodeURIComponent(opts.subject)))}?=`,
      'Content-Type: text/html; charset="UTF-8"',
      "MIME-Version: 1.0",
      "",
      opts.html,
    ].join("\r\n"),
  );

  const res = await fetch(`${GATEWAY_URL}/users/me/messages/send`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": connKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw }),
  });

  if (!res.ok) {
    const details = await res.text();
    console.error(`[send-gmail] failed [${res.status}]: ${details}`);
    return { ok: false, status: res.status, details };
  }
  return { ok: true, status: res.status };
}

export function welcomeEmailHtml(params: {
  username: string;
  email: string;
  password: string;
  role: string;
  appUrl: string;
}): string {
  const roleLabel = params.role === "super_admin"
    ? "Super Administrateur"
    : params.role === "coop_admin"
    ? "Administrateur de coopérative"
    : "Agent";
  return `
<div style="font-family:Arial,Helvetica,sans-serif;background:#F5F7FB;padding:24px">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:16px;padding:28px">
    <h1 style="color:#1B2A5B;font-size:20px;margin:0 0 16px">Bienvenue sur la plateforme</h1>
    <p style="color:#333;font-size:14px">Bonjour <strong>${params.username}</strong>,</p>
    <p style="color:#333;font-size:14px">Votre compte <strong>${roleLabel}</strong> a été créé. Voici vos accès :</p>
    <div style="background:#F5F7FB;border-radius:12px;padding:16px;margin:16px 0">
      <p style="margin:0 0 8px;color:#1B2A5B;font-size:14px">Identifiant : <strong>${params.email}</strong></p>
      <p style="margin:0;color:#1B2A5B;font-size:14px">Mot de passe temporaire : <strong>${params.password}</strong></p>
    </div>
    <p style="color:#333;font-size:14px">Pour des raisons de sécurité, modifiez ce mot de passe dès votre première connexion.</p>
    <p style="margin:24px 0">
      <a href="${params.appUrl}" style="background:#1B2A5B;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:10px;font-size:14px;display:inline-block">Se connecter</a>
    </p>
    <p style="color:#888;font-size:12px">Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail.</p>
  </div>
</div>`;
}
