# ExamMock AI — Fresh Build

## 1. Install
```powershell
cd "C:\Users\user\OneDrive\Desktop\Mock_Test"
npm.cmd install
```

## 2. Create `.env`
Copy `.env.example` to `.env` and fill your own secrets. Never paste secrets into chat.

Required for login/register:
- `JWT_SECRET`
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_VERIFY_SERVICE_SID`

Required for AI paper generation:
- `OPENAI_API_KEY`
- `OPENAI_MODEL` (defaults to `gpt-6-luna`)

## 3. Real phone OTP
This build uses **Twilio Verify v2**. `Send OTP` calls Twilio and the OTP is delivered by SMS to the entered mobile number. No OTP is printed in the browser or terminal.

Create a Verify Service in Twilio and put its Service SID in `.env`. Trial accounts can have recipient restrictions; production delivery requires the provider account/compliance setup applicable to your account/country.

## 4. Run
```powershell
npm.cmd run check
node server.js
```
Open `http://localhost:3000/`.

## 5. Pool worker
- Start Mock only allocates a READY unseen paper.
- Generation is background-only.
- Worker generates one paper at a time.
- On HTTP 429 it reads `retry-after-ms` / `retry-after`, persists a cooldown in SQLite, stops the scan, and resumes after cooldown.
- Restarting the server does not bypass a persisted cooldown.
- Development target defaults to 3 papers per pool (`POOL_TARGET=3`).

## Pages
- Home: `index.htm`
- Mock Tests: `mocks.htm`
- My Tests: `my-tests.htm`
- Performance: `performance.htm`
- Dashboard: `dashboard.htm`
- CBT: `test.htm`
- Result: `result.htm`
- Detailed Solutions: `solutions.htm`
- Login/Register: `login.htm`
