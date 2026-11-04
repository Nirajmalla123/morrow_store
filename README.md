# Morrow storefront and admin

The storefront and admin dashboard run on the same Node server. MySQL credentials
stay in a local `.env` file and are never sent to the browser or checked in.

## 1. Configure MySQL

Install MySQL 8 and make a dedicated store account. From a MySQL administrator
session, run:

```sql
CREATE DATABASE morrow_store CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE USER 'morrow_app'@'localhost' IDENTIFIED BY 'choose-a-strong-private-password';
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, INDEX, REFERENCES ON morrow_store.* TO 'morrow_app'@'localhost';
FLUSH PRIVILEGES;
```

Copy `.env.example` to `.env` and set `DB_PASSWORD` to the password for the
MySQL account you created. Do not put database credentials in frontend files or
commit `.env`. The MySQL server can be on `localhost`; set `DB_NAME` and
`DB_USER` in `.env` if you chose different names.

## 2. Install, initialize, and start

```powershell
npm install
npm run create-admin -- admin@example.com
npm start
```

The admin-creation command asks for the password without echoing it to the
terminal. On first startup, the server creates the tables and seeds the
clothing products when the product table is empty.

Open `http://localhost:3000` for the storefront and
`http://localhost:3000/admin.html` for the admin dashboard. Sign in with the
email and password created in step 2.

## Admin features

- Add, edit, and delete products, including prices, stock, categories, and photos.
- Upload product photos (JPEG, PNG, WebP, or GIF; maximum 5 MB per image).
- Browse customer records created during checkout.
- View orders and update their status.
- Customer checkout is recorded in MySQL and stock is reduced transactionally.

The sample checkout records orders but does not process payments. Configure a
payment provider before accepting real payments.
