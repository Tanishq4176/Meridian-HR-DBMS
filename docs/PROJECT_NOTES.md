# Project notes

## Application structure

- `src/server.js` starts the HTTP server.
- `src/app.js` configures Express, static assets and API route groups.
- `src/routes/` contains authentication, employee, attendance, leave, payroll, salary, reporting and audit endpoints.
- `src/middleware/auth.js` validates JWT sessions and employee status, and provides role/self-access helpers.
- `src/public/` contains the standalone HTML, CSS and browser JavaScript interface.
- `database/` contains the relational schema, seed records, stored routines and triggers.

## Role model

`HR_ADMIN` users can manage the employee directory, review leave requests, process payroll and access organisation-wide reports and audit events. `EMPLOYEE` users can view their own attendance, leave and pay statement records and submit time-off requests.

## Data model

The database normalises departments, employees, salary structures, attendance, leave requests, payroll periods, payroll summaries, payroll line items and audit events. Unique employee/period payroll keys prevent duplicate calculations. Database triggers apply attendance and leave validations and record key compensation changes.

## Design system

The interface uses a warm paper background, white content panels, graphite navigation, fine neutral separators and a restrained clay/terracotta accent. Status colours are reserved for operational states rather than decorative gradients. Tables and compact labels are prioritised over oversized cards.

## Boundaries

The seeded organisation is fictional. The payroll tax helper is an academic demonstration. Production use would require a statutory payroll review, stronger operational controls, HTTPS, secure secrets management, backups and a deployment-specific security assessment.
