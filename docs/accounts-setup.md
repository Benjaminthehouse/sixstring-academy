# Set up accounts (sign in on several devices)

This guide switches on accounts for your copy of Sixstring Academy, so a learner can practise on a
phone away from home and on a laptop with the guitar, with the same progress on both. It takes
about 20 minutes and costs nothing: it uses the free plan of **Supabase**, a hosted database with
sign-in built in.

Without these steps the app works exactly as before: everything is saved on each device, and Me >
Your data can move it between devices with a backup file. Accounts are always optional for the
learner too: the app never asks them to sign in before they can play.

What learners get once it is on:

- **Me > Account**: type an email address, receive a 6-digit code by email, type it in. No password.
- Lessons, XP, streak, practice journal, settings and their own songs follow them to every device
  they sign in on, usually within a few seconds.
- They can sign out (keeping or removing the progress on that device) and delete their cloud data.

You need: the Netlify site where the app is published, and a GitHub account (to sign in to Supabase).

**Check first how Netlify publishes the app.** In Netlify, open your site and click **Deploys**. If
the deploys say they come from GitHub (for example "Production: main@1a2b3c4"), Netlify builds the
app itself and this guide works as written. If you publish by dragging the `dist` folder onto
Netlify, the variables in step 7 are never used; follow "Publishing by drag and drop" at the end
instead of steps 7 and 8.

---

## 1. Create a free Supabase account and project

1. Go to **https://supabase.com** and click **Start your project**.
2. Click **Continue with GitHub** and allow access when GitHub asks.
3. If Supabase asks you to create an **organization**: give it any name (for example your own
   name), choose the **Free** plan, and click **Create organization**.
4. Click **New project**.
   - **Name**: `sixstring-academy` (any name works).
   - **Database password**: click **Generate a password**, then save it in your password manager.
     The app never needs it, but Supabase may ask for it one day.
   - **Region**: the one closest to you and your learners.
   - Click **Create new project**.
5. Wait one or two minutes while Supabase prepares the project.

## 2. Create the table the app uses

The app stores each learner's progress in one table, with rules that let every learner reach only
their own rows. One script creates it all.

1. Open the file **`supabase/schema.sql`** from this repository (on GitHub: open the repository,
   click the `supabase` folder, then `schema.sql`, then the **Copy raw file** button at the top
   right of the file).
2. In Supabase, click **SQL Editor** in the left sidebar.
3. Click **New query** (or the **+** button).
4. Paste the whole file into the editor and click **Run** (bottom right).
5. Supabase may stop and say **Potential issue detected** ("Query has destructive operation").
   That is expected: the script replaces its own rules if they already exist, and it never deletes
   anyone's data. Click **Run this query**.
6. You should see **Success. No rows returned**.

It is safe to run the script again later (after an app update, or if you are not sure you ran it):
it only adds what is missing.

## 3. Make the sign-in email show the code

Supabase's standard emails contain a link. The app uses a typed code instead, because a link
would open the phone's web browser instead of the app installed on the home screen. So the emails
must show the code.

**First, connect an email service.** New Supabase projects only let you edit the emails once they
send through your own email service (the Emails page then says "Set up custom SMTP to edit
templates"). Resend is free and quick:

1. Go to **https://resend.com** and sign up **with the email address you will sign in to the app
   with**. Until you add a web domain of your own to Resend, it only delivers to that one address:
   enough for one learner on several devices. For more learners, add and verify a domain in Resend
   (**Domains**) and use an address at that domain as the sender below.
2. In Resend, open **API Keys**, click **Create API Key**, give it any name, choose **Sending
   access**, click **Add**, and copy the key (it starts `re_` and is shown only once).
3. In Supabase, on **Authentication > Emails**, click **Set up SMTP** (or open the **SMTP Settings**
   tab), switch on **Enable custom SMTP** and fill in:
   - **Sender email address**: `onboarding@resend.dev` (or an address at your verified domain)
   - **Sender name**: `Sixstring Academy`
   - **Host**: `smtp.resend.com`
   - **Port number**: `465`
   - **Username**: `resend`
   - **Password**: the Resend key you copied
4. Click **Save changes**. The email templates can now be edited.

Then change the two emails:

1. In Supabase, click **Authentication** in the left sidebar, then **Emails** (in some versions of
   the dashboard this is called **Email Templates**).
2. Edit **two** templates the same way: **Confirm signup** (sent the first time an email address
   signs in) and **Magic Link** (sent every time after that). For each one:
   - Replace the **Subject** with:

     ```text
     Your Sixstring Academy code
     ```

   - Replace the whole **Body** (the message) with:

     ```html
     <h2>Your sign-in code</h2>
     <p>Type this code in Sixstring Academy to sign in:</p>
     <p style="font-size: 32px; font-weight: bold; letter-spacing: 6px; font-family: monospace;">{{ .Token }}</p>
     <p>The code works for one hour. If you did not ask for it, you can ignore this email.</p>
     ```

   - Click **Save**.

`{{ .Token }}` is where Supabase puts the 6-digit code. Keep it exactly as written, with the two
curly brackets on each side.

## 4. Check the sign-in settings

1. Still under **Authentication**, open **Sign In / Providers** (older dashboards: **Providers**),
   then **Email**.
2. Make sure **Enable Email provider** is on.
3. If you see **Email OTP Expiration**, leave it at `3600` seconds (one hour). If you see **Email
   OTP Length**, leave it at `6`. Click **Save** if you changed anything.
4. On the same page (or under **Authentication > Settings** in older dashboards), make sure **Allow
   new users to sign up** is on. Otherwise only people you add yourself can sign in.

## 5. Tell Supabase where the app lives

1. Under **Authentication**, open **URL Configuration**.
2. Set **Site URL** to your Netlify address, for example `https://sixstring-academy.netlify.app`
   (the address you open the app at, with `https://` and no slash at the end).
3. Under **Redirect URLs**, click **Add URL** and add the same address. Click **Save**.

## 6. Copy the two values the app needs

1. Click the **gear icon** (**Project Settings**) at the bottom of the left sidebar.
2. Open **API** (in newer dashboards: **Data API** for the address and **API Keys** for the key).
3. Copy the **Project URL**. It looks like `https://abcdefghijklm.supabase.co`, with nothing after
   `.co`. (Some pages also show an address ending in `/rest/v1`: that is not the one.)
4. Copy the **anon public** key (a long text starting `eyJ...`; in newer dashboards it is on the
   **Legacy API Keys** tab). Newer projects may show a **publishable** key starting
   `sb_publishable_` instead; that one works too. Copy the whole key: the copy button next to it
   does that.

These two values are public by design: they end up inside the web page, and the rules created in
step 2 are what protect each learner's data.

**Never copy the `service_role` key or a key marked secret (`sb_secret_...`).** That key can read
everyone's data and must never go into the app. If it ends up there by mistake, the app refuses to
use it (Me > Account then says accounts are switched off because of a secret key), but it has
still been published inside the web page, so treat it as leaked: put the anon public key in step 7
instead and publish again, then in Supabase delete that secret key and create a new one (**Project
Settings > API Keys**; for the legacy `service_role` key, follow Supabase's guide to rotating the
JWT secret, which also gives you a new anon key for step 7).

## 7. Add them to Netlify

1. Open **https://app.netlify.com** and click your site.
2. Click **Site configuration**, then **Environment variables**.
3. Click **Add a variable**, then **Add a single variable**:
   - **Key**: `VITE_SUPABASE_URL`
   - **Value**: the Project URL from step 6
   - Leave the scopes and contexts as they are, and click **Create variable**.
4. Add a second variable the same way:
   - **Key**: `VITE_SUPABASE_ANON_KEY`
   - **Value**: the anon public (or publishable) key from step 6

The names must be typed exactly as shown, in capitals.

## 8. Publish again

The app reads these values when it is built, so it needs one new build.

1. In Netlify, click **Deploys**.
2. Click **Trigger deploy**, then **Deploy site**.
3. Wait until the deploy says **Published** (a few minutes).

## 9. Try it on two devices

1. On your laptop, open the app and go to **Me > Account** (on a phone: the **Me** tab at the
   bottom, then **Account** in the row of links under the title). You should see **Your progress
   on all your devices** with an email field. If it says something else, see "When Me > Account
   says something else" below.
2. Type your email address and click **Email me a code**. The email can take a minute; look in
   the spam folder too.
3. Type the 6 digits. You are signed in, and Account says **Synced with your account**.
4. On your phone, open the app (tip: **Add to Home Screen** from the browser's share menu makes
   it feel like a normal app), go to **Me > Account** and sign in with the same email address.
5. Finish a short lesson on the phone. Within a few seconds, the laptop shows it too (or tap
   **Sync now** under Me > Account).

---

## When Me > Account says something else

- **"Accounts are not set up for this copy of the app"**: the app was built without the two
  variables. The deploy from step 8 may not have finished (reload the page once it says
  **Published**), a variable name in step 7 is misspelt, or the site is published by drag and drop
  (see the end of this guide).
- **"Accounts are set up wrongly for this copy"**: one of the two values is not right. The Project
  URL must be just `https://<letters>.supabase.co`, with `https://` and nothing after `.co`; the key
  must be the whole anon public (or publishable) key, with no spaces. Fix the variable in Netlify
  (step 7) and publish again (step 8).
- **"Accounts are switched off ... secret key"**: step 7 was given the secret key. See the warning
  at the end of step 6.

## How many sign-in emails can be sent

Each learner needs an email only when they sign in on a new device. With the email service from
step 3 connected, Supabase allows about 30 sign-in emails an hour for the whole project at first
(**Authentication > Rate Limits** shows and changes the number). If learners see "Too many sign-in
emails were sent in the last hour", that limit was reached; it resets within the hour.

Without a domain of your own, Resend only delivers to the address you signed up with. To let other
learners sign in, add a domain in Resend (**Domains**), follow its steps to verify it, and change the
**Sender email address** in Supabase's SMTP settings to an address at that domain.

Any other email service with SMTP works the same way (for example Brevo, Postmark or Amazon SES):

1. Create an account with the email service and follow its steps to verify your sending domain or
   address. It gives you an SMTP **host**, **port**, **username** and **password**.
2. In Supabase: **Authentication > Emails > SMTP Settings** (older dashboards: **Project Settings >
   Authentication > SMTP Settings**), switch on **Enable custom SMTP**, fill in those values and a
   sender address and name (for example "Sixstring Academy"), and save.
3. Then raise the email limit under **Authentication > Rate Limits**.

## Good to know

- **What is stored**: for each learner, a few small documents with their progress, practice
  journal, settings and own songs (when they fit: up to 50 songs, 2 MB in all). Never their AI
  key, never anything they recorded with the microphone. The free database (500 MB) holds
  thousands of learners.
- **A learner deleting their data**: Me > Account > **Delete cloud data** removes their documents
  and signs them out everywhere; their devices keep their progress. A small marker row remains so
  their other devices stop syncing instead of uploading the data again.
- **Removing an account completely** (for example when someone asks you to): in Supabase,
  **Authentication > Users**, find the email address, open the **...** menu and choose **Delete
  user**. Their documents are deleted with it.
- **A paused project**: on the free plan, Supabase pauses a project nobody has used for about a
  week. Learners then see that the cloud cannot be reached, and everything keeps working on their
  devices. Open the project in the Supabase dashboard and click **Restore** to wake it up.
- **"Syncing is paused because the app's cloud database is not set up yet"**: step 2 was not run,
  or did not finish. Run `supabase/schema.sql` again.
- **"Email sign-in is not switched on for this app yet"**: see step 4.
- **The email contains a link instead of a code**: one of the two templates in step 3 still has the
  old text.

## Publishing by drag and drop

Netlify uses the variables of step 7 only when it builds the app itself. If you build on your own
computer and drag the `dist` folder onto Netlify, give the values to that build instead:

1. In the app's folder (the one with `package.json`), create a text file named `.env.local` with
   these two lines, using your own values from step 6:

   ```text
   VITE_SUPABASE_URL=https://abcdefghijklm.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-public-key
   ```

2. Run `npm run build`, then drag the new `dist` folder onto your site's **Deploys** page as
   before.
3. Continue with step 9.
