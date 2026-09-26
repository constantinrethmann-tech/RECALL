# Sign-in email templates

RECALL signs you in with a 6-digit code (plus a link as backup). The code matters on iPhone:
an app installed on the home screen can't receive a link that opens in Safari, so you type the code instead.

In Supabase: **Authentication → Emails → Templates**. Change these two templates the same way:
**Magic Link** and **Confirm signup**. For each one, replace the subject and the whole body, then click **Save**.

## Subject

```
Your RECALL code: {{ .Token }}
```

## Body (switch the editor to "Source" / HTML if it asks)

```html
<div style="font-family:Helvetica,Arial,sans-serif;background:#06070A;color:#E9ECF1;padding:32px;border-radius:16px">
  <p style="letter-spacing:4px;font-size:12px;color:#8FB3FF;margin:0 0 24px">RECALL</p>
  <p style="margin:0 0 8px;color:#A7AEBA">Your sign-in code</p>
  <p style="font-size:32px;letter-spacing:8px;font-weight:bold;margin:0 0 24px">{{ .Token }}</p>
  <p style="margin:0 0 8px;color:#A7AEBA">Type it into the app. Or, on this device:</p>
  <p style="margin:0"><a href="{{ .SiteURL }}/auth/confirm/?token_hash={{ .TokenHash }}&type=email" style="color:#8FB3FF">Sign in with one tap</a></p>
</div>
```
