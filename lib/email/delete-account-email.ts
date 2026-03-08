type DeleteAccountEmailOptions = {
  deleteUrl: string
}

export function buildDeleteAccountEmail({ deleteUrl }: DeleteAccountEmailOptions): { subject: string, html: string } {
  return {
    subject: 'Confirm Account Deletion - letsboulder',
    html: `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Confirm Account Deletion</title>
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
              <h1 style="margin:0 0 16px; font-size:20px; font-weight:600; color:#18181b; letter-spacing:-0.3px;">Confirm Account Deletion</h1>
              <p style="margin:0 0 24px; color:#52525b; line-height:1.6; font-size:15px;">
                You requested to delete your letsboulder account. This action <strong>cannot be undone</strong>.
              </p>
              <table role="presentation" border="0" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="border-radius:6px; background-color:#dc2626;">
                    <a href="${deleteUrl}" style="display:block; padding:14px 28px; color:#ffffff; text-decoration:none; font-weight:500; font-size:15px;">Delete My Account</a>
                  </td>
                </tr>
              </table>
              <p style="margin:24px 0 0; color:#a1a1aa; font-size:13px; line-height:1.5;">
                This link will expire in 10 minutes.<br>
                If you didn't request this, you can safely ignore this email.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color:#f4f4f5; padding:20px 32px; text-align:center; border-top:1px solid:#e4e4e7;">
              <p style="margin:0; color:#71717a; font-size:12px; letter-spacing:0.5px;">letsboulder</p>
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
