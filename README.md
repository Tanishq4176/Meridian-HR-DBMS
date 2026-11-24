# Meridian HR

Meridian HR is an employee operations workspace for people administration, attendance, leave approvals and monthly payroll. The interface has been rebuilt around a restrained, editorial operations style: warm neutral surfaces, charcoal navigation, clear data tables and muted terracotta accents.

## What is included

- HR administrator and employee sign-in with role-aware navigation.
- Employee directory and employee creation.
- Attendance records, employee self-service clock-in and CSV export.
- Leave applications, approval and rejection workflow.
- Payroll-period summaries, individual or bulk payroll calculation and itemised pay statements.
- Attendance, late-arrival and departmental payroll reports.
- An audit trail for payroll and salary-structure changes.
- MariaDB schema, sample data, stored functions, stored procedures and validation/audit triggers.
- A browser-based responsive interface with no frontend build step.

## Requirements

- Node.js 18 or newer.
- MariaDB 10.5+ or a compatible MySQL release with stored-procedure and trigger support.
- The MariaDB (`mariadb`) or MySQL (`mysql`) command-line client available on your PATH for database setup.

## Setup

1. Extract the project and open a terminal in the `meridian-hr` folder.
2. Install dependencies:

   ```bash
   npm install
   ```

3. Copy `.env.example` to `.env`. On Windows PowerShell:

   ```powershell
   Copy-Item .env.example .env
   ```

   Set a private `JWT_SECRET` (at least 32 random characters in production) and update database credentials if needed.

4. Create the schema, install database routines and load the sample organisation:

   ```bash
   npm run setup
   ```

   The setup runner detects either the `mariadb` or `mysql` command-line client. Run it from the project root; it creates and seeds the `meridian_hr` database.

5. Start the application:

   ```bash
   npm start
   ```

6. Open [http://localhost:3000](http://localhost:3000).

## Troubleshooting sign-in

If the sign-in form shows a database or configuration message, open these URLs in the same browser:

- `http://localhost:3000/api/health` should show `\"database\": \"ONLINE\"`.
- If it reports `OFFLINE`, start MariaDB/MySQL, verify the DB settings in `.env`, and run `npm run setup` from this project folder.
- If sign-in reports that `JWT_SECRET` is missing, copy `.env.example` to `.env`, set a `JWT_SECRET` value, and restart `npm start`.
- Keep the terminal where `npm start` is running open; it prints the exact database error code for local troubleshooting.

On Windows PowerShell, create the environment file with `Copy-Item .env.example .env`.

## Demo accounts

The bundled sample data contains the following demo users. Change these credentials and the JWT secret before using any real employee data.

| Role | Email | Password |
|---|---|---|
| HR administrator | `alice.morgan@meridian.local` | `Admin123!` |
| Employee | `sarah.jenkins@meridian.local` | `Employee123!` |

The sample organisation uses fictional people and records, with attendance seeded through 23 November 2026 so the current day remains available for a clock-in demo. The November 2026 pay period is open; September and October contain sample payroll runs. `npm run seed` clears and reloads the sample organisation data.

## Useful commands

```bash
npm start       # Start the Express application
npm test        # Run static smoke checks (no database needed)
npm run setup   # Create the MariaDB schema and load demo data
npm run seed    # Reset and reload the demo data only
```

## Environment variables

| Variable | Purpose | Default |
|---|---|---|
| `PORT` | HTTP port | `3000` |
| `NODE_ENV` | Runtime mode | `development` |
| `DB_HOST` | Database host | `127.0.0.1` |
| `DB_PORT` | Database port | `3306` |
| `DB_USER` | Database user | `root` |
| `DB_PASSWORD` | Database password | empty |
| `DB_NAME` | Database name | `meridian_hr` |
| `JWT_SECRET` | Token signing secret | Must be set in `.env` |
| `ALLOWED_ORIGINS` | Comma-separated browser origins | Localhost development origins |

## Notes

- The included tax function is an illustrative academic payroll calculation, not a substitute for current statutory tax rules or professional payroll software.
- `npm test` checks source syntax and expected project structure. A full integration test requires a running MariaDB instance with the setup script applied.
- No real employee information is included. Replace demo data and rotate credentials before any deployment.
