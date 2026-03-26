const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=UTF-8" }
  });

export async function onRequestPost(context) {
  try {
    const { request, env } = context;

    // 1) Only accept HTML form submits
    const contentType = request.headers.get("Content-Type") || "";
    const isForm =
      contentType.includes("application/x-www-form-urlencoded") ||
      contentType.includes("multipart/form-data");

    if (!isForm) {
      return json({ ok: false, error: "Unsupported content type" }, 415);
    }

    const formData = await request.formData();

    // 2) Honeypot check
    const honey = formData.get("company_website");
    if (honey && String(honey).trim() !== "") {
      return json({ ok: true }, 200);
    }

    // 3) Extract fields
    const name = String(formData.get("name") || "").trim();
    const email = String(formData.get("email") || "").trim();
    const phone = String(formData.get("phone") || "").trim();

    const intent = String(formData.get("intent") || "").trim(); // inquiry type
    const message = String(formData.get("message") || "").trim(); // optional

    const sourcePage = String(formData.get("source_page") || "").trim();
    const consent = String(formData.get("consent") || "").trim(); // "yes" when checked

    // 4) Server-side validation
    if (!name || !email || !phone) {
      return json({ ok: false, error: "Missing required fields" }, 400);
    }
    if (!intent) {
      return json({ ok: false, error: "Missing inquiry type" }, 400);
    }
    if (consent !== "yes") {
      return json({ ok: false, error: "Consent required" }, 400);
    }

    // 5) Length guards
    if (
      name.length > 200 ||
      email.length > 200 ||
      phone.length > 50 ||
      intent.length > 80 ||
      sourcePage.length > 100 ||
      message.length > 5000
    ) {
      return json({ ok: false, error: "Payload too large" }, 413);
    }

    // 6) Env vars
    const TO_EMAIL = env.TO_EMAIL;
    const FROM_EMAIL = env.FROM_EMAIL;
    const MAILCHANNELS_API_KEY = env.MAILCHANNELS_API_KEY;

    if (!TO_EMAIL || !FROM_EMAIL) {
      return json(
        { ok: false, error: "Server not configured: TO_EMAIL/FROM_EMAIL missing" },
        500
      );
    }
    if (!MAILCHANNELS_API_KEY) {
      return json(
        { ok: false, error: "Server not configured: MAILCHANNELS_API_KEY missing" },
        500
      );
    }

    // 7) Metadata
    const ip =
      request.headers.get("cf-connecting-ip") ||
      request.headers.get("x-forwarded-for") ||
      "";
    const ua = request.headers.get("user-agent") || "";
    const url = new URL(request.url);

    // 8) Compose email
    const emailBody =
`New inquiry from drozq.com/contact

IDENTITY
Name: ${name}
Email: ${email}
Phone: ${phone}

INQUIRY
Type: ${intent}

NOTES
${message || "—"}

META
Source page: ${sourcePage || "contact"}
Endpoint: ${url.pathname}
IP: ${ip || "—"}
User-Agent: ${ua || "—"}
Consent: ${consent}
`;

    // 9) Send (MailChannels)
    const sendReq = new Request("https://api.mailchannels.net/tx/v1/send", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "X-Api-Key": MAILCHANNELS_API_KEY,
        "Accept": "application/json"
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: TO_EMAIL }] }],
        from: { email: FROM_EMAIL, name: "drozq.com Lead Form" },
        reply_to: { email, name },
        subject: `New Inquiry (${intent}): ${name}`,
        content: [{ type: "text/plain", value: emailBody }]
      })
    });

    const resp = await fetch(sendReq);
    const respText = await resp.text().catch(() => "");

    if (!resp.ok) {
      return json(
        { ok: false, error: "Email failed", provider_status: resp.status, provider_body: respText },
        502
      );
    }

    // 10) Optional Zapier forward
    if (env.ZAPIER_WEBHOOK_URL) {
      context.waitUntil(
        fetch(env.ZAPIER_WEBHOOK_URL, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name,
            email,
            phone,
            intent,
            message,
            source_page: sourcePage || "contact",
            consent,
            ip,
            user_agent: ua
          })
        })
      );
    }

    return json({ ok: true }, 200);
  } catch (err) {
    return json({ ok: false, error: "Server error" }, 500);
  }
}
