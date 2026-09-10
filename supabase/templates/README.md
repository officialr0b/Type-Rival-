# TypeRival authentication emails

Production uses Supabase Auth with Resend custom SMTP. Recent confirmation and recovery deliveries verify that the branded TypeRival templates are active in hosted Supabase.

The `typerival.com` sending domain is verified in Resend with SPF and DKIM. DMARC is published in monitoring mode (`p=none`). Resend open and click tracking are disabled. The current sender is `TypeRival <noreply@typerival.com>`; move to a reply-capable address after a monitored TypeRival mailbox exists.

| Template | Subject |
| --- | --- |
| confirmation.html | Confirm your TypeRival account |
| recovery.html | Reset your TypeRival password |
| magic_link.html | Your TypeRival sign-in link |
| invite.html | You’re invited to TypeRival |
| email_change.html | Confirm your TypeRival email change |
| reauthentication.html | Your TypeRival verification code |

Keep the ConfirmationURL and Token placeholders intact. These preserve Supabase's verification and existing application redirect behavior. Never hardcode a live token or replace the action link with the homepage. Disable SMTP provider click tracking so authentication links are not rewritten.

The remaining deliverability warning is that `ConfirmationURL` points to the Supabase project domain instead of `typerival.com`. Do not replace it casually: use a tested branded confirmation page built with `TokenHash`, or a paid Supabase custom domain, before changing the live link.

After activation, test signup confirmation and password reset with a controlled mailbox, including the landing page and completed account action. No email has been sent by preparing these files.

References: https://supabase.com/docs/guides/auth/auth-email-templates and https://supabase.com/docs/guides/auth/auth-smtp
