# TypeRival authentication emails

Prepared templates; **not active in hosted Supabase yet**. Production currently uses Supabase's default SMTP, which locks customization on this Free project.

Configure a verified custom SMTP provider before applying these subjects and HTML bodies in Authentication → Emails → Templates. Suggested sender display name: TypeRival. Use a verified sender address on typerival.com; do not enable SMTP until domain verification and credentials are ready.

| Template | Subject |
| --- | --- |
| confirmation.html | Confirm your TypeRival account |
| recovery.html | Reset your TypeRival password |
| magic_link.html | Your TypeRival sign-in link |
| invite.html | You’re invited to TypeRival |
| email_change.html | Confirm your TypeRival email change |
| reauthentication.html | Your TypeRival verification code |

Keep the ConfirmationURL and Token placeholders intact. These preserve Supabase's verification and existing application redirect behavior. Never hardcode a live token or replace the action link with the homepage. Disable SMTP provider click tracking so authentication links are not rewritten.

After activation, test signup confirmation and password reset with a controlled mailbox, including the landing page and completed account action. No email has been sent by preparing these files.

References: https://supabase.com/docs/guides/auth/auth-email-templates and https://supabase.com/docs/guides/auth/auth-smtp
