type WelcomeEmailOptions = {
  appUrl: string
  firstName: string | null
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function buildWelcomeEmail({ appUrl, firstName }: WelcomeEmailOptions): { subject: string, html: string } {
  const safeFirstName = firstName ? escapeHtml(firstName) : null
  const greeting = safeFirstName ? `Hi ${safeFirstName}!` : 'Hi there!'

  return {
    subject: 'Welcome to letsboulder! 🧗',
    html: `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to letsboulder</title>
</head>
<body style="margin:0; padding:0; font-family: system-ui, sans-serif; background-color:#f4f4f5;">
  <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" width="100%" max-width="480" border="0" cellspacing="0" cellpadding="0" style="background-color:#ffffff; border-radius:8px; overflow:hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
          <tr>
            <td style="background-color:#18181b; padding: 24px 32px; text-align:center;">
              <span style="color:#ffffff; font-size:20px; font-weight:600; letter-spacing:-0.5px;">letsboulder</span>
            </td>
          </tr>
          <tr>
            <td style="padding: 32px 32px 24px;">
              <h1 style="margin:0 0 24px; font-size:20px; font-weight:600; color:#18181b; letter-spacing:-0.3px;">${greeting}</h1>
              <p style="margin:0 0 24px; color:#52525b; line-height:1.6; font-size:15px;">
                Welcome to letsboulder! We started as a small community project and have grown into a community-driven platform for climbers everywhere.
              </p>
              <p style="margin:0 0 32px; color:#52525b; line-height:1.6; font-size:15px;">
                Whether you're here to track your progress, discover new routes, or contribute to our growing database, we're excited to have you join us.
              </p>
              <table role="presentation" border="0" cellspacing="0" cellpadding="0" style="margin-bottom:24px;">
                <tr>
                  <td style="border-radius:6px; background-color:#18181b;">
                    <a href="${appUrl}/map" style="display:block; padding:14px 28px; color:#ffffff; text-decoration:none; font-weight:500; font-size:15px;">Explore the Map</a>
                  </td>
                </tr>
              </table>
              <p style="margin:0; color:#52525b; line-height:1.6; font-size:14px;">
                Happy climbing!<br>
                <span style="color:#71717a;">The letsboulder team</span>
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color:#f4f4f5; padding:20px 32px; text-align:center; border-top:1px solid:#e4e4e7;">
              <p style="margin:0 0 8px; color:#71717a; font-size:12px;">
                <a href="${appUrl}/about" style="color:#71717a; text-decoration:underline;">About</a> &nbsp;|&nbsp; 
                <a href="${appUrl}/map" style="color:#71717a; text-decoration:underline;">Map</a>
              </p>
              <p style="margin:0; color:#a1a1aa; font-size:11px;">letsboulder - Built by climbers, for climbers</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
  }
}
