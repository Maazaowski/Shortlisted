# How to set up and use Shortlisted

This guide is for someone who has never used a tool like this. You do not need to know how to code. Set aside about 30 minutes for the first setup.

## What Shortlisted does

- It shows you open jobs you can apply to from your country.
- It makes a resume and a cover letter for each job, using only what you wrote about yourself.
- It keeps a list of every job you applied to, so you know what to do next.

You still apply yourself, on the company's own website. Shortlisted does not send anything for you.

Everything stays on your computer. There is no account and no sign-up.

## What you need

1. A computer with Windows, macOS or Linux.
2. **Docker Desktop.** A free program that runs Shortlisted for you. Download it from https://www.docker.com/products/docker-desktop/, install it, and open it. Leave it open while you use Shortlisted.
3. **Google Chrome.**
4. Your current resume as a PDF or a Word file (.docx).
5. One of these, to do the writing:
   - a paid Claude plan, or
   - a paid ChatGPT plan, or
   - nothing at all. Shortlisted then works by copy and paste with any free chat assistant. It takes about one extra minute per job.

## Part 1. Install

### Step 1. Download Shortlisted

1. Open https://github.com/Maazaowski/Shortlisted in your browser.
2. Click the green **Code** button.
3. Click **Download ZIP**.
4. Open the downloaded file and unzip it. You get a folder called `Shortlisted`. Put it somewhere you will find it again, such as Documents.

### Step 2. Run the setup

Make sure Docker Desktop is open first.

**On Windows**

1. Open the `Shortlisted` folder.
2. Click the address bar at the top of the folder window, type `powershell` and press Enter. A blue or black window opens.
3. Copy this line, paste it into that window and press Enter:

```bash
powershell -ExecutionPolicy Bypass -File setup.ps1
```

**On macOS or Linux**

1. Open the Terminal app.
2. Type `cd ` (with a space after it), drag the `Shortlisted` folder into the window, and press Enter.
3. Copy this line, paste it in and press Enter:

```bash
bash setup.sh
```

### Step 3. Answer one question

The setup asks how you want the writing done.

| You type | What it means |
| --- | --- |
| 1 | Use my Claude plan. You sign in once. |
| 2 | Use my ChatGPT plan. You sign in once. |
| 3 | Copy and paste. No sign-in. This is the choice if you press Enter. |

If you chose 1 or 2, the window shows a web link. Open it, sign in, and copy the code it gives you back into the window.

The first run downloads about 1 GB, so it can take several minutes. When it finishes, Shortlisted opens in your browser. The address looks like `http://localhost:3000`. Save it as a bookmark.

## Part 2. First-time setup in the browser

A page called **Finish setting up** opens. It has four rows. Each row gets a tick when it is done.

### Row 1. A model to do the writing

This is ticked already if the setup went well. If you chose Claude or ChatGPT, click **Test it**. It should say "It answered."

### Row 2. Your resume

1. Click **Import your resume**.
2. Drop your resume file on the box, or click the box and choose the file.
3. Click **Import and build my bank**.

If you chose copy and paste, there are two more clicks:

1. Click **Copy prompt**.
2. Click **Open Claude** (or open any chat assistant you like), paste, and send.
3. Copy the whole reply, come back, paste it into the box, and click **Build my bank**.

You now have a **bank**. The bank is the list of everything you have done at work, one line at a time. Every resume Shortlisted makes is built only from these lines. It never makes up a job, a number or a skill.

### Row 3. Where you are and what you want

1. Click **Choose settings**.
2. Pick the country you live in and the country of your passport.
3. Tick the kinds of jobs you want to see:
   - **Remote.** Work from home for a company in another country.
   - **Relocate.** Jobs abroad where the company says it helps with a visa or the move.
   - **Gulf.** Office jobs in Saudi Arabia, the UAE, Qatar, Bahrain, Kuwait and Oman.
4. Tick your career fields. Leave them all empty to see every field.
5. Type the job titles you are aiming for, one per line.
6. If you like, type how many jobs you want to apply to each week.
7. Click **Save settings**.

### Row 4. The Chrome extension

The extension is a small add-on for Chrome. It lets you make a resume for any job page you are looking at, with one click.

1. On the setup page, click **latest release** and download `shortlisted-extension.zip`. Unzip it.
2. In Chrome, type `chrome://extensions` in the address bar and press Enter.
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and choose the unzipped folder.
5. Click the puzzle icon in Chrome, then the pin next to Shortlisted, so its icon stays visible.
6. Click the Shortlisted icon. If it says it cannot connect, click **Settings** inside it and type the same address you bookmarked.

Go back to the setup page and refresh it. All four rows should be ticked.

## Part 3. Make your bank better

Open **Bank** in the top menu.

- Read each line. Fix anything the import got wrong, then click **Save** on that line.
- Add lines the resume left out. Start with what you did and include a number. "Cut delivery time by 30%" is better than "Responsible for deliveries".
- In the **Skills** box of each line, type the tools and skills it shows, with commas between them.
- To fix a job's title or dates, click **Edit details** under it.

Then click **Check my CV**. It gives a score out of 100 and a list of things to fix, such as a missing country, a phone number with no country code, or lines that are too long. It only reads your bank. It changes nothing.

## Part 4. Find a job

Open **Jobs** in the top menu.

- The tabs at the top are your pools: Remote, Relocate, Gulf.
- Use **Search** for a title, a company or any word.
- Use **Career field**, **Tech only** and **Last 30 days** to narrow the list, then click **Filter**.
- Set **Order** to **Best match first** to see the jobs closest to your bank on top.
- Each job shows small tags, like "Remote, admits Pakistan" or "Visa sponsorship stated". A computer rule made each tag from the words in the job post. No person checked it. Open the job to see the exact sentence.
- "3 of 5 skills in your bank" is a rough guide to how well the job fits you.
- Click the bookmark to save a job for later. Click the eye to hide one you do not want.

The list refreshes by itself every few hours.

**Tick "Include unclear" on the Remote tab** if you want to also see remote jobs that do not say which countries they accept. Many good jobs are in this group, but you have to check them yourself.

## Part 5. Make a resume and apply

### From the Jobs page

1. Click a job to open it.
2. Click **Tailor my resume**.
3. If you use copy and paste: click **Copy prompt**, paste it into your chat assistant, copy the whole reply, paste it back, and click **Submit reply**. If you use your Claude or ChatGPT plan, just wait about 20 seconds.
4. The page now shows:
   - a fit score,
   - which asked-for skills your bank has and which it does not,
   - what changed compared with your normal resume,
   - any **flags**. A flag means a number or a tool name appeared that is not in your bank. Read each one before you send.
   - the resume as a PDF, and the cover letter.
5. Click the file name to download the resume. Click **PDF** next to the cover letter to download it, or **Copy** to copy the text.
6. Go back to the job and click **Apply on the company's page**. Fill in the form there and upload the files.

### From any job page on the web

1. Open the job page in Chrome.
2. Click the Shortlisted icon.
3. Click **Tailor for this page**.
4. When the documents are ready, click **Attach** on the application form page. It puts the resume into the upload box and the cover letter into its text box, when the form has them.

### From text someone sent you

Open **Paste** in the top menu, paste the whole job post, and click **Tailor**.

### If the result is not right

- Type a short instruction under **Regenerate**, such as "lead with the sales work", and click **Regenerate**.
- To change the cover letter yourself, click **Edit**, change the text, and click **Save**. Shortlisted checks your new text and makes a new PDF.
- If it says **Poor fit. Nothing generated.**, the job asks for skills your bank does not show. If you do have one of them, add it to a line in your bank, then come back and click **Regenerate**.

## Part 6. Keep track

Open **Board**. Each job you tailored is a card. The columns are the steps:

Saved, Generated, Applied, Screening, Interview, Offer, Rejected, Withdrawn.

Open a card to work with it.

- **After you apply**, click **Mark Applied**. Shortlisted never does this for you, because only you know you applied.
- Use **Set stage** to move it when something happens.
- Under **Contact and dates**, type the name and email of a recruiter if you find one, the interview date, and the last day to apply. Click **Save**. The dates show on the card.
- Under **Notes**, write anything you want to remember, such as the salary they mentioned.
- Under **Messages to send**, there are ready messages for each step: a note on the day you apply, a follow-up after ten days, a thank-you after an interview, a check-in if they go quiet, and a polite reply to a rejection. Fill in anything in [brackets], click **Copy**, and send it yourself.
- If a job stays in Applied for ten days with no news, the Board shows it under **Follow up**. Send the follow-up message, then click **Done**.

Open **Dashboard** to see how many jobs you applied to each week, how many got a reply, and how you are doing against your weekly goal.

## Part 7. Everyday use

**Start Shortlisted.** Open Docker Desktop, then open your bookmark. If the page does not load, open a terminal in the Shortlisted folder as in Step 2 and run:

```bash
docker compose up -d
```

**Stop it.** Your data is kept.

```bash
docker compose down
```

**Update it.** Run the first line, then the second.

```bash
docker compose pull
```

```bash
docker compose up -d
```

**Back up your data.** Open **Settings** and scroll to **Your data**. Download **Everything as JSON** and keep the file somewhere safe. The spreadsheet download gives you one row per job, which opens in Excel. Do this before you move to a new computer.

**Change light or dark mode.** Click **Appearance** at the top right.

## If something goes wrong

| What you see | What to do |
| --- | --- |
| The setup says Docker is not running | Open Docker Desktop, wait until it says it is running, and run the setup line again. |
| The browser says the page cannot be reached | Docker Desktop is closed, or Shortlisted is stopped. Open Docker Desktop and run `docker compose up -d` in the Shortlisted folder. |
| The Jobs page is empty | The list takes up to a minute the first time. Refresh the page. If a message says the list could not be downloaded, check your internet and click **Check now**. Wait five minutes before clicking it again. |
| "That PDF has almost no text. Is it a scan?" | Your resume is a picture, not text. Save it again from Word or Google Docs as a PDF, or upload the Word file. |
| "No JSON object found in the reply" | You did not copy the whole reply. Copy everything the chat assistant wrote, from the first `{` to the last `}`, and paste again. |
| "Claude Code exited with code 1" and a line about signing in | Your sign-in ran out. In a terminal in the Shortlisted folder, run `docker compose exec worker claude auth login`, then click **Regenerate**. |
| The extension says it cannot connect | Click **Settings** inside the extension and type the address from your bookmark, for example `http://localhost:3000`. |
| **Attach** says there is no file box | Open the application form first, so the upload box is on the page, then click **Attach** again. If it still fails, upload the downloaded PDF by hand. |
| A card is stuck in Saved with "Generation failed" | Open it, read the red message, and click **Regenerate**. If you do not want the job, click **Withdraw** to move it out of the way. |

## Things to know

- The tags on jobs come from computer rules. Always read the job post before you spend time on it.
- Real employers never ask you to pay a fee to apply or to get a visa. If a job asks for money, leave it.
- Shortlisted never guesses a recruiter's email. It gives you search links, and you type in what you find.
- Your data lives only on this computer. If you delete Shortlisted's data in Docker, it is gone. Download a backup first.
